#include "../../hal/touch_hal.h"
#include "board.h"
#include <Arduino.h>
#include <Wire.h>

// CST328 reader, vendored (copyleft-free, per the porting guide) rather than
// pulled from a GPL library. UNVERIFIED on real hardware: the CST3xx family's
// public register maps disagree between sources, more than the CST816T one
// the 1.54 port could copy from a hardware-tested reference. Best current
// understanding, used here:
//   write 2-byte big-endian register 0xD000, read 1 status byte: low nibble
//   is the finger count (0 while idle); when nonzero, read 4 more bytes for
//   point 0 starting at 0xD000+1: xH(4 bits)<<8|xL, yH(4 bits)<<8|yL.
// If the panel reports nothing, or garbage, flip TOUCH_DEBUG below to 1 and
// reflash: every touch then prints the raw bytes read from 0xD000 to Serial,
// so the real layout can be read off a live finger instead of guessed blind
// from documentation that disagrees with itself. The porting guide says
// never to touch shared main.cpp for a bring-up aid like this, so it stays
// entirely inside this file rather than becoming a new serial command.
// Whatever the dump turns up, fix touch_read_into_shared_state() and
// reflash — nothing else in the board port depends on getting this exactly
// right on the first try. A touch controller that never answers behaves
// like lcd_4's broken GT911: the board still runs, just without touch (see
// the module's init log line).
#define TOUCH_DEBUG 0

static volatile bool     touch_data_ready = false;
static volatile bool     touch_pressed = false;
static volatile uint16_t touch_x = 0;
static volatile uint16_t touch_y = 0;
static bool               touch_present = false;

static void IRAM_ATTR touch_isr(void) {
    touch_data_ready = true;
}

static bool touch_write_reg16(uint16_t reg) {
    Wire.beginTransmission(CST328_ADDR);
    Wire.write((uint8_t)(reg >> 8));
    Wire.write((uint8_t)(reg & 0xFF));
    return Wire.endTransmission(false) == 0;
}

static void touch_read_into_shared_state(void) {
    if (!touch_write_reg16(0xD000)) { touch_pressed = false; return; }
    if (Wire.requestFrom((uint8_t)CST328_ADDR, (uint8_t)5) != 5) { touch_pressed = false; return; }
    uint8_t raw[5];
    for (uint8_t i = 0; i < 5; i++) raw[i] = Wire.read();
#if TOUCH_DEBUG
    Serial.printf("touchdbg 0xD000: %02X %02X %02X %02X %02X\n", raw[0], raw[1], raw[2], raw[3], raw[4]);
#endif
    uint8_t fingers = raw[0] & 0x0F;
    if (fingers == 0 || fingers > 5) {
        touch_pressed = false;
        return;
    }
    touch_x = ((uint16_t)(raw[1] & 0x0F) << 8) | raw[2];
    touch_y = ((uint16_t)(raw[3] & 0x0F) << 8) | raw[4];
    touch_pressed = true;
}

void touch_hal_init(void) {
    pinMode(TP_RST, OUTPUT);
    digitalWrite(TP_RST, LOW);
    delay(10);
    digitalWrite(TP_RST, HIGH);
    delay(100);

    // No confirmed chip-id register for this part the way CST816 has 0xA7;
    // treat a clean ACK on the status register as "present" instead.
    touch_present = touch_write_reg16(0xD000) && Wire.requestFrom((uint8_t)CST328_ADDR, (uint8_t)1) == 1;
    if (touch_present) {
        Wire.read();
        Serial.printf("Touch CST328 answered at addr 0x%02X\n", CST328_ADDR);
    } else {
        Serial.printf("Touch CST328 did not answer at addr 0x%02X (board runs without touch; "
                      "try the other candidate address, 0x5A)\n", CST328_ADDR);
    }

    pinMode(TP_INT, INPUT_PULLUP);
    attachInterrupt(TP_INT, touch_isr, FALLING);
}

void touch_hal_read(uint16_t* x, uint16_t* y, bool* pressed) {
    if (touch_present) {
        if (touch_data_ready) {
            touch_data_ready = false;
            touch_read_into_shared_state();
        } else if (touch_pressed) {
            // A missed release report (landed between polls) would otherwise
            // leave "pressed" stuck; re-read while we think a finger is down.
            touch_read_into_shared_state();
        }
    }
    *x = touch_x;
    *y = touch_y;
    *pressed = touch_pressed;
}
