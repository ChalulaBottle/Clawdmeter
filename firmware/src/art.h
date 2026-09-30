#pragma once
// Album art for the music card (plans/labdaemon.md, "Increment 2"): fetched over
// Wi-Fi (wifi_link.h) from the engine's LAN listener and decoded for LVGL. Built
// only where the env sets FEATURE_PICTURE (lcd_4); on every other board this
// header declares nothing and art.cpp is empty.
//
// A page names its picture with pi, an id of 8 to 16 characters from a to z and
// 0 to 9. The board fetches <base><pi>.jpg, the base set once over serial
// (`art <base url>`, kept in NVS: namespace "art", key "base"). One fetch at a
// time, on a task of its own, so the LVGL loop never waits on the network; the
// last picture decoded stays cached. A failure is logged once and leaves the
// card without art until the page names another picture, Wi-Fi joins again or
// the base changes.
#ifdef FEATURE_PICTURE
#include <lvgl.h>

#define ART_ID_MIN 8
#define ART_ID_MAX 16

// Allocate the buffers and start the fetch task. px is the side of the card's
// art square (ui.cpp works it out from its layout and calls this); a picture is
// decoded to fit inside it. Once, after the display is up.
void art_init(int px);

// True for an id the board will fetch: 8 to 16 characters of a to z and 0 to 9.
bool art_id_ok(const char* id);

// The picture the page wants now ("" for none). Fetched when it differs from the
// cached one; asked for while another fetch runs, it is fetched after that one.
void art_want(const char* id);

// On the LVGL loop, every pass: takes a finished fetch in (a picture nobody
// wants any more is dropped), then returns the picture for `id` when it is the
// cached one. Otherwise NULL, with *coming saying whether a fetch for it is
// queued or under way (Wi-Fi up, a base set, not failed already).
const lv_image_dsc_t* art_get(const char* id, bool* coming);

// The `art` serial poke, given the text after "art ": "status", or a base url
// (http:// only, a trailing / added when missing).
void art_serial(char* args);
#endif
