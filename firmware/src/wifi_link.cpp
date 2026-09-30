// Wi-Fi station for the album art (wifi_link.h). Built only with
// FEATURE_PICTURE; without it this file compiles to nothing.
#ifdef FEATURE_PICTURE
#include "wifi_link.h"
#include <Arduino.h>
// Through a macro: PlatformIO's library finder reads every #include it can
// see, #ifdef or not, and would build and link the Wi-Fi stack into every env.
// The env with FEATURE_PICTURE names WiFi and its kin in lib_deps instead.
#define WIFI_LINK_WIFI_H <WiFi.h>
#include WIFI_LINK_WIFI_H
#include <Preferences.h>
#include <esp_heap_caps.h>
#include <ctype.h>
#include <stdarg.h>
#include <string.h>

// A password is empty (an open network), a passphrase of PASS_MIN to
// PASS_TEXT_MAX bytes, or a raw key of exactly PASS_MAX hex digits: the driver
// reads any password of PASS_MAX bytes as a raw key.
#define SSID_MAX      32
#define PASS_MIN      8
#define PASS_TEXT_MAX 63
#define PASS_MAX      64

// A join that is not up after JOIN_TIMEOUT_MS has failed. After a failed join
// or a drop the next try waits 5 s, then 15 s, then 60 s each time after that,
// until one gets through.
#define JOIN_TIMEOUT_MS 15000
static const uint32_t BACKOFF_MS[] = { 5000, 15000, 60000 };
#define BACKOFF_STEPS ((uint8_t)(sizeof(BACKOFF_MS) / sizeof(BACKOFF_MS[0])))

// The task: as low as the Arduino loop and on the other core, so it never
// takes a slice of the LVGL loop; it looks at the link this often while it
// has credentials, and sleeps until told otherwise when it has none.
#define TASK_TICK_MS 250
#define TASK_STACK   6144
#define TASK_PRIO    1
#define TASK_CORE    0

// Lines from the tasks wait here for the loop (wifi_link_tick).
#define LOG_LINES    8
#define LOG_LINE_MAX 100

enum link_state_t : uint8_t { LINK_OFF, LINK_JOINING, LINK_UP, LINK_WAIT };

// The stored credentials as the loop last set them; the task copies them when
// s_changed says they are new.
static portMUX_TYPE  s_lock = portMUX_INITIALIZER_UNLOCKED;
static char          s_ssid[SSID_MAX + 1] = "";
static char          s_pass[PASS_MAX + 1] = "";
static volatile bool s_changed = false;

static TaskHandle_t  s_task = nullptr;
static QueueHandle_t s_log  = nullptr;

// Written by the task (s_reason by the driver's event), read anywhere.
static volatile link_state_t s_state   = LINK_OFF;
static volatile uint32_t     s_joins   = 0;
static volatile uint32_t     s_wait_ms = 0;   // the pause before the next try, in LINK_WAIT
static volatile uint8_t      s_reason  = 0;   // the driver's last disconnect reason; 0 none yet

void wifi_link_log(const char* fmt, ...) {
    if (!s_log) return;
    char line[LOG_LINE_MAX];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(line, sizeof(line), fmt, ap);
    va_end(ap);
    xQueueSend(s_log, line, 0);   // a full queue drops the line; nothing ever waits on the loop
}

void wifi_link_tick(void) {
    if (!s_log) return;
    char line[LOG_LINE_MAX];
    while (xQueueReceive(s_log, line, 0) == pdTRUE) Serial.println(line);
}

// Why the driver left or never got on: AUTH_FAIL or 4WAY_HANDSHAKE_TIMEOUT is
// a wrong password, NO_AP_FOUND a network out of range or misspelt. Runs on
// the network event task. ASSOC_LEAVE is the board leaving on purpose (a join
// given up, new credentials), which would hide the reason that mattered.
static void on_disconnect(arduino_event_id_t event, arduino_event_info_t info) {
    (void)event;
    const uint8_t r = info.wifi_sta_disconnected.reason;
    if (r != WIFI_REASON_ASSOC_LEAVE) s_reason = r;
}

static const char* reason_name(void) {
    const uint8_t r = s_reason;
    if (!r) return "none";
    const char* n = WiFi.disconnectReasonName((wifi_err_reason_t)r);
    return (n && *n) ? n : "unknown";
}

// Start a join. The first one brings the station up: the driver keeps its
// copy of the credentials in RAM only, so the "wifi" namespace stays the one
// place they are stored, and its own reconnects are off, so the backoff here is
// the only schedule. Power save stays at the default (modem sleep), which BLE
// needs beside Wi-Fi.
// WiFi.begin is STA.begin and STA.connect, called here one by one: its own
// return is the status the last try left (CONNECT_FAILED after a wrong
// password), so it cannot tell whether this join started. One that did not
// start is logged and runs out its JOIN_TIMEOUT_MS like one that failed.
static void begin_join(const char* ssid, const char* pass, bool* radio) {
    if (!*radio) {
        WiFi.persistent(false);
        WiFi.setAutoReconnect(false);
        static bool hooked = false;
        if (!hooked) {
            WiFi.onEvent(on_disconnect, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
            hooked = true;
        }
        *radio = true;
    }
    s_reason = 0;
    if (!WiFi.STA.begin() || !WiFi.STA.connect(ssid, *pass ? pass : nullptr))
        wifi_link_log("wifi: the driver would not start a join on \"%s\"", ssid);
    s_state = LINK_JOINING;
}

static void link_up(const char* ssid) {
    s_joins = s_joins + 1;
    s_state = LINK_UP;
    wifi_link_log("wifi: up on \"%s\", ip %s, rssi %d dBm", ssid,
                  WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
}

// Go to LINK_WAIT for `wait_ms`, saying why.
static void link_wait(const char* ssid, const char* what, uint32_t wait_ms) {
    s_wait_ms = wait_ms;
    s_state = LINK_WAIT;
    wifi_link_log("wifi: %s \"%s\" (%s), next try in %lu s", what, ssid, reason_name(),
                  (unsigned long)(wait_ms / 1000));
}

static void wifi_task(void* arg) {
    (void)arg;
    char ssid[SSID_MAX + 1] = "";
    char pass[PASS_MAX + 1] = "";
    bool radio = false;     // the station is up (the first join starts it)
    uint32_t since = 0;     // millis() when the join or the wait under way began
    uint8_t step = 0;       // the BACKOFF_MS step a failed join waits next
    for (;;) {
        ulTaskNotifyTake(pdTRUE, s_state == LINK_OFF ? portMAX_DELAY : pdMS_TO_TICKS(TASK_TICK_MS));

        if (s_changed) {    // new credentials, or none
            portENTER_CRITICAL(&s_lock);
            s_changed = false;
            memcpy(ssid, s_ssid, sizeof(ssid));
            memcpy(pass, s_pass, sizeof(pass));
            portEXIT_CRITICAL(&s_lock);
            if (!ssid[0]) {
                if (radio) WiFi.disconnect(true, true);   // leave, clear the driver's copy, radio off
                radio = false;
                s_state = LINK_OFF;
                wifi_link_log("wifi: off, nothing stored");
                continue;
            }
            if (radio) WiFi.disconnect(false, true);      // leave the network the board was on
            step = 0;
            wifi_link_log("wifi: joining \"%s\"", ssid);
            begin_join(ssid, pass, &radio);
            since = millis();
            continue;
        }

        const uint32_t now = millis();
        switch (s_state) {
        case LINK_JOINING:
            if (WiFi.isConnected()) {
                link_up(ssid);
                step = 0;
            } else if (now - since >= JOIN_TIMEOUT_MS) {
                const uint32_t wait_ms = BACKOFF_MS[step];
                if (step + 1 < BACKOFF_STEPS) step++;
                WiFi.disconnect();                        // give the attempt up
                since = now;
                link_wait(ssid, "could not join", wait_ms);
            }
            break;
        case LINK_UP:
            if (!WiFi.isConnected()) {
                step = 1;                                 // a failed rejoin waits the next step
                since = now;
                link_wait(ssid, "dropped from", BACKOFF_MS[0]);
            }
            break;
        case LINK_WAIT:
            if (WiFi.isConnected()) {                     // the driver's one retry of its own got there
                link_up(ssid);
                step = 0;
            } else if (now - since >= s_wait_ms) {
                // Checked just above: a join started on a live link would tear it down.
                begin_join(ssid, pass, &radio);
                since = now;
            }
            break;
        default:
            break;
        }
    }
}

void wifi_link_init(void) {
    if (s_task) return;
    s_log = xQueueCreate(LOG_LINES, LOG_LINE_MAX);
    Preferences prefs;
    if (prefs.begin("wifi", true)) {   // false when nothing was ever stored
        prefs.getString("ssid", s_ssid, sizeof(s_ssid));
        prefs.getString("pass", s_pass, sizeof(s_pass));
        prefs.end();
    }
    if (xTaskCreatePinnedToCore(wifi_task, "wifi_link", TASK_STACK, nullptr, TASK_PRIO,
                                &s_task, TASK_CORE) != pdPASS) {
        s_task = nullptr;
        Serial.println("wifi: no task, Wi-Fi stays off");
        return;
    }
    if (s_ssid[0]) {
        s_changed = true;
        xTaskNotifyGive(s_task);
        Serial.printf("wifi: \"%s\" stored, joining\n", s_ssid);
    } else {
        Serial.println("wifi: no network stored (wifi <ssid>|<password>)");
    }
}

// A password the driver can join with (see PASS_MIN): empty, 8 to 63 bytes, or
// 64 hex digits. 64 bytes of anything else would be stored and never join.
static bool pass_ok(const char* pass, size_t np) {
    if (np == 0) return true;
    if (np < PASS_MIN || np > PASS_MAX) return false;
    if (np <= PASS_TEXT_MAX) return true;
    for (size_t i = 0; i < np; i++) {
        if (!isxdigit((unsigned char)pass[i])) return false;
    }
    return true;
}

bool wifi_link_set(const char* ssid, const char* pass) {
    if (!ssid) ssid = "";
    if (!pass) pass = "";
    const size_t ns = strlen(ssid);
    const size_t np = strlen(pass);
    if (ns < 1 || ns > SSID_MAX) {
        Serial.println("wifi: the SSID must be 1 to 32 bytes, nothing stored");
        return false;
    }
    if (!pass_ok(pass, np)) {
        Serial.println("wifi: the password must be empty, 8 to 63 characters or 64 hex digits,"
                       " nothing stored");
        return false;
    }
    portENTER_CRITICAL(&s_lock);
    const bool same = strcmp(ssid, s_ssid) == 0 && strcmp(pass, s_pass) == 0;
    portEXIT_CRITICAL(&s_lock);
    if (same && s_state != LINK_OFF) {   // sent again: no NVS write, no rejoin
        Serial.printf("wifi: \"%s\" is stored already, kept\n", ssid);
        return true;
    }
    Preferences prefs;
    if (!prefs.begin("wifi", false)) {
        Serial.println("wifi: NVS would not open, nothing stored");
        return false;
    }
    const bool ok = prefs.putString("ssid", ssid) == ns;
    if (ok) prefs.putString("pass", pass);
    prefs.end();
    if (!ok) {
        Serial.println("wifi: NVS write failed, nothing stored");
        return false;
    }
    portENTER_CRITICAL(&s_lock);
    strlcpy(s_ssid, ssid, sizeof(s_ssid));
    strlcpy(s_pass, pass, sizeof(s_pass));
    s_changed = true;
    portEXIT_CRITICAL(&s_lock);
    if (s_task) xTaskNotifyGive(s_task);
    Serial.printf("wifi: \"%s\" stored, joining\n", ssid);
    return true;
}

void wifi_link_forget(void) {
    Preferences prefs;
    if (prefs.begin("wifi", false)) {
        prefs.clear();
        prefs.end();
    }
    portENTER_CRITICAL(&s_lock);
    memset(s_ssid, 0, sizeof(s_ssid));
    memset(s_pass, 0, sizeof(s_pass));
    s_changed = true;
    portEXIT_CRITICAL(&s_lock);
    if (s_task) xTaskNotifyGive(s_task);
    Serial.println("wifi: credentials forgotten, leaving the network");
}

bool wifi_link_up(void) {
    return s_state == LINK_UP;
}

uint32_t wifi_link_joins(void) {
    return s_joins;
}

void wifi_link_print_status(void) {
    char ssid[SSID_MAX + 1];
    portENTER_CRITICAL(&s_lock);
    memcpy(ssid, s_ssid, sizeof(ssid));
    portEXIT_CRITICAL(&s_lock);
    switch (s_state) {
    case LINK_UP:
        Serial.printf("wifi: up on \"%s\", ip %s, rssi %d dBm\n", ssid,
                      WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
        break;
    case LINK_JOINING:
        Serial.printf("wifi: joining \"%s\"\n", ssid);
        break;
    case LINK_WAIT:
        Serial.printf("wifi: not on \"%s\", next try within %lu s\n", ssid,
                      (unsigned long)(s_wait_ms / 1000));
        break;
    default:
        if (ssid[0]) Serial.printf("wifi: off, \"%s\" stored\n", ssid);
        else         Serial.println("wifi: off, no network stored");
        break;
    }
    Serial.printf("wifi: %lu joins since boot, last disconnect reason %s\n",
                  (unsigned long)s_joins, reason_name());
    if (s_task) {
        Serial.printf("wifi: task stack %u bytes never used\n",
                      (unsigned)uxTaskGetStackHighWaterMark(s_task));
    }
    // The Wi-Fi driver, its tasks and the art decoder all want internal RAM.
    Serial.printf("wifi: internal heap %u bytes free, largest block %u\n",
                  (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                  (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
}

void wifi_link_serial(char* args) {
    if (strcmp(args, "status") == 0) {
        wifi_link_print_status();
        return;
    }
    if (strcmp(args, "off") == 0) {
        wifi_link_forget();
        return;
    }
    // The bar must be there, an open network being `<ssid>|`: a space typed
    // for it would otherwise store the password as part of the SSID, which
    // every log line and `wifi status` print.
    const size_t len = strlen(args);
    char* bar = strchr(args, '|');
    if (bar) *bar = '\0';
    if (!bar || !*args) {
        Serial.println("usage: wifi <ssid>|<password> (an open network: wifi <ssid>|),"
                       " wifi off, wifi status");
    } else {
        wifi_link_set(args, bar + 1);
    }
    memset(args, 0, len);   // no copy left in the serial line buffer
}
#endif
