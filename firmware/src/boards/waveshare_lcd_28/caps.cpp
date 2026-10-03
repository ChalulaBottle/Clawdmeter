#include "../../hal/board_caps.h"
#include "board.h"

static const BoardCaps caps = {
    .name = BOARD_NAME,
    .width = LCD_WIDTH,
    .height = LCD_HEIGHT,
    // BOOT only; it drives input_hal's PRIMARY (HID PTT), not a board-side
    // button loop. No PWR-role hardware (see power.cpp).
    .button_count = 1,
    .has_rotation = (bool)BOARD_HAS_ROTATION,
    .has_battery  = (bool)BOARD_HAS_BATTERY,
    .has_imu      = (bool)BOARD_HAS_IMU,
};

const BoardCaps& board_caps(void) { return caps; }
