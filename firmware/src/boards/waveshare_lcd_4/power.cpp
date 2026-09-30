#include "../../hal/power_hal.h"
#include "board.h"
#include "io_expander.h"
#include <Arduino.h>

// No PMU on this kit — the SW6106 charger's registers are undocumented, so
// charging / VBUS state is unknowable and both report false. Battery voltage
// is readable only on V4 through the CH32's ADC; older revisions get -1.
//
// Two buttons reach the ESP (input.cpp reports no HID key, so neither types):
//   PWR  on GPIO16, active LOW (the PWRKEY sense line; read only, never drive
//        it). Proven 2026-09-29 with the `pwrkey` poke: clean edges, ~140 ms
//        taps. Short press only = the PWR role (stats toggle, approve). A long
//        hold belongs to the power chip, so PWR has no long-press role.
//   BOOT on GPIO0, active LOW. Short press = the aux role
//        (board_aux_pressed: next creature / brightness). Long hold = the
//        pairing gesture (pwr_long / pwr_released feed main.cpp pair_tick).

#define BATTERY_POLL_MS  2000
#define PWR_POLL_MS      50
#define PWR_LONG_MS      1500

static int      cached_pct        = -1;
static bool     pwr_pressed_flag  = false;
static bool     pwr_long_flag     = false;
static bool     pwr_released_flag = false;
static bool     aux_pressed_flag  = false;
static bool     last_boot_state   = false;
static bool     last_pwr_state    = false;
static uint32_t boot_press_started_ms = 0;
static bool     boot_long_fired   = false;
static uint32_t last_battery_ms   = 0;
static uint32_t last_pwr_ms       = 0;

static void sample_battery(void) {
    int mv = io_expander_battery_mv();
    if (mv < 3000) {            // no readable path, or nothing connected
        cached_pct = -1;
        return;
    }
    // Linear 3.3 V → 0%, 4.2 V → 100%, same curve as the 1.54 port.
    int pct = (int)((mv - 3300) * 100L / 900L);
    cached_pct = pct < 0 ? 0 : pct > 100 ? 100 : pct;
}

void power_hal_init(void) {
    pinMode(BTN_BACK_GPIO, INPUT_PULLUP);
    pinMode(BTN_PWR_GPIO, INPUT);   // external 10K pull-up; never an output
    sample_battery();
}

void power_hal_tick(void) {
    uint32_t now = millis();

    if (now - last_battery_ms >= BATTERY_POLL_MS) {
        last_battery_ms = now;
        sample_battery();
    }
    if (now - last_pwr_ms >= PWR_POLL_MS) {
        last_pwr_ms = now;
        bool boot_now = (digitalRead(BTN_BACK_GPIO) == LOW);  // active LOW
        if (boot_now && !last_boot_state) {          // press edge — hold begins
            boot_press_started_ms = now;
            boot_long_fired = false;
        } else if (boot_now && last_boot_state) {    // held
            if (!boot_long_fired && (now - boot_press_started_ms >= PWR_LONG_MS)) {
                pwr_long_flag   = true;
                boot_long_fired = true;
            }
        } else if (!boot_now && last_boot_state) {   // release edge
            pwr_released_flag = true;
            if (!boot_long_fired) aux_pressed_flag = true;  // short press
        }
        last_boot_state = boot_now;

        bool pwr_now = (digitalRead(BTN_PWR_GPIO) == LOW);    // active LOW
        if (!pwr_now && last_pwr_state) pwr_pressed_flag = true;  // on release
        last_pwr_state = pwr_now;
    }
}

int  power_hal_battery_pct(void) { return cached_pct; }
bool power_hal_is_charging(void) { return false; }
bool power_hal_is_vbus_in(void)  { return false; }

bool power_hal_pwr_pressed(void) {
    if (pwr_pressed_flag) { pwr_pressed_flag = false; return true; }
    return false;
}

bool power_hal_pwr_long_pressed(void) {
    if (pwr_long_flag) { pwr_long_flag = false; return true; }
    return false;
}

bool power_hal_pwr_released(void) {
    if (pwr_released_flag) { pwr_released_flag = false; return true; }
    return false;
}

extern "C" bool board_aux_pressed(void) {
    if (aux_pressed_flag) { aux_pressed_flag = false; return true; }
    return false;
}
