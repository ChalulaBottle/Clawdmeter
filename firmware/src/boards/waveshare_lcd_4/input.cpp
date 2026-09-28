#include "../../hal/input_hal.h"
#include "board.h"
#include <Arduino.h>

// BOOT is the only ESP-visible button and power.cpp uses it as the PWR-role
// button (screens / brightness / pairing), so no HID key is reported here.
void input_hal_init(void) {
    pinMode(BTN_BACK_GPIO, INPUT_PULLUP);
}

bool input_hal_is_held(InputButton btn) {
    (void)btn;
    return false;
}
