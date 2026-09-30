#pragma once

// Waveshare ESP32-S3-Touch-LCD-4 — 4" square IPS kit.
// 480x480 ST7701 over 16-bit RGB parallel (3-wire SPI for the init sequence)
// + GT911 touch + an IO expander that gates LCD/touch reset, backlight and the
// buzzer + SW6106 charger (no I2C-readable PMU) + PCF85063 RTC. No IMU, no
// audio codec. Two expanders exist across revisions and are probed at boot:
//   V1..V3  TCA9554  @0x20   (plain GPIO expander, backlight on/off)
//   V4      CH32V003 @0x24   (tiny MCU: also backlight PWM + battery ADC)
//
// Pin map taken from Waveshare's own demo trees (V2 zip and the V4 GitHub
// repo), which agree on every panel and I2C pin. Their wiki's "I2C on GPIO
// 8/9" is wrong for this board: 8 and 9 are R2 and G5 of the RGB bus.

#define BOARD_NAME           "Waveshare LCD 4"

// ---- Display geometry ----
#define LCD_WIDTH            480
#define LCD_HEIGHT           480
#define LCD_ROTATION         2      // as Waveshare ships it; touch mirrors both axes

// ---- ST7701 3-wire SPI init bus (direct GPIO; no DC line, CS active on 42) ----
#define LCD_SPI_CS           42
#define LCD_SPI_SCK          2
#define LCD_SPI_MOSI         1

// ---- RGB parallel bus (16-bit, 5-6-5) ----
#define LCD_DE               40
#define LCD_VSYNC            39
#define LCD_HSYNC            38
#define LCD_PCLK             41
#define LCD_R0               46
#define LCD_R1               3
#define LCD_R2               8
#define LCD_R3               18
#define LCD_R4               17
#define LCD_G0               14
#define LCD_G1               13
#define LCD_G2               12
#define LCD_G3               11
#define LCD_G4               10
#define LCD_G5               9
#define LCD_B0               5
#define LCD_B1               45
#define LCD_B2               48
#define LCD_B3               47
#define LCD_B4               21
// Timings from the Waveshare demos (st7701_type1 panel)
#define LCD_HSYNC_POLARITY   1
#define LCD_HSYNC_FRONT      10
#define LCD_HSYNC_PULSE      8
#define LCD_HSYNC_BACK       50
#define LCD_VSYNC_POLARITY   1
#define LCD_VSYNC_FRONT      10
#define LCD_VSYNC_PULSE      8
#define LCD_VSYNC_BACK       20
// The LCD peripheral scans the framebuffer straight out of PSRAM. When BLE or
// LVGL stalls PSRAM the scan-out underruns and the picture tears and drifts.
// A bounce buffer in internal RAM (this many lines, DMA-fed) decouples the two;
// 10 lines x 480 px x 2 B = 9.6 KB per buffer, two of them.
#define LCD_BOUNCE_LINES     10

// ---- I2C bus (expander + touch + charger + RTC share one bus) ----
#define IIC_SDA              15
#define IIC_SCL              7

// ---- Touch (GT911, inline I2C reader, 16-bit registers) ----
// Address is picked by the INT level while reset releases; probe both.
// On V4 both TP_RST and TP_INT are CH32 expander pins (EXIO1 / EXIO2), so
// there is no ESP GPIO to interrupt on; the reader polls. GPIO16 is the PWR key
// sense line (see Buttons), never drive it.
#define GT911_ADDR_A         0x5D
#define GT911_ADDR_B         0x14

// ---- IO expander (see io_expander.cpp) ----
#define IOX_TCA9554_ADDR     0x20
#define TCA_PIN_TP_RST       0
#define TCA_PIN_BL           1
#define TCA_PIN_LCD_RST      2
#define TCA_PIN_SD           3      // Waveshare holds this LOW at startup
#define TCA_PIN_BUZZER       5
#define IOX_CH32_ADDR        0x24
#define CH32_BIT_CHG_STAT    0      // "change" net from the ETA6098 charger
#define CH32_BIT_TP_RST      1
#define CH32_BIT_TP_INT      2
#define CH32_BIT_LCD_RST     3
#define CH32_BIT_SD_CS       4
#define CH32_BIT_SYS_EN      5      // battery power latch — never clear while running
#define CH32_BIT_BUZZER      6
#define CH32_BIT_RTC_INT     7

// ---- Charger (registers undocumented; present for a future read) ----
#define SW6106_ADDR          0x3C

// ---- Buttons ----
// BOOT on GPIO0 (shared with CAN RX, harmless as an input). PWR also reaches
// the ESP: GPIO16 is the PWRKEY sense line (active LOW, external pull-up),
// proven with the `pwrkey` poke 2026-09-29. Read it, never drive it; a long
// PWR hold is the power chip's. Roles live in power.cpp.
#define BTN_BACK_GPIO        0
#define BTN_PWR_GPIO         16

// ---- IMU (not on the board: a QMI8658 breakout on the I2C header) ----
// The panel turns with the board once the breakout reports which way is up.
// Both QMI8658 addresses are probed; absent sensor = fixed orientation, and
// the `rot N` serial command still drives the rotation path for testing.
// Axis mapping depends on how the breakout is glued to the case; set these
// after reading `imu` over serial in each of the four positions.
#define QMI8658_ADDR_L       0x6B
#define QMI8658_ADDR_H       0x6A
#define IMU_SWAP_XY          0
#define IMU_FLIP_X           0
#define IMU_FLIP_Y           0

// ---- Capability flags ----
#define BOARD_HAS_SECONDARY_BUTTON 0
#define BOARD_HAS_ROTATION         1
#define BOARD_HAS_IMU              1
#define BOARD_HAS_BATTERY          0    // flip once the V4 CH32 ADC path is verified
#define BOARD_HAS_IO_EXPANDER      1
