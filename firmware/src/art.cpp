// Album art for the music card (art.h). Built only with FEATURE_PICTURE;
// without it this file compiles to nothing.
#ifdef FEATURE_PICTURE
#include "art.h"
#include "wifi_link.h"
#include <Arduino.h>
// Through macros, as in wifi_link.cpp: out of sight of PlatformIO's library
// finder, which would otherwise build and link them into every env. The env
// with FEATURE_PICTURE names them in lib_deps.
#define ART_HTTP_H <HTTPClient.h>
#define ART_JPEG_H <JPEGDEC.h>
#include ART_HTTP_H
#include ART_JPEG_H
#include <Preferences.h>
#include <esp_heap_caps.h>
#include <lwip/sockets.h>
#include <errno.h>
#include <new>
#include <string.h>

#define ART_BODY_MAX   (64 * 1024)   // the largest JPEG taken, bytes
#define ART_CONNECT_MS 2000          // the TCP connect
#define ART_TOTAL_MS   3000          // the whole fetch, connect to last byte
#define ART_BASE_MAX   127
#define ART_ERR_MAX    64
// The fetch task: as low as the Arduino loop and on the other core. It wakes
// when the page wants a picture or the loop has taken one in, and every
// ART_POLL_MS while a wanted picture waits on Wi-Fi or a base.
#define ART_POLL_MS    1000
#define ART_TASK_STACK 8192
#define ART_TASK_PRIO  1
#define ART_TASK_CORE  0

// LVGL's word for "this descriptor has new pixels" (lv_image_cache.c). LVGL 9.6
// keeps its header private, so it is declared here; the caches are off in this
// build (LV_CACHE_DEF_SIZE and LV_IMAGE_HEADER_CACHE_DEF_CNT are 0), and the
// call keeps the swap right should one ever be turned on.
extern "C" void lv_image_cache_drop(const void* src);

// Shared by the loop and the task, under s_lock.
static portMUX_TYPE s_lock = portMUX_INITIALIZER_UNLOCKED;
static char     s_want[ART_ID_MAX + 1]   = "";   // the page's picture
static char     s_cached[ART_ID_MAX + 1] = "";   // decoded in s_buf[s_front], the one the loop shows
static char     s_ready[ART_ID_MAX + 1]  = "";   // decoded in the other buffer, not taken in yet
static int      s_ready_w = 0;
static int      s_ready_h = 0;
static char     s_busy[ART_ID_MAX + 1]   = "";   // being fetched now
static char     s_failed[ART_ID_MAX + 1] = "";   // the last picture that failed, not fetched again
static uint32_t s_failed_joins = 0;              // while Wi-Fi has not joined since
static uint32_t s_failed_base  = 0;              // and the base is the one it failed with
static char     s_base[ART_BASE_MAX + 1] = "";
static uint32_t s_base_gen = 0;                  // counts base changes
static int      s_front = 0;                     // the s_buf the loop shows

// For `art status`, also under s_lock.
static uint32_t s_n_ok = 0;
static uint32_t s_n_failed = 0;
static uint32_t s_last_ms = 0;
static uint32_t s_last_bytes = 0;
static char     s_last_err[ART_ERR_MAX] = "";

// Set once by art_init.
static int          s_px = 0;
static uint16_t*    s_buf[2] = { nullptr, nullptr };   // RGB565, s_px by s_px each, in PSRAM
static uint8_t*     s_body = nullptr;                  // the JPEG as fetched, in PSRAM
static JPEGDEC*     s_jpeg = nullptr;                  // the decoder's state, about 18 KB
static TaskHandle_t s_task = nullptr;

// The loop's: the picture handed to LVGL, always s_buf[s_front].
static lv_image_dsc_t s_dsc;

bool art_id_ok(const char* id) {
    if (!id) return false;
    size_t n = 0;
    for (; id[n]; n++) {
        const char c = id[n];
        if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) || n >= ART_ID_MAX) return false;
    }
    return n >= ART_ID_MIN;
}

// Under s_lock: `id` failed and nothing has changed since that would make a
// second try worth it.
static bool failed_locked(const char* id, uint32_t joins) {
    return strcmp(id, s_failed) == 0 && s_failed_joins == joins && s_failed_base == s_base_gen;
}

// ---- The fetch ----

// The peer has closed and everything it sent has been read. NetworkClient's
// connected() cannot tell: a recv that returns 0 at the close leaves errno as
// it was.
static bool peer_closed(NetworkClient& s) {
    const int fd = s.fd();
    if (fd < 0) return true;
    uint8_t b;
    errno = 0;
    const int r = lwip_recv(fd, &b, 1, MSG_PEEK | MSG_DONTWAIT);
    return r == 0 || (r < 0 && errno != EWOULDBLOCK && errno != EAGAIN);
}

// GET url into s_body. The byte count, or 0 with err filled in.
static size_t fetch(const char* url, char* err, size_t errn) {
    const uint32_t t0 = millis();
    HTTPClient http;
    http.setReuse(false);
    http.useHTTP10(true);                               // no chunks: the body is its bytes, to its length or the close
    http.setConnectTimeout(ART_CONNECT_MS);
    http.setTimeout(ART_TOTAL_MS - ART_CONNECT_MS);     // the wait for the headers
    if (!http.begin(url)) {
        snprintf(err, errn, "bad url");
        return 0;
    }
    const int code = http.GET();
    if (code != HTTP_CODE_OK) {
        if (code < 0) snprintf(err, errn, "%s", HTTPClient::errorToString(code).c_str());
        else          snprintf(err, errn, "http %d", code);
        http.end();
        return 0;
    }
    const int len = http.getSize();                     // -1: no length, the body ends at the close
    if (len == 0 || len > ART_BODY_MAX) {
        snprintf(err, errn, "body of %d bytes, the limit is %d", len, ART_BODY_MAX);
        http.end();
        return 0;
    }
    NetworkClient& s = http.getStream();
    size_t got = 0;
    err[0] = '\0';
    for (;;) {
        if (len > 0 && got >= (size_t)len) break;       // all of it
        if (millis() - t0 >= ART_TOTAL_MS) {
            snprintf(err, errn, "timed out after %u bytes", (unsigned)got);
            break;
        }
        const int avail = s.available();
        if (avail > 0) {
            if (got >= ART_BODY_MAX) {                  // only a body without a length gets here
                snprintf(err, errn, "body over %d bytes", ART_BODY_MAX);
                break;
            }
            size_t n = (len > 0 ? (size_t)len : (size_t)ART_BODY_MAX) - got;
            if ((size_t)avail < n) n = (size_t)avail;
            const int r = s.read(s_body + got, n);
            if (r < 0) {
                snprintf(err, errn, "read failed after %u bytes", (unsigned)got);
                break;
            }
            got += (size_t)r;
        } else if (peer_closed(s)) {
            if (len > 0) snprintf(err, errn, "closed after %u of %d bytes", (unsigned)got, len);
            break;                                      // without a length, the close is the end
        } else {
            vTaskDelay(pdMS_TO_TICKS(5));               // yield: the task watchdog watches this core
        }
    }
    http.end();
    if (err[0]) return 0;
    if (!got) {
        snprintf(err, errn, "empty body");
        return 0;
    }
    return got;
}

// ---- The decode ----

// Where the decoder's blocks of pixels go: a w by h RGB565 picture, rows w apart.
struct DrawTarget {
    uint16_t* px;
    int w;
    int h;
};

static int on_draw(JPEGDRAW* pDraw) {
    const JPEGDRAW& d = *pDraw;
    const DrawTarget& t = *(const DrawTarget*)d.pUser;
    if (d.x >= t.w || d.y >= t.h) return 1;
    const int cols = d.x + d.iWidthUsed > t.w ? t.w - d.x : d.iWidthUsed;
    const int rows = d.y + d.iHeight > t.h ? t.h - d.y : d.iHeight;
    for (int r = 0; r < rows; r++) {
        memcpy(t.px + (size_t)(d.y + r) * t.w + d.x, d.pPixels + (size_t)r * d.iWidth,
               (size_t)cols * sizeof(uint16_t));
    }
    return 1;
}

// v scaled down by 2 to the power `shift`, rounded up as the decoder does.
static int scaled(int v, int shift) {
    return (v + (1 << shift) - 1) >> shift;
}

// Decode the n bytes in s_body into px, halved as often as it takes (up to an
// eighth) to fit the square. False with err filled in.
static bool decode(size_t n, uint16_t* px, int* w_out, int* h_out, char* err, size_t errn) {
    JPEGDEC& j = *s_jpeg;
    if (!j.openRAM(s_body, (int)n, on_draw)) {
        snprintf(err, errn, "not a JPEG the decoder takes (error %d)", j.getLastError());
        return false;
    }
    if (j.getJPEGType() == JPEG_MODE_PROGRESSIVE) {   // it would come out an eighth of its size
        j.close();
        snprintf(err, errn, "progressive JPEG, the engine must save baseline");
        return false;
    }
    const int w = j.getWidth();
    const int h = j.getHeight();
    int shift = 0;
    while (shift < 3 && (scaled(w, shift) > s_px || scaled(h, shift) > s_px)) shift++;
    const int ow = scaled(w, shift);
    const int oh = scaled(h, shift);
    if (ow < 1 || oh < 1 || ow > s_px || oh > s_px) {
        j.close();
        snprintf(err, errn, "%dx%d does not fit %d px", w, h, s_px);
        return false;
    }
    static const int SCALE[] = { 0, JPEG_SCALE_HALF, JPEG_SCALE_QUARTER, JPEG_SCALE_EIGHTH };
    DrawTarget t = { px, ow, oh };
    j.setPixelType(RGB565_LITTLE_ENDIAN);   // LVGL's RGB565
    j.setUserPointer(&t);
    const int ok = j.decode(0, 0, SCALE[shift]);
    const int e = j.getLastError();
    j.close();
    if (!ok) {
        snprintf(err, errn, "decode failed (error %d)", e);
        return false;
    }
    *w_out = ow;
    *h_out = oh;
    return true;
}

// ---- The task ----

static void art_task(void* arg) {
    (void)arg;
    char id[ART_ID_MAX + 1];
    char base[ART_BASE_MAX + 1];
    char url[ART_BASE_MAX + ART_ID_MAX + 8];
    char err[ART_ERR_MAX];
    for (;;) {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(ART_POLL_MS));
        const bool up = wifi_link_up();
        const uint32_t joins = wifi_link_joins();
        uint16_t* back = nullptr;
        uint32_t base_gen = 0;
        // The page's picture, when it is not cached, not decoded and waiting,
        // not failed, and there is a way to fetch it.
        portENTER_CRITICAL(&s_lock);
        strlcpy(id, s_want, sizeof(id));
        if (id[0] && up && s_base[0] && !s_ready[0] && strcmp(id, s_cached) != 0 &&
            !failed_locked(id, joins)) {
            strlcpy(base, s_base, sizeof(base));
            strlcpy(s_busy, id, sizeof(s_busy));
            base_gen = s_base_gen;
            back = s_buf[1 - s_front];              // never the one on the panel
        }
        portEXIT_CRITICAL(&s_lock);
        if (!back) continue;

        snprintf(url, sizeof(url), "%s%s.jpg", base, id);
        const uint32_t t0 = millis();
        int w = 0, h = 0;
        err[0] = '\0';
        const size_t n = fetch(url, err, sizeof(err));
        const bool ok = n && decode(n, back, &w, &h, err, sizeof(err));
        const uint32_t ms = millis() - t0;

        portENTER_CRITICAL(&s_lock);
        s_busy[0] = '\0';
        s_last_ms = ms;
        s_last_bytes = (uint32_t)n;
        if (ok) {
            strlcpy(s_ready, id, sizeof(s_ready));
            s_ready_w = w;
            s_ready_h = h;
            s_n_ok++;
        } else {
            strlcpy(s_failed, id, sizeof(s_failed));
            s_failed_joins = joins;
            s_failed_base = base_gen;
            strlcpy(s_last_err, err, sizeof(s_last_err));
            s_n_failed++;
        }
        portEXIT_CRITICAL(&s_lock);
        if (ok) wifi_link_log("art: %s %dx%d, %u bytes in %lu ms", id, w, h, (unsigned)n, (unsigned long)ms);
        else    wifi_link_log("art: %s not shown: %s", id, err);
    }
}

// ---- The loop's side ----

void art_init(int px) {
    if (s_task || px <= 0) return;
    Preferences prefs;
    if (prefs.begin("art", true)) {   // false when nothing was ever stored
        prefs.getString("base", s_base, sizeof(s_base));
        prefs.end();
    }
    const size_t pix = (size_t)px * px * sizeof(uint16_t);
    s_buf[0] = (uint16_t*)heap_caps_malloc(pix, MALLOC_CAP_SPIRAM);
    s_buf[1] = (uint16_t*)heap_caps_malloc(pix, MALLOC_CAP_SPIRAM);
    s_body   = (uint8_t*)heap_caps_malloc(ART_BODY_MAX, MALLOC_CAP_SPIRAM);
    // The decoder's tables are read hard while it works: internal RAM when there is room.
    void* jm = heap_caps_malloc(sizeof(JPEGDEC), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!jm) jm = heap_caps_malloc(sizeof(JPEGDEC), MALLOC_CAP_SPIRAM);
    if (!s_buf[0] || !s_buf[1] || !s_body || !jm) {
        heap_caps_free(s_buf[0]);
        heap_caps_free(s_buf[1]);
        heap_caps_free(s_body);
        heap_caps_free(jm);
        s_buf[0] = s_buf[1] = nullptr;
        s_body = nullptr;
        Serial.println("art: out of memory, the card goes without art");
        return;
    }
    s_jpeg = new (jm) JPEGDEC();
    s_px = px;
    if (xTaskCreatePinnedToCore(art_task, "art", ART_TASK_STACK, nullptr, ART_TASK_PRIO,
                                &s_task, ART_TASK_CORE) != pdPASS) {
        s_task = nullptr;
        Serial.println("art: no task, the card goes without art");
        return;
    }
    if (s_base[0]) Serial.printf("art: %d px, base %s\n", px, s_base);
    else           Serial.printf("art: %d px, no base yet (art <base url>)\n", px);
}

void art_want(const char* id) {
    if (!s_task) return;
    portENTER_CRITICAL(&s_lock);
    strlcpy(s_want, id ? id : "", sizeof(s_want));
    // A picture that failed gets another try once the page has named another.
    if (strcmp(s_want, s_failed) != 0) s_failed[0] = '\0';
    portEXIT_CRITICAL(&s_lock);
    xTaskNotifyGive(s_task);
}

const lv_image_dsc_t* art_get(const char* id, bool* coming) {
    if (coming) *coming = false;
    if (!s_task) return nullptr;
    if (s_ready[0]) {   // a decode has finished: take it in if the page still wants it, else drop it
        bool took = false;
        int w = 0, h = 0;
        portENTER_CRITICAL(&s_lock);
        if (strcmp(s_ready, s_want) == 0) {
            s_front = 1 - s_front;
            strlcpy(s_cached, s_ready, sizeof(s_cached));
            w = s_ready_w;
            h = s_ready_h;
            took = true;
        }
        s_ready[0] = '\0';
        portEXIT_CRITICAL(&s_lock);
        if (took) {
            lv_image_cache_drop(&s_dsc);   // same descriptor, new pixels
            memset(&s_dsc, 0, sizeof(s_dsc));
            s_dsc.header.magic  = LV_IMAGE_HEADER_MAGIC;
            s_dsc.header.cf     = LV_COLOR_FORMAT_RGB565;
            s_dsc.header.w      = (uint32_t)w;
            s_dsc.header.h      = (uint32_t)h;
            s_dsc.header.stride = (uint32_t)w * sizeof(uint16_t);
            s_dsc.data_size     = (uint32_t)w * h * sizeof(uint16_t);
            s_dsc.data          = (const uint8_t*)s_buf[s_front];
        }
        xTaskNotifyGive(s_task);   // the other buffer is free: a picture asked for meanwhile goes next
    }
    if (!id || !*id) return nullptr;
    if (strcmp(id, s_cached) == 0) return &s_dsc;   // s_cached changes only here, on this task
    if (coming) {
        const bool up = wifi_link_up();
        const uint32_t joins = wifi_link_joins();
        portENTER_CRITICAL(&s_lock);
        *coming = up && s_base[0] && !failed_locked(id, joins);
        portEXIT_CRITICAL(&s_lock);
    }
    return nullptr;
}

static void print_status(void) {
    char base[ART_BASE_MAX + 1], want[ART_ID_MAX + 1], cached[ART_ID_MAX + 1];
    char busy[ART_ID_MAX + 1], failed[ART_ID_MAX + 1], last_err[ART_ERR_MAX];
    uint32_t n_ok, n_failed, last_ms, last_bytes;
    portENTER_CRITICAL(&s_lock);
    strlcpy(base, s_base, sizeof(base));
    strlcpy(want, s_want, sizeof(want));
    strlcpy(cached, s_cached, sizeof(cached));
    strlcpy(busy, s_busy, sizeof(busy));
    strlcpy(failed, s_failed, sizeof(failed));
    strlcpy(last_err, s_last_err, sizeof(last_err));
    n_ok = s_n_ok;
    n_failed = s_n_failed;
    last_ms = s_last_ms;
    last_bytes = s_last_bytes;
    portEXIT_CRITICAL(&s_lock);
    Serial.printf("art: base %s\n", base[0] ? base : "not set (art <base url>)");
    Serial.printf("art: %s, %d px square, wifi %s\n", s_task ? "on" : "off", s_px,
                  wifi_link_up() ? "up" : "down");
    Serial.printf("art: wanted %s, cached %s, fetching %s\n", want[0] ? want : "none",
                  cached[0] ? cached : "none", busy[0] ? busy : "none");
    Serial.printf("art: %lu fetched, %lu failed; the last took %lu ms for %lu bytes\n",
                  (unsigned long)n_ok, (unsigned long)n_failed, (unsigned long)last_ms,
                  (unsigned long)last_bytes);
    if (last_err[0]) Serial.printf("art: last failure %s: %s\n", failed[0] ? failed : "(since retried)", last_err);
    if (s_task) {
        Serial.printf("art: task stack %u bytes never used\n",
                      (unsigned)uxTaskGetStackHighWaterMark(s_task));
    }
}

// Store the art base: http:// only (HTTPClient would turn anything else into
// TLS), printable characters, no spaces, ending in '/' (added when missing).
static void set_base(const char* url) {
    char b[ART_BASE_MAX + 1];
    const size_t n = strlen(url);
    bool printable = n > 7;
    for (size_t i = 0; i < n && printable; i++) printable = url[i] > ' ' && url[i] < 0x7F;
    if (!printable || strncmp(url, "http://", 7) != 0 || n + (url[n - 1] != '/') > ART_BASE_MAX) {
        Serial.printf("art: a base is http://host:port/path/ in %d characters at most, nothing stored\n",
                      ART_BASE_MAX);
        return;
    }
    snprintf(b, sizeof(b), "%s%s", url, url[n - 1] == '/' ? "" : "/");
    Preferences prefs;
    if (!prefs.begin("art", false) || prefs.putString("base", b) != strlen(b)) {
        prefs.end();
        Serial.println("art: NVS write failed, nothing stored");
        return;
    }
    prefs.end();
    portENTER_CRITICAL(&s_lock);
    strlcpy(s_base, b, sizeof(s_base));
    s_base_gen++;
    portEXIT_CRITICAL(&s_lock);
    if (s_task) xTaskNotifyGive(s_task);
    Serial.printf("art: base %s stored\n", b);
}

void art_serial(char* args) {
    if (strcmp(args, "status") == 0) print_status();
    else if (*args)                  set_base(args);
    else                             Serial.println("usage: art <base url>, art status");
}
#endif
