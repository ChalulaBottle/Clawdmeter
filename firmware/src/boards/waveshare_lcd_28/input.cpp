#include "../../hal/input_hal.h"
#include "board.h"
#include <Arduino.h>

// BOOT is the only physical button on this kit; it keeps the documented
// PRIMARY role (HID Space, Claude Code voice-mode PTT) every other board
// gives it. No secondary button (see board.h for where the PWR role went
// instead: nowhere, for now — power.cpp is a stub).

void input_hal_init(void) {
    pinMode(BTN_BACK_GPIO, INPUT_PULLUP);
}

bool input_hal_is_held(InputButton btn) {
    switch (btn) {
    case INPUT_BTN_PRIMARY:
        return digitalRead(BTN_BACK_GPIO) == LOW;
    case INPUT_BTN_SECONDARY:
        return false;   // not present on this board
    }
    return false;
}
