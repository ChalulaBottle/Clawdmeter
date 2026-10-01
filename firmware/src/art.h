#pragma once
// Album art for the music card (plans/labdaemon.md, "Increment 2" and
// "Increment 2b"): sent by the host over the bonded BLE link itself, or fetched
// over Wi-Fi (wifi_link.h) from the engine's LAN listener, and decoded for LVGL
// the same way either way. Built only where the env sets FEATURE_PICTURE
// (lcd_4); on every other board this header declares nothing and art.cpp is
// empty.
//
// A page names its picture with pi, an id of 8 to 16 characters from a to z and
// 0 to 9. The last picture decoded stays cached, so a page naming it again
// shows it at once. A picture the board does not have waits for the host to
// send it over BLE (below); when Wi-Fi is up and ART_BLE_WAIT_MS pass without
// it, the board fetches <base><pi>.jpg instead, the base set once over serial
// (`art <base url>`, kept in NVS: namespace "art", key "base"). One fetch at a
// time, on a task of its own, so the LVGL loop never waits on the network. A
// failure is logged once and leaves the card without art until the page names
// another picture, Wi-Fi joins again or the base changes.
//
// Over BLE: the header {"ab":"<id>","al":<bytes>,"an":<chunks>} comes on the
// JSON RX characteristic like any message (main.cpp, handle_art_header_msg),
// then chunk k on the art characteristic (ble.cpp, ...0005, write without
// response): k as 2 bytes little endian, then the next piece of the JPEG. Every
// chunk but the last carries the same number of bytes, so chunk k lands at k
// times that. The board answers on TX:
//   {"art":"<id>","ok":1}           the picture is on the card (also at once for
//                                   a header naming the picture already there)
//   {"art":"<id>","miss":[k,...]}   chunks still missing, ART_BLE_MISS_MS after
//                                   the header and after each miss, at most
//                                   ART_BLE_ROUNDS times; then it gives up
// A header for another picture drops the one half built. Chunks that come
// before the loop has read their header wait for it.
#ifdef FEATURE_PICTURE
#include <lvgl.h>
#include <stddef.h>
#include <stdint.h>

#define ART_ID_MIN 8
#define ART_ID_MAX 16

#define ART_PX          128           // the side of the art the engine makes, on both paths
#define ART_BLE_MAX     (24 * 1024)   // the largest picture taken over BLE, bytes ("al")
#define ART_BLE_CHUNKS  512           // the most chunks one picture comes in ("an")
#define ART_BLE_MISS_MS 3000          // the wait before a miss: after the header, then after each miss
#define ART_BLE_ROUNDS  3             // misses sent before a picture is given up
#define ART_BLE_WAIT_MS 5000          // a page's picture waits this long for BLE before Wi-Fi may fetch it

// Allocate the buffers and start the fetch task. px is the side of the card's
// art square (ui.cpp works it out from its layout and ART_PX, and calls this);
// a picture is decoded to fit inside it. Once, after the display is up.
void art_init(int px);

// True for an id the board will fetch: 8 to 16 characters of a to z and 0 to 9.
bool art_id_ok(const char* id);

// The picture the page wants now ("" for none). When it differs from the
// cached one it waits for BLE, then is fetched over Wi-Fi if that is up;
// asked for while another fetch runs, it is fetched after that one.
void art_want(const char* id);

// On the LVGL loop, every pass: takes a finished decode in, then returns the
// picture for `id` when it is the cached one. A fetched picture nobody wants
// any more is dropped; one from BLE is kept unless the page's own picture is
// on the card (the host sent it for this board), and answered with "ok".
// Otherwise NULL, with *coming saying whether the picture may still come: over
// BLE (being put together, or the page named it under ART_BLE_WAIT_MS ago and
// BLE has not given it up) or over Wi-Fi (up, a base set, not failed already).
const lv_image_dsc_t* art_get(const char* id, bool* coming);

// A header from the host (main.cpp): picture `id`, `bytes` long ("al"), comes
// in `chunks` chunks ("an") on the art characteristic. False, after a log
// line, for a header the board refuses: an id outside the pi rule, bytes not 1
// to ART_BLE_MAX, chunks not 1 to ART_BLE_CHUNKS or not fitting the bytes (-1
// stands for a field that is not a whole number); a refused header still drops
// a picture half built, since the host has left it. True otherwise, answered
// with "ok" at once when the picture is the one on the card. On the loop.
bool art_ble_begin(const char* id, long bytes, long chunks);

// One write on the art characteristic as it came: 2 bytes of index, then the
// piece. From the NimBLE host task (ble.cpp), which has checked the owner.
void art_ble_chunk(const uint8_t* data, size_t len);

// On the loop, every pass: puts chunks that waited beside a message in place,
// hands a whole picture to the decoder and sends the misses.
void art_ble_tick(void);

// The `art` serial poke, given the text after "art ": "status", or a base url
// (http:// only, a trailing / added when missing).
void art_serial(char* args);
#endif
