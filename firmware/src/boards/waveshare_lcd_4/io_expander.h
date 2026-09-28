#pragma once
#include <stdint.h>

// Which expander answered at boot. Nothing outside io_expander.cpp needs to
// branch on this; it is exposed for the serial log and power.cpp's battery path.
enum IoxVariant { IOX_NONE = 0, IOX_TCA9554, IOX_CH32 };

bool       io_expander_init(void);
IoxVariant io_expander_variant(void);

// 0..255. Real PWM on the CH32; on the TCA9554 anything > 0 is simply "on".
// Repeated writes of the same level are skipped (idle.cpp fades in 20 ms steps).
void io_expander_set_backlight(uint8_t level);
void io_expander_set_buzzer(bool on);

// Battery voltage in millivolts from the CH32's ADC, or -1 when the board has
// no readable battery path (TCA9554 revisions) or the read failed.
int  io_expander_battery_mv(void);
