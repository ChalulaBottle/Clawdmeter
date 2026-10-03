#include "../../hal/power_hal.h"
#include "board.h"
#include <Arduino.h>

// No PWR-role hardware on this kit: no PMU, no IO-expander key, and the one
// physical button (BOOT) is already spoken for by input_hal's documented
// PRIMARY role (see board.h). This stub answers "no battery, no press, ever"
// so shared code (the hold-to-pair gesture, the PWR tap that cycles screens,
// approve/notify dismiss on PWR) simply never fires from here — the working
// touchscreen already dismisses notify/approve/cycles screens through LVGL's
// own click handling (every touch-capable board gets that for free), so the
// real, known gap is pairing-by-button and the PWR-sourced creature cycle.
// Deferred follow-up once touch is confirmed on real hardware: synthesize
// the PWR edges from a touch-and-hold zone instead of a GPIO, the same way
// AMOLED-1.8 synthesizes them from an IO-expander line rather than a direct
// pin (plans/waveshare-lcd-28-port.md, Milestone 2).

void power_hal_init(void) {
    Serial.println("power_hal: no PWR button on this board (BOOT drives HID PTT instead) — "
                   "pairing-by-button and PWR-role screen cycling are not available yet");
}

void power_hal_tick(void) {}

int  power_hal_battery_pct(void) { return -1; }
bool power_hal_is_charging(void) { return false; }
bool power_hal_is_vbus_in(void)  { return false; }

bool power_hal_pwr_pressed(void)      { return false; }
bool power_hal_pwr_long_pressed(void) { return false; }
bool power_hal_pwr_released(void)     { return false; }
