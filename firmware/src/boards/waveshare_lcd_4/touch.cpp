#include "../../hal/touch_hal.h"
#include "board.h"
#include "io_expander.h"
#include <Arduino.h>
#include <Wire.h>

// Minimal GT911 reader (16-bit register addresses), vendored to keep the
// dependency tree copyleft-free like the other inline readers in this tree:
//   0x8140..0x8143  product id, ASCII "911"
//   0x814E          status: bit7 = new frame ready, low nibble = point count
//   0x8150..        point 0: track id, X lo, X hi, Y lo, Y hi, size lo/hi
// The status register must be written back to 0 after each frame or the
// controller stops producing new ones. The address (0x5D or 0x14) is chosen
// by the INT level while reset releases; both reset and INT sit on the CH32
// expander on this board, so board_init() decides that and we probe both.
//
// No ESP interrupt line exists for touch here, so the reader polls every
// TOUCH_POLL_MS. One status read at 400 kHz is well under a millisecond.
//
// Coordinates arrive panel-native (0..479). The panel is driven at rotation 2,
// so both axes are mirrored here to match what LVGL draws.

#define GT911_REG_PID     0x8140
#define GT911_REG_STATUS  0x814E
#define GT911_REG_POINT0  0x8150
#define TOUCH_POLL_MS     15

static uint8_t  gt_addr = 0;
static bool     touch_pressed = false;
static uint16_t touch_x = 0;
static uint16_t touch_y = 0;
static uint32_t last_poll_ms = 0;

static bool gt_read(uint16_t reg, uint8_t* buf, uint8_t len) {
    Wire.beginTransmission(gt_addr);
    Wire.write((uint8_t)(reg >> 8));
    Wire.write((uint8_t)(reg & 0xFF));
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom(gt_addr, len) != len) return false;
    for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
    return true;
}

static bool gt_write(uint16_t reg, uint8_t val) {
    Wire.beginTransmission(gt_addr);
    Wire.write((uint8_t)(reg >> 8));
    Wire.write((uint8_t)(reg & 0xFF));
    Wire.write(val);
    return Wire.endTransmission() == 0;
}

static void touch_read_into_shared_state(void) {
    uint8_t st = 0;
    if (!gt_read(GT911_REG_STATUS, &st, 1)) { touch_pressed = false; return; }
    if (!(st & 0x80)) return;              // no new frame; keep the last state

    uint8_t n = st & 0x0F;
    if (n == 0 || n > 5) {
        touch_pressed = false;             // release frame
    } else {
        uint8_t p[5];
        if (gt_read(GT911_REG_POINT0, p, 5)) {
            int32_t x = (int32_t)p[1] | ((int32_t)p[2] << 8);
            int32_t y = (int32_t)p[3] | ((int32_t)p[4] << 8);
            if (LCD_ROTATION == 2) {
                x = (LCD_WIDTH - 1) - x;
                y = (LCD_HEIGHT - 1) - y;
            }
            if (x < 0) x = 0; if (x >= LCD_WIDTH)  x = LCD_WIDTH - 1;
            if (y < 0) y = 0; if (y >= LCD_HEIGHT) y = LCD_HEIGHT - 1;
            touch_x = (uint16_t)x;
            touch_y = (uint16_t)y;
            touch_pressed = true;
        }
    }
    gt_write(GT911_REG_STATUS, 0x00);      // ack the frame
}

static bool gt_probe(uint8_t addr) {
    gt_addr = addr;
    uint8_t pid[4] = {0};
    if (!gt_read(GT911_REG_PID, pid, 4)) { gt_addr = 0; return false; }
    Serial.printf("Touch GT911 PID=%c%c%c%c (addr 0x%02X)\n",
                  pid[0] ? pid[0] : '?', pid[1] ? pid[1] : '?',
                  pid[2] ? pid[2] : '?', pid[3] ? pid[3] : '?', addr);
    return true;
}

// Shared with the serial poke interface so the probe can be re-run live.
bool touch_gt911_probe_now(void) {
    return gt_probe(GT911_ADDR_A) || gt_probe(GT911_ADDR_B);
}

void touch_hal_init(void) {
    // board_init() released TP_RST with INT driven low; try that first, then
    // the datasheet sequence for each address-select level.
    delay(50);
    bool found = touch_gt911_probe_now();
    if (!found) {
        io_expander_gt911_reset(false);
        found = gt_probe(GT911_ADDR_A) || gt_probe(GT911_ADDR_B);
    }
    if (!found) {
        io_expander_gt911_reset(true);
        found = gt_probe(GT911_ADDR_B) || gt_probe(GT911_ADDR_A);
    }
    if (!found) {
        gt_addr = 0;
        Serial.println("Touch GT911 not found at 0x5D or 0x14");
        io_expander_i2c_scan_log();
        return;
    }
    gt_write(GT911_REG_STATUS, 0x00);
    Serial.println("Touch GT911 polling");
}

void touch_hal_read(uint16_t* x, uint16_t* y, bool* pressed) {
    if (gt_addr) {
        uint32_t now = millis();
        if (touch_pressed || now - last_poll_ms >= TOUCH_POLL_MS) {
            last_poll_ms = now;
            touch_read_into_shared_state();
        }
    }
    *x = touch_x;
    *y = touch_y;
    *pressed = touch_pressed;
}
