#include "board.h"
#include <Arduino.h>
#include <Wire.h>

// This kit has no PMU and no battery power-hold line, so board_init() has
// only the I2C bus to bring up before touch_hal_init() runs. Two buses exist
// on paper (touch on its own, IMU/RTC sharing a second one per board.h); only
// the touch bus is started, since nothing on the sensor bus is wired up yet
// (BOARD_HAS_IMU is 0, and the RTC has no HAL slot today — both deferred).
extern "C" void board_init(void) {
    Wire.begin(TOUCH_SDA, TOUCH_SCL);
}
