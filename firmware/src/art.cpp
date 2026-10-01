// Album art for the music card (art.h). Built only with FEATURE_PICTURE;
// without it this file compiles to nothing.
#ifdef FEATURE_PICTURE
#include "art.h"
#include "ble.h"
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
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
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
// when the page wants a picture, the loop has taken one in or hands it one
// put together over BLE, and every ART_POLL_MS while a wanted picture waits on
// Wi-Fi, a base or its turn after BLE.
#define ART_POLL_MS    1000
#define ART_TASK_STACK 8192
#define ART_TASK_PRIO  1
#define ART_TASK_CORE  0

// Album art over BLE (art.h).
#define ART_PIECE_MAX  510   // the most picture bytes in one chunk: an ATT value holds 512 at most
#define ART_STAGE      8     // chunks kept while no picture under way can take them
#define ART_LOCK_MS    20    // the NimBLE task's wait for s_ble_mx; a chunk that waits longer is dropped, then missed
#define ART_MISS_MAX   250   // the longest miss message, bytes; the link's TX room may make it shorter

// LVGL's word for "this descriptor has new pixels" (lv_image_cache.c). LVGL 9.6
// keeps its header private, so it is declared here; the caches are off in this
// build (LV_CACHE_DEF_SIZE and LV_IMAGE_HEADER_CACHE_DEF_CNT are 0), and the
// call keeps the swap right should one ever be turned on.
extern "C" void lv_image_cache_drop(const void* src);

// How the decoder left a picture from BLE, for the loop (art_ble_tick).
enum dec_end_t : uint8_t { DEC_NONE, DEC_READY, DEC_HERE, DEC_FAILED };

// Shared by the loop and the task, under s_lock.
static portMUX_TYPE s_lock = portMUX_INITIALIZER_UNLOCKED;
static char     s_want[ART_ID_MAX + 1]   = "";   // the page's picture
static uint32_t s_want_ms = 0;                   // millis() when the page named it
static char     s_cached[ART_ID_MAX + 1] = "";   // decoded in s_buf[s_front], the one the loop shows
static char     s_ready[ART_ID_MAX + 1]  = "";   // decoded in the other buffer, not taken in yet
static int      s_ready_w = 0;
static int      s_ready_h = 0;
static bool     s_ready_ble   = false;           // it came over BLE (art_get keeps it, and answers "ok")
static uint32_t s_ready_bytes = 0;               // its JPEG's bytes, for the log
static uint32_t s_ready_t0    = 0;               // millis() when its header came, for the log
static char     s_busy[ART_ID_MAX + 1]   = "";   // being fetched now
static char     s_failed[ART_ID_MAX + 1] = "";   // the last picture that failed, not fetched again
static uint32_t s_failed_joins = 0;              // while Wi-Fi has not joined since
static uint32_t s_failed_base  = 0;              // and the base is the one it failed with
static char     s_base[ART_BASE_MAX + 1] = "";
static uint32_t s_base_gen = 0;                  // counts base changes
static int      s_front = 0;                     // the s_buf the loop shows
// The BLE side as the fetch and `coming` see it, kept by the loop:
static char     s_ble_on[ART_ID_MAX + 1]   = ""; // the picture BLE delivers next: under way, decoding or waiting
static char     s_ble_lost[ART_ID_MAX + 1] = ""; // the last picture BLE gave up or could not decode
// A picture put together over BLE, handed from the loop to the task:
static char     s_dec_id[ART_ID_MAX + 1] = "";   // whole in s_ble_buf, for the task to decode
static uint32_t s_dec_bytes = 0;
static uint32_t s_dec_t0    = 0;
static uint8_t  s_dec_end   = DEC_NONE;          // set by the task when it is done with s_ble_buf

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

// ---- Album art over BLE: the picture being put together ----
// Chunks come on the NimBLE host task, headers and the timers on the loop, and
// the task decodes. s_ble_mx keeps the assembly between them: a mutex, not a
// critical section, since a chunk is copied into PSRAM under it and that
// should not hold interrupts off a core that keeps the RGB panel fed. The
// decoder reads s_ble_buf without it, in PHASE_DECODING, when nothing writes it.
enum phase_t : uint8_t { PHASE_IDLE, PHASE_TAKING, PHASE_DECODING };

struct Piece {             // a chunk kept until a picture can take it
    uint32_t at;           // millis() when it came
    uint16_t k;            // its index
    uint16_t n;            // its bytes
    uint8_t  data[ART_PIECE_MAX];
};

static SemaphoreHandle_t s_ble_mx = nullptr;   // published last by art_init; a chunk before it is dropped
static uint8_t*  s_ble_buf = nullptr;          // ART_BLE_MAX bytes, in PSRAM
static Piece*    s_stage   = nullptr;          // ART_STAGE of them, in PSRAM
// Under s_ble_mx:
static phase_t s_phase = PHASE_IDLE;
static char     s_id[ART_ID_MAX + 1] = "";     // the picture under way (or being decoded)
static uint32_t s_bytes = 0;                   // its "al"
static uint16_t s_count = 0;                   // its "an"
static uint32_t s_rx    = 0;                   // millis() when its header came over the air
static uint16_t s_size  = 0;                   // the bytes of every chunk but the last; 0 until one says
static uint16_t s_tail  = 0;                   // the bytes of the last chunk; 0 until it came
static uint16_t s_got   = 0;                   // chunks in place
static uint32_t s_have[ART_BLE_CHUNKS / 32];   // a bit a chunk in place
static uint8_t  s_staged = 0;                  // pieces in s_stage
static char     s_next[ART_ID_MAX + 1] = "";   // a header waiting for the decoder to let go of s_ble_buf
static uint32_t s_next_bytes = 0;
static uint16_t s_next_count = 0;
static uint32_t s_next_rx    = 0;
static uint32_t s_n_chunks  = 0;               // for `art status`: chunk writes taken
static uint32_t s_n_unused  = 0;               // and those that went into no picture
// The NimBLE task's alone:
static volatile uint32_t s_n_busy = 0;         // chunks dropped because the lock was busy
// The loop's alone:
static uint32_t s_t0      = 0;                 // millis() when the header of the picture under way came
static uint32_t s_miss_at = 0;                 // millis() of its next miss
static uint8_t  s_rounds  = 0;                 // misses sent for it
static uint32_t s_n_headers = 0;               // for `art status`
static uint32_t s_n_misses  = 0;
static uint32_t s_n_ble_ok  = 0;
static uint32_t s_n_ble_failed = 0;
static uint32_t s_ble_last_ms  = 0;

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

// Decode the n bytes of JPEG at src (a fetch's s_body, or s_ble_buf) into px,
// halved as often as it takes (up to an eighth) to fit the square. False with
// err filled in.
static bool decode(const uint8_t* src, size_t n, uint16_t* px, int* w_out, int* h_out,
                   char* err, size_t errn) {
    JPEGDEC& j = *s_jpeg;
    if (!j.openRAM((uint8_t*)src, (int)n, on_draw)) {   // the decoder only reads it
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

// A picture put together over BLE (s_ble_buf), once the loop has handed it
// over and the other buffer is free: decoded there as a fetch is, into
// s_ready. True when it took one; how that ended goes to the loop in
// s_dec_end, and s_ble_buf is the loop's again from then on.
static bool decode_handed_over(char* err, size_t errn) {
    char id[ART_ID_MAX + 1];
    uint32_t n = 0, t0 = 0;
    uint16_t* back = nullptr;
    bool here = false;
    portENTER_CRITICAL(&s_lock);
    if (s_dec_id[0] && !s_ready[0]) {
        strlcpy(id, s_dec_id, sizeof(id));
        n  = s_dec_bytes;
        t0 = s_dec_t0;
        s_dec_id[0] = '\0';
        here = strcmp(id, s_cached) == 0;   // a fetch brought the same picture first
        back = s_buf[1 - s_front];          // never the one on the panel
    }
    portEXIT_CRITICAL(&s_lock);
    if (!back) return false;

    int w = 0, h = 0;
    err[0] = '\0';
    const bool ok = here || decode(s_ble_buf, n, back, &w, &h, err, errn);

    portENTER_CRITICAL(&s_lock);
    if (here) {
        s_dec_end = DEC_HERE;
    } else if (ok) {
        strlcpy(s_ready, id, sizeof(s_ready));
        s_ready_w     = w;
        s_ready_h     = h;
        s_ready_ble   = true;
        s_ready_bytes = n;
        s_ready_t0    = t0;
        s_dec_end = DEC_READY;
    } else {
        s_dec_end = DEC_FAILED;
    }
    portEXIT_CRITICAL(&s_lock);
    if (!ok) wifi_link_log("art: %s from ble not shown: %s", id, err);
    return true;
}

static void art_task(void* arg) {
    (void)arg;
    char id[ART_ID_MAX + 1];
    char base[ART_BASE_MAX + 1];
    char url[ART_BASE_MAX + ART_ID_MAX + 8];
    char err[ART_ERR_MAX];
    for (;;) {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(ART_POLL_MS));
        // A picture from BLE first: the host is waiting for its answer.
        if (decode_handed_over(err, sizeof(err))) continue;
        const bool up = wifi_link_up();
        const uint32_t joins = wifi_link_joins();
        uint16_t* back = nullptr;
        uint32_t base_gen = 0;
        // The page's picture, when it is not cached, not decoded and waiting,
        // not failed, not coming over BLE (under way there, or named less than
        // ART_BLE_WAIT_MS ago), and there is a way to fetch it.
        portENTER_CRITICAL(&s_lock);
        // The clock is read under the lock: art_want stamps s_want_ms under it
        // from the loop, and a time read before that stamp would wrap the wait
        // below past ART_BLE_WAIT_MS at once.
        const uint32_t now = millis();
        strlcpy(id, s_want, sizeof(id));
        if (id[0] && up && s_base[0] && !s_ready[0] && !s_dec_id[0] && strcmp(id, s_cached) != 0 &&
            !failed_locked(id, joins) && strcmp(id, s_ble_on) != 0 &&
            now - s_want_ms >= ART_BLE_WAIT_MS) {
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
        const bool ok = n && decode(s_body, n, back, &w, &h, err, sizeof(err));
        const uint32_t ms = millis() - t0;

        portENTER_CRITICAL(&s_lock);
        s_busy[0] = '\0';
        s_last_ms = ms;
        s_last_bytes = (uint32_t)n;
        if (ok) {
            strlcpy(s_ready, id, sizeof(s_ready));
            s_ready_w = w;
            s_ready_h = h;
            s_ready_ble = false;
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

// ---- Album art over BLE: the assembly ----

static inline bool piece_in(const uint32_t* have, uint16_t k) {
    return (have[k >> 5] >> (k & 31)) & 1u;
}

// Put chunk k (n bytes at p) into the picture under way. Under s_ble_mx, in
// PHASE_TAKING. The first chunk sets the size of every chunk but the last; when
// the last comes first, the header's bytes and chunks give the size instead.
// A resend of a chunk in place is let be. One outside the picture, of a size
// that does not fit the others, or reaching past the header's bytes goes
// unused, and the miss asks for it again.
static void place(uint16_t k, const uint8_t* p, uint16_t n) {
    if (k < s_count && piece_in(s_have, k)) return;
    const bool last = k + 1 == s_count;
    uint32_t size = s_size;
    if (!size && k < s_count) {
        if (!last || s_count == 1)                                     size = n;
        else if (s_bytes > n && (s_bytes - n) % (s_count - 1) == 0)    size = (s_bytes - n) / (s_count - 1);
    }
    if (k >= s_count || !size || size > ART_PIECE_MAX || (last ? n > size : n != size) ||
        (uint32_t)k * size + n > s_bytes) {
        s_n_unused++;
        return;
    }
    s_size = (uint16_t)size;
    memcpy(s_ble_buf + (size_t)k * size, p, n);
    s_have[k >> 5] |= 1u << (k & 31);
    s_got++;
    if (last) s_tail = n;
}

// Keep a chunk for later: no picture under way can take it, or a message
// waits for the loop that may be the header it belongs to. With the stage
// full the oldest goes. Under s_ble_mx.
static void stage(uint16_t k, const uint8_t* p, uint16_t n) {
    uint8_t i = s_staged;
    if (i < ART_STAGE) {
        s_staged++;
    } else {
        i = 0;
        for (uint8_t j = 1; j < ART_STAGE; j++) {
            if ((int32_t)(s_stage[j].at - s_stage[i].at) < 0) i = j;
        }
        s_n_unused++;
    }
    Piece& c = s_stage[i];
    c.at = millis();
    c.k  = k;
    c.n  = n;
    memcpy(c.data, p, n);
}

// Put the staged chunks that came at or after `since` (the header of the
// picture under way) into it; older ones belong to no picture still coming.
// Empties the stage. Under s_ble_mx, in PHASE_TAKING.
static void unstage(uint32_t since) {
    for (uint8_t i = 0; i < s_staged; i++) {
        const Piece& c = s_stage[i];
        if ((int32_t)(c.at - since) >= 0) place(c.k, c.data, c.n);
        else                              s_n_unused++;
    }
    s_staged = 0;
}

// Start putting `id` together from nothing, then take in the chunks that came
// after its header (rx) but before the loop read it. Under s_ble_mx; on the
// loop, so the loop's own clock starts here too, from the header's arrival.
static void start_locked(const char* id, uint32_t bytes, uint16_t count, uint32_t rx) {
    strlcpy(s_id, id, sizeof(s_id));
    s_bytes = bytes;
    s_count = count;
    s_rx    = rx;
    s_size = s_tail = s_got = 0;
    memset(s_have, 0, sizeof(s_have));
    s_phase = PHASE_TAKING;
    unstage(rx);
    s_t0      = rx;
    s_miss_at = rx + ART_BLE_MISS_MS;
    s_rounds  = 0;
}

// The picture BLE delivers next, as the state now says: a header waiting for
// the decoder, else the picture under way or being decoded, else none. Under
// s_ble_mx.
static void next_on_locked(char* out, size_t outn) {
    strlcpy(out, s_next[0] ? s_next : s_phase != PHASE_IDLE ? s_id : "", outn);
}

// Tell the fetch and `coming` which picture BLE delivers next. One that comes
// again is no longer given up.
static void set_ble_on(const char* id) {
    portENTER_CRITICAL(&s_lock);
    strlcpy(s_ble_on, id, sizeof(s_ble_on));
    if (*id && strcmp(s_ble_lost, id) == 0) s_ble_lost[0] = '\0';
    portEXIT_CRITICAL(&s_lock);
}

// BLE gave `id` up, or it would not decode: the card goes without it (or
// fetches it, Wi-Fi up) until the page names another picture or a header
// brings it again.
static void set_ble_lost(const char* id) {
    s_n_ble_failed++;
    portENTER_CRITICAL(&s_lock);
    strlcpy(s_ble_lost, id, sizeof(s_ble_lost));
    if (strcmp(s_ble_on, id) == 0) s_ble_on[0] = '\0';
    portEXIT_CRITICAL(&s_lock);
    if (s_task) xTaskNotifyGive(s_task);   // Wi-Fi may fetch it now
}

static void send_ok(const char* id) {
    char msg[8 + ART_ID_MAX + 16];
    snprintf(msg, sizeof(msg), "{\"art\":\"%s\",\"ok\":1}", id);
    ble_send_art(msg);
}

// {"art":"<id>","miss":[k,...]}: the chunks `have` lacks of `count`, from the
// first, as many as one TX notification carries; the rest go on the next
// miss. The count listed: 0 when none fit, or no host is subscribed, and
// nothing was sent.
static uint16_t send_miss(const char* id, const uint32_t* have, uint16_t count) {
    size_t room = ble_tx_max();
    if (room > ART_MISS_MAX) room = ART_MISS_MAX;
    char msg[ART_MISS_MAX + 1];
    size_t len = (size_t)snprintf(msg, sizeof(msg), "{\"art\":\"%s\",\"miss\":[", id);
    uint16_t listed = 0;
    for (uint16_t k = 0; k < count; k++) {
        if (piece_in(have, k)) continue;
        char num[8];
        const int n = snprintf(num, sizeof(num), listed ? ",%u" : "%u", (unsigned)k);
        if (len + (size_t)n + 2 > room) break;   // "]}" must fit after it
        memcpy(msg + len, num, (size_t)n);
        len += (size_t)n;
        listed++;
    }
    if (!listed) return 0;
    memcpy(msg + len, "]}", 3);
    return ble_send_art(msg) ? listed : 0;
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
    s_ble_buf = (uint8_t*)heap_caps_malloc(ART_BLE_MAX, MALLOC_CAP_SPIRAM);
    s_stage   = (Piece*)heap_caps_malloc(sizeof(Piece) * ART_STAGE, MALLOC_CAP_SPIRAM);
    SemaphoreHandle_t mx = xSemaphoreCreateMutex();
    // The decoder's tables are read hard while it works: internal RAM when there is room.
    void* jm = heap_caps_malloc(sizeof(JPEGDEC), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!jm) jm = heap_caps_malloc(sizeof(JPEGDEC), MALLOC_CAP_SPIRAM);
    if (!s_buf[0] || !s_buf[1] || !s_body || !s_ble_buf || !s_stage || !mx || !jm) {
        heap_caps_free(s_buf[0]);
        heap_caps_free(s_buf[1]);
        heap_caps_free(s_body);
        heap_caps_free(s_ble_buf);
        heap_caps_free(s_stage);
        heap_caps_free(jm);
        if (mx) vSemaphoreDelete(mx);
        s_buf[0] = s_buf[1] = nullptr;
        s_body = s_ble_buf = nullptr;
        s_stage = nullptr;
        Serial.println("art: out of memory, the card goes without art");
        return;
    }
    s_jpeg = new (jm) JPEGDEC();
    s_px = px;
    if (xTaskCreatePinnedToCore(art_task, "art", ART_TASK_STACK, nullptr, ART_TASK_PRIO,
                                &s_task, ART_TASK_CORE) != pdPASS) {
        s_task = nullptr;
        vSemaphoreDelete(mx);
        Serial.println("art: no task, the card goes without art");
        return;
    }
    // From here on the NimBLE task puts chunks in (art_ble_chunk): everything
    // it uses is in place before it can see the lock.
    __atomic_store_n(&s_ble_mx, mx, __ATOMIC_RELEASE);
    if (s_base[0]) Serial.printf("art: %d px, base %s\n", px, s_base);
    else           Serial.printf("art: %d px, no base yet (art <base url>)\n", px);
}

void art_want(const char* id) {
    if (!s_task) return;
    const uint32_t now = millis();
    portENTER_CRITICAL(&s_lock);
    strlcpy(s_want, id ? id : "", sizeof(s_want));
    s_want_ms = now;
    // A picture that failed gets another try once the page has named another.
    if (strcmp(s_want, s_failed) != 0) s_failed[0] = '\0';
    if (strcmp(s_want, s_ble_lost) != 0) s_ble_lost[0] = '\0';
    portEXIT_CRITICAL(&s_lock);
    xTaskNotifyGive(s_task);
}

// A picture from BLE has left the decoder: on the card, answered "ok", or not
// kept, because the page's own picture is there.
static void answer_ble_picture(const char* id, uint32_t bytes, uint32_t t0, bool took) {
    if (!took) {
        Serial.printf("art: %s from ble not kept, the page shows another picture\n", id);
        return;
    }
    const uint32_t ms = millis() - t0;
    s_n_ble_ok++;
    s_ble_last_ms = ms;
    Serial.printf("art: %s from ble, %lu bytes in %lu ms\n", id, (unsigned long)bytes, (unsigned long)ms);
    send_ok(id);
}

const lv_image_dsc_t* art_get(const char* id, bool* coming) {
    if (coming) *coming = false;
    if (!s_task) return nullptr;
    if (s_ready[0]) {   // a decode has finished: take it in, or drop it
        bool took = false;
        bool ble = false;
        int w = 0, h = 0;
        char rid[ART_ID_MAX + 1];
        uint32_t rbytes = 0, rt0 = 0;
        portENTER_CRITICAL(&s_lock);
        ble = s_ready_ble;
        // The page's picture is taken in. So is one from BLE whatever the page
        // shows, unless it would put the page's own picture off the card: the
        // host sent it for this board, and sends it again only after another id.
        if (strcmp(s_ready, s_want) == 0 || (ble && !(s_want[0] && strcmp(s_want, s_cached) == 0))) {
            s_front = 1 - s_front;
            strlcpy(s_cached, s_ready, sizeof(s_cached));
            w = s_ready_w;
            h = s_ready_h;
            took = true;
        }
        strlcpy(rid, s_ready, sizeof(rid));
        rbytes = s_ready_bytes;
        rt0    = s_ready_t0;
        s_ready[0]  = '\0';
        s_ready_ble = false;
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
        if (ble) answer_ble_picture(rid, rbytes, rt0, took);
        xTaskNotifyGive(s_task);   // the other buffer is free: a picture asked for meanwhile goes next
    }
    if (!id || !*id) return nullptr;
    if (strcmp(id, s_cached) == 0) return &s_dsc;   // s_cached changes only here, on this task
    if (coming) {
        const bool up = wifi_link_up();
        const uint32_t joins = wifi_link_joins();
        const uint32_t now = millis();
        portENTER_CRITICAL(&s_lock);
        const bool ble = strcmp(id, s_ble_on) == 0 ||
                         (strcmp(id, s_want) == 0 && now - s_want_ms < ART_BLE_WAIT_MS &&
                          strcmp(id, s_ble_lost) != 0);
        *coming = ble || (up && s_base[0] && !failed_locked(id, joins));
        portEXIT_CRITICAL(&s_lock);
    }
    return nullptr;
}

bool art_ble_begin(const char* id, long bytes, long chunks) {
    s_n_headers++;
    const bool id_ok = art_id_ok(id);
    if (!s_ble_mx) {
        Serial.printf("art: ble header for %s not taken, art is off\n", id_ok ? id : "a bad id");
        return true;
    }
    const char* why =
        !id_ok                                        ? "the id is not 8 to 16 of a to z and 0 to 9"
      : bytes < 1 || bytes > ART_BLE_MAX              ? "al is not 1 to 24576"
      : chunks < 1 || chunks > ART_BLE_CHUNKS         ? "an is not 1 to 512"
      : chunks > bytes || chunks * ART_PIECE_MAX < bytes ? "al and an do not fit together"
      : nullptr;
    const uint32_t rx = ble_last_host_write_ms();   // when the header came over the air
    // s_cached changes only on the loop (art_get), so it is read here as it is.
    const bool here = !why && strcmp(id, s_cached) == 0;

    char dropped[ART_ID_MAX + 1] = "";   // a picture half built that this header ends
    uint16_t dropped_got = 0, dropped_count = 0;
    char left[ART_ID_MAX + 1] = "";      // a header still waiting for the decoder that this one leaves behind
    char on[ART_ID_MAX + 1];
    xSemaphoreTake(s_ble_mx, portMAX_DELAY);
    if (s_next[0] && (why || strcmp(id, s_next) != 0)) strlcpy(left, s_next, sizeof(left));
    s_next[0] = '\0';
    if (s_phase == PHASE_TAKING && (why || here || strcmp(id, s_id) != 0)) {
        strlcpy(dropped, s_id, sizeof(dropped));
        dropped_got   = s_got;
        dropped_count = s_count;
        s_phase = PHASE_IDLE;
    }
    if (!why && !here) {
        if (s_phase != PHASE_DECODING) {
            start_locked(id, (uint32_t)bytes, (uint16_t)chunks, rx);   // over from nothing, the same id too
        } else if (strcmp(id, s_id) != 0) {
            // The decoder holds s_ble_buf: this header waits for it
            // (art_ble_tick), its chunks meanwhile on the stage.
            strlcpy(s_next, id, sizeof(s_next));
            s_next_bytes = (uint32_t)bytes;
            s_next_count = (uint16_t)chunks;
            s_next_rx    = rx;
        }
        // else: the picture is being decoded already, and its answer follows.
    }
    next_on_locked(on, sizeof(on));
    xSemaphoreGive(s_ble_mx);
    set_ble_on(on);

    if (dropped[0]) {
        Serial.printf("art: %s from ble dropped at %u of %u chunks, %s\n", dropped,
                      (unsigned)dropped_got, (unsigned)dropped_count,
                      why ? "a header was refused" : "the host went on to another picture");
    }
    if (left[0]) {
        Serial.printf("art: %s from ble dropped before it started, %s\n", left,
                      why ? "a header was refused" : "the host went on to another picture");
    }
    if (why) {
        Serial.printf("art: ble header refused, %s (al %ld, an %ld)\n", why, bytes, chunks);
        return false;
    }
    if (here) {
        Serial.printf("art: %s is on the card already, ok without chunks\n", id);
        send_ok(id);
    }
    return true;
}

void art_ble_chunk(const uint8_t* data, size_t len) {
    SemaphoreHandle_t mx = __atomic_load_n(&s_ble_mx, __ATOMIC_ACQUIRE);
    if (!mx || !data) return;   // art is off
    if (xSemaphoreTake(mx, pdMS_TO_TICKS(ART_LOCK_MS)) != pdTRUE) {
        s_n_busy = s_n_busy + 1;   // missed, and asked for again
        return;
    }
    s_n_chunks++;
    if (len < 3 || len > 2 + ART_PIECE_MAX) {
        s_n_unused++;
    } else {
        const uint16_t k = (uint16_t)(data[0] | (data[1] << 8));
        const uint16_t n = (uint16_t)(len - 2);
        // While a message waits for the loop it may be the header of the next
        // picture, so the chunk waits beside it rather than go into this one.
        if (s_phase == PHASE_TAKING && !ble_has_data()) place(k, data + 2, n);
        else                                          stage(k, data + 2, n);
    }
    xSemaphoreGive(mx);
}

void art_ble_tick(void) {
    if (!s_ble_mx) return;
    const uint32_t now = millis();
    char id[ART_ID_MAX + 1] = "";
    char on[ART_ID_MAX + 1];

    // The decoder is done with a picture: s_ble_buf is free again, and a
    // header that waited for it starts, on the clock of its arrival.
    portENTER_CRITICAL(&s_lock);
    const uint8_t end = s_dec_end;
    s_dec_end = DEC_NONE;
    portEXIT_CRITICAL(&s_lock);
    if (end != DEC_NONE) {
        xSemaphoreTake(s_ble_mx, portMAX_DELAY);
        strlcpy(id, s_id, sizeof(id));
        s_phase = PHASE_IDLE;
        if (s_next[0]) {
            start_locked(s_next, s_next_bytes, s_next_count, s_next_rx);
            s_next[0] = '\0';
        }
        next_on_locked(on, sizeof(on));
        xSemaphoreGive(s_ble_mx);
        set_ble_on(on);
        if (end == DEC_HERE) {
            s_n_ble_ok++;
            Serial.printf("art: %s came over Wi-Fi first, ok to the host\n", id);
            send_ok(id);
        } else if (end == DEC_FAILED) {
            set_ble_lost(id);   // the task has logged why
        }
        // DEC_READY: art_get takes it in and answers.
    }

    // The picture under way: chunks that waited beside a message that was not
    // a header go in; whole, it goes to the decoder; still short when its
    // timer runs out, a miss asks for the rest, until ART_BLE_ROUNDS of them.
    enum { ACT_NONE, ACT_WHOLE, ACT_SHORT, ACT_MISS, ACT_GIVE_UP } act = ACT_NONE;
    uint32_t have[ART_BLE_CHUNKS / 32];
    uint32_t bytes = 0, made = 0;
    uint16_t count = 0, got = 0;
    xSemaphoreTake(s_ble_mx, portMAX_DELAY);
    if (s_phase == PHASE_TAKING) {
        if (s_staged && !ble_has_data()) unstage(s_rx);
        strlcpy(id, s_id, sizeof(id));
        bytes = s_bytes;
        count = s_count;
        got   = s_got;
        if (s_got == s_count) {
            made = (uint32_t)(s_count - 1) * s_size + s_tail;
            if (made == s_bytes) { s_phase = PHASE_DECODING; act = ACT_WHOLE; }
            else                 { s_phase = PHASE_IDLE;     act = ACT_SHORT; }
        } else if ((int32_t)(now - s_miss_at) >= 0) {
            if (s_rounds < ART_BLE_ROUNDS) {
                memcpy(have, s_have, sizeof(have));
                act = ACT_MISS;
            } else {
                s_phase = PHASE_IDLE;
                act = ACT_GIVE_UP;
            }
        }
    }
    xSemaphoreGive(s_ble_mx);

    switch (act) {
        case ACT_WHOLE:
            portENTER_CRITICAL(&s_lock);
            strlcpy(s_dec_id, id, sizeof(s_dec_id));
            s_dec_bytes = bytes;
            s_dec_t0    = s_t0;
            portEXIT_CRITICAL(&s_lock);
            xTaskNotifyGive(s_task);
            break;
        case ACT_SHORT:
            Serial.printf("art: %s from ble not shown: its chunks make %lu bytes, the header said %lu\n",
                          id, (unsigned long)made, (unsigned long)bytes);
            set_ble_lost(id);
            break;
        case ACT_MISS: {
            const uint16_t listed = send_miss(id, have, count);
            s_rounds++;
            s_miss_at = now + ART_BLE_MISS_MS;
            s_n_misses++;
            if (listed) {
                Serial.printf("art: %s from ble, %u of %u chunks missing, miss %u asks for %u\n", id,
                              (unsigned)(count - got), (unsigned)count, (unsigned)s_rounds, (unsigned)listed);
            } else {
                Serial.printf("art: %s from ble, %u of %u chunks missing, miss %u not sent (no host on TX, or no room)\n",
                              id, (unsigned)(count - got), (unsigned)count, (unsigned)s_rounds);
            }
            break;
        }
        case ACT_GIVE_UP:
            Serial.printf("art: %s from ble given up, %u of %u chunks still missing after %u misses\n", id,
                          (unsigned)(count - got), (unsigned)count, (unsigned)ART_BLE_ROUNDS);
            set_ble_lost(id);
            break;
        default:
            break;
    }
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

    // Over BLE.
    if (s_ble_mx) {
        char id[ART_ID_MAX + 1], next[ART_ID_MAX + 1];
        uint32_t chunks, unused;
        uint16_t got, count;
        uint8_t staged;
        phase_t phase;
        xSemaphoreTake(s_ble_mx, portMAX_DELAY);
        strlcpy(id, s_id, sizeof(id));
        strlcpy(next, s_next, sizeof(next));
        chunks = s_n_chunks;
        unused = s_n_unused + s_n_busy;
        got    = s_got;
        count  = s_count;
        staged = s_staged;
        phase  = s_phase;
        xSemaphoreGive(s_ble_mx);
        Serial.printf("art: ble %lu headers, %lu chunks (%lu unused), %lu misses, %lu ok, %lu failed;"
                      " the last took %lu ms\n",
                      (unsigned long)s_n_headers, (unsigned long)chunks, (unsigned long)unused,
                      (unsigned long)s_n_misses, (unsigned long)s_n_ble_ok, (unsigned long)s_n_ble_failed,
                      (unsigned long)s_ble_last_ms);
        if (phase == PHASE_TAKING && s_rounds < ART_BLE_ROUNDS) {
            Serial.printf("art: ble putting %s together, %u of %u chunks, miss %u of %u next\n", id,
                          (unsigned)got, (unsigned)count, (unsigned)s_rounds + 1, (unsigned)ART_BLE_ROUNDS);
        } else if (phase == PHASE_TAKING) {   // every miss sent: what still lacks is given up next
            Serial.printf("art: ble putting %s together, %u of %u chunks, given up next\n", id,
                          (unsigned)got, (unsigned)count);
        } else if (phase == PHASE_DECODING) {
            Serial.printf("art: ble decoding %s%s%s\n", id, next[0] ? ", then " : "", next);
        } else {
            Serial.printf("art: ble idle, %u chunks waiting for a header\n", (unsigned)staged);
        }
    } else {
        Serial.println("art: ble off");
    }
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
