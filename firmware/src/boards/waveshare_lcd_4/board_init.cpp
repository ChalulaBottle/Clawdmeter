#include "board.h"
#include "io_expander.h"
#include <Arduino.h>
#include <Wire.h>

// Called once at the very start of setup(), before any HAL device init.
// One I2C bus carries the IO expander, the GT911 and the SW6106. The expander
// gates LCD reset and touch reset (and, on V4, the SYS_EN power latch), so it
// MUST come up here or display_hal_init() talks to a panel still in reset.
extern "C" void board_init(void) {
    Wire.begin(IIC_SDA, IIC_SCL);
    Wire.setClock(400000);
    io_expander_init();
}
