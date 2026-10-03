#include "brightness.h"
#include "idle.h"
#include <Preferences.h>
#include <Arduino.h>

// Four-step ramp. The default (index 2) is 200 — identical to the prior
// hard-coded DISPLAY_DEFAULT_BRIGHTNESS, so cycling is purely additive.
static const uint8_t LEVELS[] = {64, 128, 200, 255};
#define LEVELS_COUNT (sizeof(LEVELS) / sizeof(LEVELS[0]))
#define DEFAULT_IDX  2

// A percentage maps onto PCT_FLOOR..255, so 0 is dim but never black. The
// step is finer than a percent, so a percentage set comes back unchanged.
#define PCT_FLOOR    16
#define PCT_SPAN     (255 - PCT_FLOOR)

static uint8_t cur_level = LEVELS[DEFAULT_IDX];

// Take `level` as the awake level and keep it in NVS as brt_lvl. Nothing is
// written when it is the level already: a host moving a slider sends many.
static void set_level(uint8_t level) {
    if (level != cur_level) {
        Preferences prefs;
        prefs.begin("clawdmeter", false);
        prefs.putUChar("brt_lvl", level);
        prefs.end();
        cur_level = level;
    }
    idle_set_awake_brightness(level);
}

void brightness_init(void) {
    Preferences prefs;
    prefs.begin("clawdmeter", true);
    // brt_lvl is the level itself, from the cycle or the host, never under
    // PCT_FLOOR, so 0 means none saved. A board that last ran older firmware
    // has only brt_idx, an index into LEVELS.
    uint8_t saved_lvl = prefs.getUChar("brt_lvl", 0);
    uint8_t saved_idx = prefs.getUChar("brt_idx", 0xFF);
    prefs.end();

    if (saved_lvl)                     cur_level = saved_lvl;
    else if (saved_idx < LEVELS_COUNT) cur_level = LEVELS[saved_idx];
    idle_set_awake_brightness(cur_level);
    Serial.printf("Brightness init: level=%u (%u%%)\n", cur_level, brightness_pct());
}

void brightness_cycle(void) {
    // The next step above the level, after the last step the first; a level
    // the host set between two steps goes on to the one above it.
    uint8_t next = LEVELS[0];
    for (size_t i = 0; i < LEVELS_COUNT; i++) {
        if (LEVELS[i] > cur_level) {
            next = LEVELS[i];
            break;
        }
    }
    set_level(next);
    Serial.printf("Brightness cycled: level=%u (%u%%)\n", cur_level, brightness_pct());
}

uint8_t brightness_get(void) {
    return cur_level;
}

uint8_t brightness_pct(void) {
    if (cur_level <= PCT_FLOOR) return 0;
    return (uint8_t)(((uint16_t)(cur_level - PCT_FLOOR) * 100 + PCT_SPAN / 2) / PCT_SPAN);
}

void brightness_set_pct(uint8_t pct) {
    if (pct > 100) pct = 100;
    set_level((uint8_t)(PCT_FLOOR + ((uint16_t)pct * PCT_SPAN + 50) / 100));
    Serial.printf("Brightness set: %u%% (level=%u)\n", pct, cur_level);
}
