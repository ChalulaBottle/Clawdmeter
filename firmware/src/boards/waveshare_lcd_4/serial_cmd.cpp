#include "board.h"
#include "io_expander.h"
#include <Arduino.h>
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

bool touch_gt911_probe_now(void);

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
    if (strncmp(cmd, "bl ", 3) == 0) {
        int level = atoi(cmd + 3);
        if (level < 0) level = 0; if (level > 255) level = 255;
        io_expander_set_backlight((uint8_t)level);
        Serial.printf("backlight %d\n", level);
        return true;
    }
    return false;
}
