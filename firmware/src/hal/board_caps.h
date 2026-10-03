#pragma once
#include <stdint.h>

// Runtime board description consumed by board-agnostic code (UI, main loop).
// Each board provides a single BoardCaps instance via board_caps().
//
// Compile-time-only facts (pin numbers, library choice) belong in
// boards/<name>/board.h and never leak into shared code. Anything the UI or
// main loop needs at runtime — display size, optional-feature presence —
// goes here so shared code stays free of #ifdef BOARD_*.
struct BoardCaps {
    const char* name;        // human-readable, e.g. "Waveshare AMOLED 2.16"

    int16_t width;           // active display width in pixels
    int16_t height;          // active display height in pixels

    uint8_t button_count;    // 1 = primary (BOOT) only; 2 = primary + secondary
    bool    has_rotation;    // IMU-driven CPU rotation in the flush callback
    bool    has_battery;     // AXP2101 battery measurement is meaningful
    bool    has_imu;         // QMI8658 (or compatible) is populated
    // PWR tap cycles creature, usage and the live page (ui_cycle_screens), not
    // a two-way stats toggle. Since increment 2 every board's PWR tap does this
    // (main.cpp pwr_act), so shared code no longer reads the field; lcd_4 still
    // sets it. Trailing so boards that leave it out get false.
    bool    pwr_toggles_stats;
    // The panel's brightness cannot be set: the cmd message's bright answers
    // "no" and its status reports br -1 (cmd.cpp). Trailing, so false for every
    // board that leaves it out, which is every board today: the AMOLED panels
    // take a level, lcd_154 dims its backlight by PWM and lcd_4 through its
    // CH32. lcd_4's TCA9554 revisions (V1 to V3) only switch the backlight on
    // and off, but which expander a board has is found at boot and this is fixed
    // at build time, so they count as adjustable.
    bool    fixed_brightness;
};

const BoardCaps& board_caps(void);
