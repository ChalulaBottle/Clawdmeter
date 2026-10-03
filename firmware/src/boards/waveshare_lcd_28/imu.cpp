#include "../../hal/imu_hal.h"

// QMI8658 is populated on this kit (shared I2C bus, address 0x6B per board.h)
// but unused: BOARD_HAS_ROTATION is 0, same call as the 1.54 port, and
// nothing reads it for any other purpose yet. Wiring it up (for auto
// rotation, or just as a telemetry source) is a later "harder things" item.

void    imu_hal_init(void) {}
void    imu_hal_tick(void) {}
uint8_t imu_hal_rotation_quadrant(void) { return 0; }
