#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>
#include <ArduinoJson.h>
#include <esp_heap_caps.h>

#include "data.h"
#include "ui.h"
#include "ble.h"
#include "splash.h"
#include "charge_anim.h"
#include "usage_rate.h"
#include "idle.h"
#include "idle_cfg.h"
#include "brightness.h"

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

// True while the page on the panel came from the host; a serial poke's page has
// no host behind it (see host_page_tick).
static bool page_from_host = false;

// Page from the host: a card it keeps up while something is going on.
//   {"pg":"spotify","pt":"Now playing","p1":"...","p2":"...","p3":"...","pp":42,"pa":"echo headphones"}
//   {"pg":""}                                                           clear
// pp = progress 0..100 or -1 (no bar), pa = creature name or "" (none).
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
                 pp < 0 ? -1 : pp > 100 ? 100 : (int)(pp + 0.5f), doc["pa"] | "");
    page_from_host = true;
    return true;
}

// A page from the host goes when the host does. On a live link the host writes
// at least once a usage poll, so nothing from it for BLE_HOST_QUIET_MS means a
// tray that quit, a PC asleep or a board out of range, and its page would
// otherwise stay up with nobody to take it down (lcd_4 has no working touch
// either). A tray that links again sends its page again. Not straight away on
// a lost link: a short drop and reconnect would make the page blink.
static void host_page_tick(void) {
    if (!page_from_host || !ui_page_visible()) return;
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
// 200 so a whole `page <title>|<l1>|<l2>|<l3>|<pp>|<anim>` poke fits.
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

// `page <title>|<l1>|<l2>|<l3>|<pp>|<anim>`: a page without a host, named
// "serial". Trailing fields may be left off; an empty or missing pp is no bar.
// No host stands behind it, so it never lapses (host_page_tick); pageclr, a tap,
// or a PWR or aux press with no host listening takes it down.
static void serial_page(char* args) {
    char* f[6];
    const int n = split_fields(args, f, 6);
    const int pp = (n > 4 && *f[4]) ? atoi(f[4]) : -1;
    ui_page_show("serial", f[0], n > 1 ? f[1] : "", n > 2 ? f[2] : "", n > 3 ? f[3] : "",
                 pp < 0 ? -1 : pp > 100 ? 100 : pp, n > 5 ? f[5] : "");
    page_from_host = false;
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
            else if (cmd_pos > 0 && !board_serial_command(cmd_buf))
                Serial.printf("unknown command: %s\n", cmd_buf);
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
    //   PWR       → on splash: cycle animations; on usage: cycle brightness;
    //               hold ~3s + release: pairing mode
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

        // PWR and aux also go to the host as {"btn","scr"}, scr read before the
        // press does anything here (plans/labdaemon.md, "Protocol"). A press
        // swallowed as a wake sends nothing. Here, in order: answer a prompt,
        // else clear a notification, else on a page nothing (the host decides)
        // unless no host is there to hear it, then the press leaves the page,
        // else what the button always did.
        if (power_hal_pwr_pressed()) {
            if (!idle_consume_wake_press()) {
                const bool heard = ble_send_button("pwr", ui_screen_name());
                if (ui_approve_visible()) {
                    // A prompt is up: the press answers it (or, too soon after
                    // it appeared, does nothing). It never reaches the screen
                    // toggle underneath.
                    ui_approve_accept();
                } else if (ui_notify_visible()) {
                    ui_notify_clear();
                } else if (ui_page_visible()) {
                    // The host acts on it (the btn just sent). With no host
                    // listening the press leaves the page, so a page is never
                    // stuck on the panel (a host that comes back sends it again).
                    if (!heard) ui_page_clear();
                } else if (board_caps().pwr_toggles_stats) {
                    // One-button boards: the press is the only way to the numbers.
                    ui_toggle_splash();
                } else if (ui_get_current_screen() == SCREEN_SPLASH) {
                    // On splash: cycle animations. On the usage view: cycle
                    // screen brightness (single non-splash view, no more screens).
                    splash_next();
                } else {
                    brightness_cycle();
                }
            }
        }

        // Boards with a second physical key report its short press here:
        // next creature on splash, brightness on usage, an answer to a prompt
        // that is up, a clear for a notification, nothing on a page (the host
        // acts on it) unless no host is listening, then it leaves the page.
        if (board_aux_pressed() && !idle_consume_wake_press()) {
            const bool heard = ble_send_button("aux", ui_screen_name());
            if (ui_approve_visible())                          ui_approve_accept();
            else if (ui_notify_visible())                      ui_notify_clear();
            else if (ui_page_visible())                        { if (!heard) ui_page_clear(); }
            else if (ui_get_current_screen() == SCREEN_SPLASH) splash_next();
            else                                               brightness_cycle();
        }

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
        // host message is its own, and only one carrying "s" is usage.
        if (handle_approve_msg(raw) || handle_notify_msg(raw) || handle_page_msg(raw)) {
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
