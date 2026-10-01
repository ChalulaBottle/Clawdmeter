#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>
#include <ArduinoJson.h>
#include <esp_heap_caps.h>
#include <strings.h>

#include "data.h"
#include "ui.h"
#include "ble.h"
#include "splash.h"
#include "charge_anim.h"
#include "usage_rate.h"
#include "idle.h"
#include "idle_cfg.h"
#include "brightness.h"
#ifdef FEATURE_PICTURE
#include "wifi_link.h"
#include "art.h"
#endif

#include "hal/board_caps.h"
#include "hal/display_hal.h"
#include "hal/touch_hal.h"
#include "hal/input_hal.h"
#include "hal/power_hal.h"
#include "hal/imu_hal.h"
#include "hal/sound_hal.h"

static UsageData usage = {};

// ---- LVGL draw buffers (partial render mode) ----
// PSRAM-equipped boards (S3) can comfortably hold larger strips. PSRAM-free
// boards (e.g. ESP32-C6) allocate from internal SRAM, so we shrink the strip
// — 480×20 RGB565 = 19 KB × 2 buffers = 38 KB, fits beside everything else.
#ifdef BOARD_HAS_PSRAM
#define BUF_LINES 40
#define LV_BUF_CAPS (MALLOC_CAP_SPIRAM)
#else
#define BUF_LINES 20
#define LV_BUF_CAPS (MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)
#endif
static uint16_t* buf1 = nullptr;
static uint16_t* buf2 = nullptr;

// Abstecher vom Splash auf die Auslastungszahlen: alle EVERY fuer SHOW lang.
#define USAGE_PEEK_EVERY_MS  (5UL * 60UL * 1000UL)
#define USAGE_PEEK_SHOW_MS   (60UL * 1000UL)

static uint32_t my_tick(void) { return millis(); }

static void my_flush_cb(lv_display_t* disp, const lv_area_t* area, uint8_t* px_map) {
    int32_t w = area->x2 - area->x1 + 1;
    int32_t h = area->y2 - area->y1 + 1;
    display_hal_draw_bitmap(area->x1, area->y1, w, h, (uint16_t*)px_map);
    // Letzter Streifen eines Durchlaufs: der Splash wartet darauf, bevor er
    // nach einem Screenwechsel wieder direkt auf den Panel malt.
    if (lv_display_flush_is_last(disp)) splash_note_refresh_done();
    lv_display_flush_ready(disp);
}

static void rounder_cb(lv_event_t* e) {
    lv_area_t* area = (lv_area_t*)lv_event_get_param(e);
    display_hal_round_area(&area->x1, &area->y1, &area->x2, &area->y2);
}

// Touch policy is driven by IDLE_WAKE_ON_TOUCH:
//   true  → a press edge while asleep wakes the device and the first touch is
//           swallowed (mirrors the button wake-consumption); a press while
//           awake counts as activity.
//   false → touch never counts as activity and is fully swallowed while the
//           panel is dark, so pets/sleeves can't wake it overnight and LVGL
//           can't quietly toggle splash<->usage on a black panel.
static void my_touch_cb(lv_indev_t* indev, lv_indev_data_t* data) {
    uint16_t x, y;
    bool pressed;
    touch_hal_read(&x, &y, &pressed);
    const bool raw_pressed = pressed;

    if (IDLE_WAKE_ON_TOUCH) {
        static bool touch_was = false;
        static bool touch_wake_swallowed = false;
        if (raw_pressed && !touch_was) {
            // Press edge — consume as wake if asleep.
            if (idle_consume_wake_press()) {
                touch_wake_swallowed = true;
                pressed = false;
            }
        } else if (!raw_pressed && touch_was) {
            // Release edge.
            if (touch_wake_swallowed) {
                touch_wake_swallowed = false;
                pressed = false;
            }
        } else if (raw_pressed && touch_wake_swallowed) {
            // Held finger through wake — keep hiding until release.
            pressed = false;
        }
        touch_was = raw_pressed;
    } else if (idle_is_asleep()) {
        pressed = false;
    }

    if (pressed) {
        data->point.x = x;
        data->point.y = y;
        data->state = LV_INDEV_STATE_PRESSED;
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

// Approve request from the host (a Claude Code permission prompt). Its own
// message, so the usage payload never has to carry it:
//   {"q":"<id>","qt":"Bash","qs":"git push origin main","qx":40}   show (qx = seconds left)
//   {"q":""}                                                        clear
// Returns true when the message was one of these.
static bool handle_approve_msg(const char* json) {
    if (!strstr(json, "\"q\"")) return false;   // cheap gate: usage payloads never carry "q"
    JsonDocument doc;
    if (deserializeJson(doc, json)) return false;
    if (!doc["q"].is<const char*>() || !doc["s"].isNull()) return false;
    const char* id = doc["q"] | "";
    if (!*id) {
        ui_approve_clear();
        return true;
    }
    ui_approve_show(id, doc["qt"] | "", doc["qs"] | "", doc["qx"] | 0);
    return true;
}

// Notification from the host (LabDaemon Engine, relayed by the tray). Its own
// message, like approve (plans/labdaemon.md, "Protocol"):
//   {"nt":"Build finished","nb":"fox-drama: 3 files changed","nx":8}   show (nx = seconds, default 8)
//   {"nt":"","nb":""}                                                   clear
// Returns true when the message was one of these.
static bool handle_notify_msg(const char* json) {
    if (!strstr(json, "\"nt\"")) return false;   // cheap gate: only a notification carries "nt"
    JsonDocument doc;
    if (deserializeJson(doc, json)) return false;
    if (!doc["nt"].is<const char*>() || !doc["s"].isNull()) return false;
    const char* title = doc["nt"] | "";
    const char* text  = doc["nb"] | "";
    if (!*title && !*text) {
        ui_notify_clear();
        return true;
    }
    // Any number; absent or 0 = the default. Clamped before the cast (a float
    // beyond int range has no defined conversion); a day is more than enough.
    const float secs = doc["nx"] | 0.0f;
    ui_notify_show(title, text, secs <= 0 ? 0 : secs >= 86400.0f ? 86400 : (int)(secs + 0.5f));
    return true;
}

#ifdef FEATURE_PICTURE
// ble.cpp, beside ble_send_ack: the answer to a credentials message. Declared
// here because only the handler below sends it, and only on boards with Wi-Fi.
void ble_send_wifi_reply(bool stored);

// Wi-Fi credentials from the host, for the album art (wifi_link.h). Its own
// message, like notify:
//   {"wf":"<ssid>","wp":"<password>"}   store in NVS, then join
//   {"wf":""}                            forget them and leave the network
// Returns true when the message was one of these, and has answered it then, in
// place of the plain ack or nack: {"ack":true,"wf":"ok"} stored or forgotten,
// {"err":true,"wf":"no"} not stored, because the board refused them (an SSID
// over 32 bytes, or a password that is not empty, 8 to 63 characters or 64 hex
// digits) or NVS failed; wifi_link_set says which on serial. A board without
// Wi-Fi answers the plain nack instead, so a host keeps the credentials until
// a board that can use them has answered with "wf". The password is never
// printed.
static bool handle_wifi_msg(const char* json) {
    if (!strstr(json, "\"wf\"")) return false;   // cheap gate: only credentials carry "wf"
    JsonDocument doc;
    if (deserializeJson(doc, json)) return false;
    if (!doc["wf"].is<const char*>() || !doc["s"].isNull()) return false;
    const char* ssid = doc["wf"] | "";
    if (!*ssid) {
        wifi_link_forget();
        ble_send_wifi_reply(true);
        return true;
    }
    ble_send_wifi_reply(wifi_link_set(ssid, doc["wp"] | ""));
    return true;
}

// Album art over BLE (art.h, plans/labdaemon.md "Increment 2b"): the header of
// a picture whose chunks follow on the art characteristic. Its own message:
//   {"ab":"3f9a0c1d2e4b","al":5120,"an":21}
// ab = the art id (8 to 16 of a to z and 0 to 9, the pi rule), al = its bytes
// (1 to 24576), an = its chunks (1 to 512); art_ble_begin holds the rules.
// Returns true when the board took it, which the plain ack answers; art.cpp
// answers for the picture itself on TX ("ok" or "miss"). A header it refuses
// is logged there and ends at parse_json, with its nack. A board without
// FEATURE_PICTURE has neither this nor the art characteristic, so a header
// that reached one would end there too.
static bool handle_art_header_msg(const char* json) {
    if (!strstr(json, "\"ab\"")) return false;   // cheap gate: only an art header carries "ab"
    JsonDocument doc;
    if (deserializeJson(doc, json)) return false;
    if (!doc["ab"].is<const char*>() || !doc["s"].isNull()) return false;
    // A field that is not a whole number counts as -1, which art_ble_begin refuses.
    const long bytes  = doc["al"].is<long>() ? doc["al"].as<long>() : -1;
    const long chunks = doc["an"].is<long>() ? doc["an"].as<long>() : -1;
    return art_ble_begin(doc["ab"].as<const char*>(), bytes, chunks);
}
#else
// No Wi-Fi on this board: a credentials message ends at parse_json and its
// plain nack, which tells a host that this board cannot use them.
static bool handle_wifi_msg(const char* json) {
    (void)json;
    return false;
}
#endif

// True while the page on the panel came from the host; a serial poke's page has
// no host behind it (see host_page_tick).
static bool page_from_host = false;

// Page from the host: a card it keeps up while something is going on.
//   {"pg":"spotify","pt":"Now playing","p1":"...","p2":"...","p3":"...","pp":42,"pa":"echo headphones","pi":"3f9a0c1d2e4b"}
//   {"pg":""}                                                           clear
// pp = progress 0..100 or -1 (no bar), pa = creature name, "dance" (a changing
// dance, see ui.cpp) or "" (none), pi = album art id or absent (only boards
// built with FEATURE_PICTURE show it; the others ignore it).
// Returns true when the message was one of these.
static bool handle_page_msg(const char* json) {
    if (!strstr(json, "\"pg\"")) return false;   // cheap gate: only a page carries "pg"
    JsonDocument doc;
    if (deserializeJson(doc, json)) return false;
    if (!doc["pg"].is<const char*>() || !doc["s"].isNull()) return false;
    const char* pg = doc["pg"] | "";
    if (!*pg) {
        ui_page_clear();
        return true;
    }
    const float pp = doc["pp"] | -1.0f;    // any number; absent = no bar
    ui_page_show(pg, doc["pt"] | "", doc["p1"] | "", doc["p2"] | "", doc["p3"] | "",
                 pp < 0 ? -1 : pp > 100 ? 100 : (int)(pp + 0.5f), doc["pa"] | "", doc["pi"] | "");
    page_from_host = true;
    return true;
}

// A page from the host goes when the host does, in sight or left out of sight
// by the screen cycle (it would come back stale on the next cycle). On a live
// link the host writes at least once a usage poll, so nothing from it for
// BLE_HOST_QUIET_MS means a tray that quit, a PC asleep or a board out of
// range, and its page would otherwise stay up with nobody to take it down. A
// tray that links again sends its page again. Not straight away on a lost
// link: a short drop and reconnect would make the page blink.
static void host_page_tick(void) {
    if (!page_from_host || !ui_page_live()) return;
    const uint32_t quiet = ble_ms_since_host_write();
    if (quiet < BLE_HOST_QUIET_MS) return;
    if (quiet == UINT32_MAX) Serial.println("page: the host has written nothing, page left");
    else Serial.printf("page: the host has been quiet %lu s, page left\n", (unsigned long)(quiet / 1000));
    page_from_host = false;
    ui_page_clear();
}

// Parse a JSON line into UsageData.
static bool parse_json(const char* json, UsageData* out) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, json);
    if (err) {
        // The length tells a cut write apart from a bad one: IncompleteInput at
        // the link's write limit (MTU less 3) is a message too long for one write.
        Serial.printf("JSON parse error: %s (%u bytes)\n", err.c_str(), (unsigned)strlen(json));
        return false;
    }
    // Only a usage payload carries "s". Anything else (a message this firmware
    // has no handler for) must not land here as a zeroed usage screen.
    if (doc["s"].isNull()) {
        Serial.println("message without \"s\" and no handler for it, ignored");
        return false;
    }

    out->session_pct = doc["s"] | 0.0f;
    out->session_reset_mins = doc["sr"] | -1;
    out->weekly_pct = doc["w"] | 0.0f;
    out->weekly_reset_mins = doc["wr"] | -1;
    strlcpy(out->status, doc["st"] | "unknown", sizeof(out->status));
    out->chime = doc["c"] | false;   // absent (old daemon / chime off) → stay silent
    const char* acct = doc["acct"] | "pro";
    out->enterprise = (strcmp(acct, "ent") == 0);
    out->time_pct = doc["tp"] | 0;
    out->period_days = doc["pd"] | 30;
    strlcpy(out->reset_date, doc["rd"] | "", sizeof(out->reset_date));
    strlcpy(out->anim, doc["a"] | "", sizeof(out->anim));
    out->agents = doc["n"] | 0;      // absent (old daemon / no state file) → 0, nothing shown
    out->clock_epoch = doc["t"] | 0L;
    out->clock_fmt = doc["tf"] | 24;
    out->ok = doc["ok"] | false;
    out->valid = true;
    return true;
}

// ---- Serial command buffer ----
// 200 so a whole `page <title>|<l1>|<l2>|<l3>|<pp>|<anim>|<pi>` poke fits
// (196 characters with every field at its protocol limit).
#define CMD_BUF_SIZE 200
static char cmd_buf[CMD_BUF_SIZE];
static int cmd_pos = 0;

// Split `s` in place on '|' into at most `max` fields, keeping empty ones
// ("a||b" is three fields; strtok would make it two). Returns the count.
static int split_fields(char* s, char** out, int max) {
    int n = 0;
    out[n++] = s;
    for (char* p = s; *p && n < max; p++) {
        if (*p == '|') {
            *p = '\0';
            out[n++] = p + 1;
        }
    }
    return n;
}

// `msg <text>` or `msg <title>|<text>`: a notification without a host. A single
// field is the text; a title needs the '|' form (a '|' after it stays in the text).
static void serial_msg(char* args) {
    char* f[2];
    const int n = split_fields(args, f, 2);
    if (n > 1) ui_notify_show(f[0], f[1], 0);
    else       ui_notify_show("", f[0], 0);
}

// `page <title>|<l1>|<l2>|<l3>|<pp>|<anim>|<pi>`: a page without a host, named
// "serial". Trailing fields may be left off; an empty or missing pp is no bar;
// anim "dance" is the dancing daemon; pi is an album art id (boards built with
// FEATURE_PICTURE fetch it, art.h). No host stands behind it, so it never
// lapses (host_page_tick); pageclr takes it down, the screen cycle or a tap
// puts it out of sight.
static void serial_page(char* args) {
    char* f[7];
    const int n = split_fields(args, f, 7);
    const int pp = (n > 4 && *f[4]) ? atoi(f[4]) : -1;
    ui_page_show("serial", f[0], n > 1 ? f[1] : "", n > 2 ? f[2] : "", n > 3 ? f[3] : "",
                 pp < 0 ? -1 : pp > 100 ? 100 : pp, n > 5 ? f[5] : "", n > 6 ? f[6] : "");
    page_from_host = false;
}

// Taps the `btn` poke queues; the button code in loop() takes one a pass, as if
// the button had been pressed.
static uint8_t pwr_taps_queued = 0;
static uint8_t aux_taps_queued = 0;

// `btn pwr`, `btn pwr2`, `btn aux`, `btn aux2`: one tap, or two in quick
// succession, down the same path as the buttons (wake swallow, double tap, TX).
static void serial_btn(const char* b) {
    uint8_t* q = strncmp(b, "pwr", 3) == 0 ? &pwr_taps_queued
               : strncmp(b, "aux", 3) == 0 ? &aux_taps_queued : nullptr;
    if (!q || (b[3] && strcmp(b + 3, "2") != 0)) {
        Serial.println("usage: btn pwr|pwr2|aux|aux2");
        return;
    }
    *q += b[3] ? 2 : 1;
}

static bool take_tap(uint8_t* q) {
    if (!*q) return false;
    (*q)--;
    return true;
}

static void send_screenshot() {
#ifndef BOARD_HAS_PSRAM
    // A full RGB565 framebuffer doesn't fit in internal SRAM on PSRAM-free
    // boards (e.g. 480×480×2 = 460 KB). Capture is unsupported there.
    Serial.println("SCREENSHOT_UNSUPPORTED");
    return;
#else
    const uint32_t w = board_caps().width;
    const uint32_t h = board_caps().height;
    const uint32_t row_bytes = w * 2;
    const uint32_t buf_size = row_bytes * h;
    uint8_t* sbuf = (uint8_t*)heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM);
    if (!sbuf) {
        Serial.println("SCREENSHOT_ERR");
        return;
    }

    lv_draw_buf_t draw_buf;
    lv_draw_buf_init(&draw_buf, w, h, LV_COLOR_FORMAT_RGB565, row_bytes, sbuf, buf_size);

    lv_result_t res = lv_snapshot_take_to_draw_buf(lv_screen_active(), LV_COLOR_FORMAT_RGB565, &draw_buf);
    if (res != LV_RESULT_OK) {
        heap_caps_free(sbuf);
        Serial.println("SCREENSHOT_ERR");
        return;
    }

    Serial.printf("SCREENSHOT_START %lu %lu %lu\n",
        (unsigned long)w, (unsigned long)h, (unsigned long)buf_size);
    Serial.flush();
    Serial.write(sbuf, buf_size);
    Serial.flush();
    Serial.println();
    Serial.println("SCREENSHOT_END");
    heap_caps_free(sbuf);
#endif
}

// Boards may claim serial commands the shared set does not know (hardware
// bring-up pokes, register dumps). Weak default: nothing claimed.
extern "C" bool board_aux_pressed(void);
extern "C" __attribute__((weak)) bool board_aux_pressed(void) { return false; }

extern "C" bool board_serial_command(const char* cmd);
extern "C" __attribute__((weak)) bool board_serial_command(const char* cmd) {
    (void)cmd;
    return false;
}

// A line that starts like the wifi poke, in any case and after any blanks, but
// did not reach it: any wifi line on a board without Wi-Fi, "Wifi home|...",
// " wifi ...", "wifi:home|...". It may hold a password, so it gets a fixed
// answer, never an echo, and is wiped from the line buffer. False for any
// other line.
static bool serial_wifi_other(char* line, int len) {
    const char* p = line;
    while (*p == ' ' || *p == '\t') p++;
    if (strncasecmp(p, "wifi", 4) != 0) return false;
#ifdef FEATURE_PICTURE
    Serial.println("usage: wifi <ssid>|<password>, wifi off, wifi status");
#else
    Serial.println("wifi: this board is built without Wi-Fi");
#endif
    memset(line, 0, len);
    return true;
}

// An unknown line is echoed by its first word only, and never past a '|' (where
// a poke's password would start), so a mistyped line cannot print one back.
static void serial_unknown(const char* line) {
    while (*line == ' ' || *line == '\t') line++;
    Serial.printf("unknown command: %.*s\n", (int)strcspn(line, " \t|"), line);
}

static void check_serial_cmd() {
    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n' || c == '\r') {
            cmd_buf[cmd_pos] = '\0';
            if (strcmp(cmd_buf, "screenshot") == 0) send_screenshot();
            else if (strcmp(cmd_buf, "buzz") == 0)  sound_hal_play_reset();
            // Play the charge overlay without touching the cable — the real
            // trigger needs a USB transition, which is awkward to produce on a
            // device that is being flashed over that same cable.
            else if (strcmp(cmd_buf, "charge") == 0)   charge_anim_play(true);
            else if (strcmp(cmd_buf, "uncharge") == 0) charge_anim_play(false);
            // Put a sample prompt on the panel without a host: exercises the
            // overlay and the button path (the answer goes out over BLE if a
            // host is connected, and is otherwise just logged).
            else if (strcmp(cmd_buf, "ask") == 0)
                ui_approve_show("serial", "Bash", "git push origin main   (serial test prompt)", 45);
            else if (strcmp(cmd_buf, "askclr") == 0)   ui_approve_clear();
            // The button press, from the bench: same arm delay, same BLE answer.
            else if (strcmp(cmd_buf, "ok") == 0)       ui_approve_accept();
            // The stats toggle, from the bench (screenshots of the usage screen).
            else if (strcmp(cmd_buf, "stats") == 0)    ui_toggle_splash();
            // A notification and a page without a host (see serial_msg and
            // serial_page for the fields), and their clears.
            else if (strncmp(cmd_buf, "msg ", 4) == 0)  serial_msg(cmd_buf + 4);
            else if (strcmp(cmd_buf, "msgclr") == 0)    ui_notify_clear();
            else if (strncmp(cmd_buf, "page ", 5) == 0) serial_page(cmd_buf + 5);
            else if (strcmp(cmd_buf, "pageclr") == 0)   ui_page_clear();
            // The page's dance floor: `dance next`, `dance status` (ui_dance_serial).
            else if (strncmp(cmd_buf, "dance ", 6) == 0) ui_dance_serial(cmd_buf + 6);
            // PWR and aux taps from the bench, down the button path (serial_btn).
            else if (strncmp(cmd_buf, "btn ", 4) == 0)  serial_btn(cmd_buf + 4);
#ifdef FEATURE_PICTURE
            // Wi-Fi and the album art: `wifi <ssid>|<password>`, `wifi off`,
            // `wifi status`, `art <base url>`, `art status` (wifi_link.h, art.h).
            else if (strncmp(cmd_buf, "wifi ", 5) == 0) wifi_link_serial(cmd_buf + 5);
            else if (strncmp(cmd_buf, "art ", 4) == 0)  art_serial(cmd_buf + 4);
#endif
            // Any other line that starts like `wifi` may hold a password: a fixed
            // answer, never an echo, and never handed to the board's own commands
            // (serial_wifi_other). The rest is the board's, or unknown.
            else if (cmd_pos > 0 && !serial_wifi_other(cmd_buf, cmd_pos) &&
                     !board_serial_command(cmd_buf))
                serial_unknown(cmd_buf);
            cmd_pos = 0;
        } else if (cmd_pos < CMD_BUF_SIZE - 1) {
            cmd_buf[cmd_pos++] = c;
        }
    }
}

// Each board provides this. Must bring up the shared I2C bus (Wire.begin
// with the board's SDA/SCL pins) and any board-private hardware that has
// to settle before display/touch (e.g. an IO expander gating the LCD
// reset line). Called exactly once at the start of setup().
extern "C" void board_init(void);

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println("{\"ready\":true}");

    board_init();

    display_hal_init();
    display_hal_begin();
    idle_init();        // takes over panel brightness and starts the idle timer
    brightness_init();  // load the user's saved brightness level and apply via idle

    power_hal_init();
    imu_hal_init();
    sound_hal_init();
    touch_hal_init();

    // ---- LVGL ----
    const int W = board_caps().width;
    const int H = board_caps().height;

    lv_init();
    lv_tick_set_cb(my_tick);

    buf1 = (uint16_t*)heap_caps_malloc(W * BUF_LINES * 2, LV_BUF_CAPS);
    buf2 = (uint16_t*)heap_caps_malloc(W * BUF_LINES * 2, LV_BUF_CAPS);

    lv_display_t* disp = lv_display_create(W, H);
    lv_display_set_color_format(disp, LV_COLOR_FORMAT_RGB565);
    lv_display_set_flush_cb(disp, my_flush_cb);
    lv_display_set_buffers(disp, buf1, buf2, W * BUF_LINES * 2,
                           LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_add_event_cb(disp, rounder_cb, LV_EVENT_INVALIDATE_AREA, NULL);

    lv_indev_t* indev = lv_indev_create();
    lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(indev, my_touch_cb);

    ble_init();
    input_hal_init();
#ifdef FEATURE_PICTURE
    // Wi-Fi for the album art: its own task joins from the stored credentials,
    // BLE untouched. Before ui_init, which starts the art fetcher (art_init)
    // with the size of the card's square.
    wifi_link_init();
#endif

    ui_init();
    ui_update_ble_status(ble_get_state(), ble_get_device_name(), ble_get_mac_address());
    ui_update_battery(power_hal_battery_pct(), power_hal_is_charging());
    ui_show_screen(SCREEN_SPLASH);
    // Boot sequence: the creature builds itself in braille order, blinks, glitches through the model
    // tiers and settles (the "echo build" animation, 4.5 s). loop() hands control back after BOOT_ANIM_MS
    // unless the host has named something by then.
    splash_set_anim("echo build");

    Serial.printf("Dashboard ready (%s, %dx%d), waiting for data on BLE...\n",
        board_caps().name, W, H);
}

static ble_state_t last_ble_state = BLE_STATE_INIT;

// Hold-to-pair gesture: hold the PWR button ~3s, then RELEASE → clear all BLE
// bonds and re-advertise. Clearing on *release* (not while held) is deliberate:
// holding to power the device OFF (AXP hardware shutdown at 8s) must not wipe
// the bond — a power-off hold never releases before shutdown. To stop a
// "chicken-out" release just before 8s from pairing, the gesture disarms at 6s.
//
//   ~1.5s long-press edge → PENDING
//   3.0s (+1500)          → ARMED   (release from here clears bonds)
//   6.0s (+4500)          → DISARMED (no clear; AXP powers off at 8s)
#define PAIR_ARM_AFTER_LONG_MS    1500   // 3.0s total
#define PAIR_DISARM_AFTER_LONG_MS 4500   // 6.0s total
enum pair_state_t { PAIR_IDLE, PAIR_PENDING, PAIR_ARMED };
static pair_state_t pair_state        = PAIR_IDLE;
static uint32_t     pair_long_seen_ms = 0;

static void pair_tick(void) {
    if (pair_state == PAIR_IDLE && power_hal_pwr_long_pressed()) {
        pair_state = PAIR_PENDING;
        pair_long_seen_ms = millis();
        (void)power_hal_pwr_released();  // drain any stale release edge
        Serial.println("PWR long-press: hold to ~3s then release to pair");
        return;
    }
    if (pair_state == PAIR_IDLE) return;

    if (power_hal_pwr_released()) {
        if (pair_state == PAIR_ARMED) {
            Serial.println("Pair: released in window — clearing bonds, advertising");
            ble_clear_bonds();
        } else {
            Serial.println("Pair: released too early — cancelled");
        }
        pair_state = PAIR_IDLE;
        return;
    }

    uint32_t held = millis() - pair_long_seen_ms;
    if (pair_state == PAIR_PENDING && held >= PAIR_ARM_AFTER_LONG_MS) {
        pair_state = PAIR_ARMED;
        Serial.println("Pair: armed — release to pair");
    } else if (pair_state == PAIR_ARMED && held >= PAIR_DISARM_AFTER_LONG_MS) {
        pair_state = PAIR_IDLE;  // power-off territory; don't pair
        Serial.println("Pair: disarmed (holding toward power-off)");
    }
}

// ---- PWR and aux taps (plans/labdaemon.md, "Increment 2") ----
// On the page (ui_screen_name "page": in sight, nothing over it) a tap waits
// TAP_DOUBLE_MS for a second one: two make a double, one alone acts as a single
// once the time is up, so a single there comes TAP_DOUBLE_MS late. Everywhere
// else a tap acts at once, as it always did, and never pairs with the next. A
// waiting tap stays the page's whatever comes up before it resolves: a prompt
// or a notification that lands mid window is left for the next press.
// A tap that reaches the page within TAP_DOUBLE_MS of one that acted at once
// off it (the tap that cycled to the page, say) acts at once as the page's
// single: taps in a steady run step through the page instead of pairing on it.
#define TAP_DOUBLE_MS 400

enum tap_t { TAP_SINGLE, TAP_PAGE_SINGLE, TAP_PAGE_DOUBLE };

struct TapState {
    bool     pending;   // a tap on the page, waiting for a second one
    uint32_t at;        // millis() when it came
    bool     acted;     // a tap acted at once off the page (TAP_SINGLE)
    uint32_t acted_at;  // millis() when it did; one step through the page uses it up
};

// Feed one button's tap (already past the wake swallow) and act on what it
// makes. The window closing is checked first, so a second tap that comes just
// too late is a tap of its own, not a double.
static void tap_feed(TapState& s, bool tapped, void (*act)(tap_t)) {
    const uint32_t now = millis();
    if (s.pending && now - s.at >= TAP_DOUBLE_MS) {
        s.pending = false;
        act(TAP_PAGE_SINGLE);
    }
    if (!tapped) return;
    if (s.pending) {
        s.pending = false;
        act(TAP_PAGE_DOUBLE);
    } else if (strcmp(ui_screen_name(), "page") != 0) {
        s.acted    = true;
        s.acted_at = now;
        act(TAP_SINGLE);
    } else if (s.acted && now - s.acted_at < TAP_DOUBLE_MS) {
        s.acted = false;
        act(TAP_PAGE_SINGLE);
    } else {
        s.pending = true;
        s.at      = now;
    }
}

// PWR. On the page a single is the screen cycle's step from it (nothing sent)
// and a double is {"btn":"pwr2","scr":"page"}. Elsewhere it goes to the host as
// "pwr" with scr read before it acts here, then answers a prompt, else clears a
// notification, else steps the screen cycle, on every board (the next creature
// and brightness are aux's).
static void pwr_act(tap_t t) {
    if (t == TAP_PAGE_DOUBLE) { ble_send_button("pwr2", "page"); return; }
    if (t == TAP_PAGE_SINGLE) { ui_page_leave(); return; }
    ble_send_button("pwr", ui_screen_name());
    if (ui_approve_visible())     ui_approve_accept();
    else if (ui_notify_visible()) ui_notify_clear();
    else                          ui_cycle_screens();
}

// aux, the second key (BOOT on lcd_4). On the page a single is "aux" and a
// double "aux2", both scr "page", for the host alone. Elsewhere it goes to the
// host as "aux", then answers a prompt, else clears a notification, else is the
// next creature on the splash and brightness on usage.
static void aux_act(tap_t t) {
    if (t != TAP_SINGLE) {
        ble_send_button(t == TAP_PAGE_DOUBLE ? "aux2" : "aux", "page");
        return;
    }
    ble_send_button("aux", ui_screen_name());
    if (ui_approve_visible())                          ui_approve_accept();
    else if (ui_notify_visible())                      ui_notify_clear();
    else if (ui_get_current_screen() == SCREEN_SPLASH) splash_next();
    else                                               brightness_cycle();
}

#define BOOT_ANIM_MS 4600
void loop() {
    {   // end of the boot sequence: release the creature to the device's own choice
        static bool boot_done = false;
        if (!boot_done && millis() >= BOOT_ANIM_MS) {
            boot_done = true;
            if (!ble_has_data()) splash_set_anim("");
        }
    }
    idle_tick();
    lv_timer_handler();
    ui_tick_anim();
    ble_tick();
    host_page_tick();
#ifdef FEATURE_PICTURE
    wifi_link_tick();   // what the Wi-Fi and art tasks logged, printed here between screenshots
    art_ble_tick();     // album art over BLE: chunks put in place, the decoder handed a whole picture, misses
#endif
    power_hal_tick();
    imu_hal_tick();
    sound_hal_tick();
    splash_tick();
    // Rotation transition (blank + ramp) would fight the idle fade — skip
    // ticks while the panel is dark. A rotation that happens during sleep
    // is detected by the next tick after wake and ramped in then.
    if (!idle_is_asleep()) display_hal_tick();

    // ---- Physical buttons ----
    //   PRIMARY   → HID Space  (Claude Code voice-mode PTT)
    //   SECONDARY → HID Shift+Tab  (mode toggle; only if the board has one)
    //   PWR       see pwr_act (the screen cycle; a double tap on the page);
    //             hold ~3s + release: pairing mode
    // First press from sleep is consumed as a wake-only event by
    // idle_consume_wake_press(); the normal action fires from the second
    // press. Activity bookkeeping happens inside idle_consume_wake_press
    // so no separate idle_note_activity() call is needed here.
    {
        static bool primary_was = false;
        static bool primary_wake_swallowed = false;
        bool primary_now = input_hal_is_held(INPUT_BTN_PRIMARY);
        if (primary_now != primary_was) {
            if (primary_now) {
                if (idle_consume_wake_press()) primary_wake_swallowed = true;
                else                            ble_keyboard_press(0x2C, 0);  // HID Space, no mods
            } else {
                if (primary_wake_swallowed) primary_wake_swallowed = false;
                else                        ble_keyboard_release();
            }
            primary_was = primary_now;
        }

        if (board_caps().button_count >= 2) {
            static bool secondary_was = false;
            static bool secondary_wake_swallowed = false;
            bool secondary_now = input_hal_is_held(INPUT_BTN_SECONDARY);
            if (secondary_now != secondary_was) {
                if (secondary_now) {
                    if (idle_consume_wake_press()) secondary_wake_swallowed = true;
                    else                            ble_keyboard_press(0x2B, 0x02);  // HID Tab + LEFT_SHIFT
                } else {
                    if (secondary_wake_swallowed) secondary_wake_swallowed = false;
                    else                          ble_keyboard_release();
                }
                secondary_was = secondary_now;
            }
        }

        // PWR and aux (the second key: BOOT on lcd_4, no other board has one),
        // taps through the double tap detection above (pwr_act, aux_act), a
        // `btn` poke's among them. A press swallowed as a wake is no tap and
        // sends nothing. A prompt that is up takes the press (or, too soon after
        // it appeared, lets it do nothing); it never reaches what lies underneath.
        static TapState pwr_taps = {}, aux_taps = {};
        const bool pwr_hit = power_hal_pwr_pressed() || take_tap(&pwr_taps_queued);
        tap_feed(pwr_taps, pwr_hit && !idle_consume_wake_press(), pwr_act);
        const bool aux_hit = board_aux_pressed() || take_tap(&aux_taps_queued);
        tap_feed(aux_taps, aux_hit && !idle_consume_wake_press(), aux_act);

        pair_tick();
    }

    // ---- Zwischendurch die Zahlen zeigen ----
    // Wer den Clawd als Animation laufen laesst, will trotzdem ab und zu
    // sehen wie es um die Auslastung steht. Alle USAGE_PEEK_EVERY_MS also
    // fuer USAGE_PEEK_SHOW_MS auf den Usage-Screen und wieder zurueck.
    //
    // Bewusst nur aus dem Splash heraus und nur solange der Nutzer nicht
    // selbst umschaltet: ein Tastendruck waehrend des Abstechers beendet ihn,
    // und wer laenger freiwillig auf den Zahlen steht, faengt danach mit
    // vollem Abstand wieder an - sonst wechselt das Ding vor der Nase hin
    // und her.
    {
        static uint32_t peek_ref_ms = 0;
        static bool     peeking     = false;
        const uint32_t now_ms = millis();
        const screen_t cur    = ui_get_current_screen();

        if (idle_is_asleep()) {
            peek_ref_ms = now_ms;          // im Schlaf laeuft die Uhr nicht
            peeking = false;
        } else if (peeking) {
            if (cur != SCREEN_USAGE) {     // Nutzer hat selbst umgeschaltet
                peeking = false;
                peek_ref_ms = now_ms;
            } else if (now_ms - peek_ref_ms >= USAGE_PEEK_SHOW_MS) {
                peeking = false;
                peek_ref_ms = now_ms;
                ui_show_screen(SCREEN_SPLASH);
                Serial.println("peek: zurueck zu den Animationen");
            }
        } else if (cur != SCREEN_SPLASH || splash_host_named()) {
            // on the numbers already, or the host is driving the creature (Claude activity):
            // no peek, the clock restarts
            peek_ref_ms = now_ms;
        } else if (now_ms - peek_ref_ms >= USAGE_PEEK_EVERY_MS) {
            peeking = true;
            peek_ref_ms = now_ms;
            ui_show_screen(SCREEN_USAGE);
            Serial.println("peek: zeige kurz die Auslastung");
        }
    }

    ble_state_t bs = ble_get_state();
    if (bs != last_ble_state) {
        last_ble_state = bs;
        ui_update_ble_status(bs, ble_get_device_name(), ble_get_mac_address());
    }

    static int  last_pct      = -2;
    static bool last_charging = false;
    int  pct      = power_hal_battery_pct();
    bool charging = power_hal_is_charging();
    if (pct != last_pct || charging != last_charging) {
        if (pct != last_pct) ble_set_battery_level(pct);
        last_pct = pct;
        last_charging = charging;
        ui_update_battery(pct, charging);
    }

    // Cable in / out gets a short animation. Driven by VBUS rather than the
    // charging flag, which also drops when the battery reaches full with the
    // cable still in — that would play the unplug sequence for nothing.
    // The first reading only records the state: booting on USB is not an event.
    static bool vbus_known = false;
    static bool last_vbus  = false;
    bool vbus = power_hal_is_vbus_in();
    if (!vbus_known) {
        vbus_known = true;
        last_vbus  = vbus;
    } else if (vbus != last_vbus) {
        last_vbus = vbus;
        Serial.printf("USB %s\n", vbus ? "in" : "out");
        charge_anim_play(vbus);
    }

    check_serial_cmd();

    if (ble_has_data()) {
        const char* raw = ble_get_data();
        // Dispatch order is the contract (plans/labdaemon.md, "Protocol"): each
        // host message is its own, and only one carrying "s" is usage. Wi-Fi
        // credentials ("wf") sit beside notify and answer for themselves
        // (handle_wifi_msg); a board without Wi-Fi leaves them to parse_json,
        // which nacks them. An album art header ("ab", boards with
        // FEATURE_PICTURE) comes next, before the page; its chunks never pass
        // here (art.h).
        if (handle_approve_msg(raw) || handle_notify_msg(raw)) {
            ble_send_ack();
        } else if (handle_wifi_msg(raw)) {
            // answered already, with the "wf" reply
#ifdef FEATURE_PICTURE
        } else if (handle_art_header_msg(raw)) {
            ble_send_ack();   // art.cpp answers for the picture itself: "ok" or "miss"
#endif
        } else if (handle_page_msg(raw)) {
            ble_send_ack();
        } else if (parse_json(raw, &usage)) {
            int g_before = usage_rate_group();
            bool session_reset = usage_rate_sample(usage.session_pct);
            int g_after = usage_rate_group();
            // 5-hour session limit refilled → chime so the user knows they can
            // use Claude again (no-op on boards without a buzzer). Gated on the
            // daemon's opt-in `chime` config; the `buzz` serial cmd ignores it.
            if (session_reset && usage.chime) {
                Serial.println("session reset detected — chime");
                sound_hal_play_reset();
            }
            // Host-driven animation. Sent only when the host is configured to
            // mirror its desktop buddy; absent → "" → device keeps deciding.
            splash_set_anim(usage.anim);
            if (g_after != g_before) {
                Serial.printf("usage rate: group %d -> %d (s=%.2f%%)\n",
                    g_before, g_after, usage.session_pct);
                if (splash_is_active()) splash_pick_for_current_rate();
            }
            ui_update(&usage);
            ble_send_ack();
        } else {
            ble_send_nack();
        }
    }

    delay(5);
}
