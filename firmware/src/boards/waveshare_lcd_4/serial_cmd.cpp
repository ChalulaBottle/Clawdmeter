#include "board.h"
#include "io_expander.h"
#include "../../splash.h"
#include <Arduino.h>
#include <Wire.h>
#include <string.h>
#include <stdlib.h>

// Bring-up pokes over the USB serial console, claimed through main.cpp's
// board_serial_command() hook. The CH32 expander runs Waveshare's own
// firmware with an undocumented register map, so the fastest way to learn
// what a bit does is to flip it and look.
//
//   iox            dump the expander registers
//   iox w RR VV    write hex value VV to hex register RR
//   iox r RR       read hex register RR
//   scan           list every ACKing I2C address
//   gt             re-probe the GT911 at 0x5D / 0x14
//   tprst          pulse touch reset low for 20 ms, wait 100 ms, re-probe
//   bl N           backlight level 0..255
//   rot N          force the rotation quadrant 0..3 (`rot auto` hands it back to the IMU)
//   imu            last accelerometer reading and the quadrant it maps to
//   fbshot         dump the panel framebuffer (same wire format as `screenshot`,
//                  but this one shows the rotation; the LVGL snapshot does not)

bool touch_gt911_probe_now(void);
void imu_lcd4_force_rotation(int q);
void imu_lcd4_dump(void);
const uint16_t* display_lcd4_framebuffer(void);

static void send_fbshot(void) {
    const uint16_t* fb = display_lcd4_framebuffer();
    if (!fb) { Serial.println("SCREENSHOT_ERR"); return; }
    const uint32_t size = (uint32_t)LCD_WIDTH * LCD_HEIGHT * 2;
    Serial.printf("SCREENSHOT_START %d %d %lu\n", LCD_WIDTH, LCD_HEIGHT, (unsigned long)size);
    Serial.flush();
    Serial.write((const uint8_t*)fb, size);
    Serial.flush();
    Serial.println();
    Serial.println("SCREENSHOT_END");
}

extern "C" bool board_serial_command(const char* cmd) {
    if (strcmp(cmd, "iox") == 0) {
        io_expander_dump_regs();
        return true;
    }
    if (strncmp(cmd, "iox w ", 6) == 0) {
        unsigned reg = 0, val = 0;
        if (sscanf(cmd + 6, "%x %x", &reg, &val) == 2) {
            bool ok = io_expander_reg_write((uint8_t)reg, (uint8_t)val);
            Serial.printf("iox write 0x%02X <- 0x%02X %s\n", reg, val, ok ? "ok" : "FAILED");
            io_expander_dump_regs();
        } else {
            Serial.println("usage: iox w RR VV (hex)");
        }
        return true;
    }
    if (strncmp(cmd, "iox r ", 6) == 0) {
        unsigned reg = 0;
        if (sscanf(cmd + 6, "%x", &reg) == 1)
            Serial.printf("iox 0x%02X = 0x%02X\n", reg, io_expander_reg_read((uint8_t)reg));
        return true;
    }
    if (strcmp(cmd, "scan") == 0) {
        io_expander_i2c_scan_log();
        return true;
    }
    if (strcmp(cmd, "gt") == 0) {
        Serial.println(touch_gt911_probe_now() ? "GT911 answered" : "GT911 silent");
        return true;
    }
    if (strcmp(cmd, "gtseq") == 0 || strcmp(cmd, "gtseq hi") == 0) {
        io_expander_gt911_reset(cmd[5] != '\0');
        Serial.println(touch_gt911_probe_now() ? "GT911 answered" : "GT911 silent");
        io_expander_i2c_scan_log();
        return true;
    }
    if (strcmp(cmd, "tprst") == 0) {
        io_expander_touch_reset(true);
        delay(20);
        io_expander_touch_reset(false);
        delay(100);
        Serial.println(touch_gt911_probe_now() ? "GT911 answered after reset" : "GT911 silent after reset");
        return true;
    }
    if (strncmp(cmd, "i2c ", 4) == 0) {
        // Bus clock in kHz, then re-probe: a long touch flex with weak
        // pull-ups can NACK at 400 kHz while the on-board parts still ACK.
        int khz = atoi(cmd + 4);
        if (khz < 10) khz = 10; if (khz > 1000) khz = 1000;
        Wire.setClock((uint32_t)khz * 1000);
        Serial.printf("I2C clock %d kHz\n", khz);
        io_expander_i2c_scan_log();
        Serial.println(touch_gt911_probe_now() ? "GT911 answered" : "GT911 silent");
        return true;
    }
    if (strncmp(cmd, "anim ", 5) == 0) {
        // Play a splash animation by its table name, as the host's "a" field would.
        splash_set_anim(cmd + 5);
        Serial.printf("anim -> %s\n", cmd + 5);
        return true;
    }
    if (strncmp(cmd, "rot ", 4) == 0) {
        imu_lcd4_force_rotation(strcmp(cmd + 4, "auto") == 0 ? -1 : atoi(cmd + 4));
        return true;
    }
    if (strcmp(cmd, "imu") == 0) {
        imu_lcd4_dump();
        return true;
    }
    if (strcmp(cmd, "fbshot") == 0) {
        send_fbshot();
        return true;
    }
    if (strncmp(cmd, "bl ", 3) == 0) {
        int level = atoi(cmd + 3);
        if (level < 0) level = 0; if (level > 255) level = 255;
        io_expander_set_backlight((uint8_t)level);
        Serial.printf("backlight %d\n", level);
        return true;
    }
    return false;
}
