#pragma once

// Waveshare ESP32-S3-Touch-LCD-2.8 — 2.8" portrait TFT dev kit, the fleet's
// first board bought explicitly to try harder things on (operator,
// 2026-10-03). 240x320 ST7789 (plain 4-wire SPI, same chip family as the
// 1.54 port, just taller) + CST328 touch + QMI8658 IMU + PCF85063 RTC +
// PCM5101 I2S DAC with a real 2 W speaker + microSD, on an ESP32-S3R8 module:
// esptool-verified "16 MB quad flash + 8 MB octal PSRAM", "Embedded PSRAM 8MB
// (AP_3v3)", eFuse flash type quad (2026-10-03, COM14) — electrically the
// same module as the 1.54 kit, hence the same qio_opi + 16 MB layout.
//
// PIN MAP NOT YET HARDWARE-VERIFIED. No BambuHelper-style tested reference
// exists for this exact SKU the way the 1.54 port had one; every pin below
// comes from a web search of Waveshare's own wiki page and may be wrong,
// especially the I2C addresses and the touch/IMU/RTC GPIOs, which disagree
// between two passes of the same search. Bring-up order: flash, watch the
// serial boot log's OK/failed line per peripheral (every reference port logs
// one), fix whichever pin turns out wrong, flash again. See
// plans/waveshare-lcd-28-port.md.

#define BOARD_NAME           "Waveshare LCD 2.8"

// ---- Display geometry (portrait, the full panel — no AMOLED-style crop) ----
#define LCD_WIDTH            240
#define LCD_HEIGHT           320

// ---- SPI display pins (ST7789, 4-wire SPI) — VERIFY ----
#define LCD_CS               42
#define LCD_SCLK             40
#define LCD_MOSI             45
#define LCD_DC               41
#define LCD_RST              39
#define LCD_BL               5     // backlight, LEDC PWM (TFT has no brightness cmd)

// ---- Touch I2C bus (its own bus, separate from IMU/RTC below) — VERIFY ----
#define TOUCH_SDA             1
#define TOUCH_SCL             3
#define TP_INT                4
#define TP_RST                2
#define CST328_ADDR           0x1A   // the common CST328 default; the other
                                      // candidate seen in search is 0x5A —
                                      // board_init() probes both, see below

// ---- Sensor I2C bus (IMU + RTC share one bus, separate from touch) — VERIFY ----
#define IIC_SDA               11
#define IIC_SCL               10
#define QMI8658_ADDR          0x6B
#define PCF85063_ADDR         0x51
#define RTC_INT                9

// ---- Audio (PCM5101 I2S DAC, no I2C control registers, + a power amp) ----
// Wired here for a later increment; BOARD_HAS_SOUND stays 0 for this one
// (see the note by the flag below) so none of this is touched yet.
#define SND_I2S_BCLK          48
#define SND_I2S_WS            38     // LRCK
#define SND_I2S_DOUT          47
#define SND_PA_PIN            -1     // no separate amp-enable GPIO found; verify

// ---- microSD (SPI, its own bus) — not wired this increment ----
#define SD_SCLK               14
#define SD_MOSI               17
#define SD_MISO               16
#define SD_CS                 21

// ---- Buttons ----
// Only one physical button exists on this kit (BOOT / GPIO 0) plus RESET
// (which is a hard MCU reset, not software-readable). input_hal.h documents
// PRIMARY as driving HID Space (Claude Code voice-mode PTT) on every board in
// the fleet, so BOOT keeps that job here unchanged. There is no second GPIO
// for power_hal's PWR role (screen cycle, pairing-hold, approve/notify
// dismiss): power.cpp on this board is an honest stub that never fires. The
// working CST328 touchscreen already drives screen/notify/approve dismiss on
// its own through LVGL (every touch-capable board gets this for free, lcd_4
// excepted since its touch is broken) — the real gap is pairing-by-button and
// the PWR-sourced creature cycle, both deferred to a follow-up that
// synthesizes the PWR role from a touch-and-hold zone once touch itself is
// confirmed on real hardware (plans/waveshare-lcd-28-port.md, Milestone 2).
#define BTN_BACK_GPIO         0     // BOOT — primary, HID Space (PTT)

// ---- Capability flags ----
#define BOARD_HAS_SECONDARY_BUTTON 0
#define BOARD_HAS_ROTATION         0
#define BOARD_HAS_IMU              0    // QMI8658 populated but unused for now,
                                         // same call as the 1.54 port: fixed
                                         // enclosure orientation, nothing to gain yet
#define BOARD_HAS_BATTERY          0    // no PMU and no battery ADC divider found
                                         // in research; this kit reads as USB-only
                                         // until the operator says otherwise
#define BOARD_HAS_IO_EXPANDER      0
// Off for this increment on purpose, not an oversight: the operator's
// standing rule across every project is no beeps or buzzer, panels stay
// visual (memory no-beeps-no-buzzer.md). This board's PCM5101 + real speaker
// could one day play the house sound language (the alien clicks already used
// on the PC side) instead of a tone, but that is a deliberate call for the
// operator to make later, not a default to switch on because the hardware
// happens to support it. The existing chime.h "reset" bell on other boards
// predates that rule and is left alone (not this port's call to remove).
#define BOARD_HAS_SOUND            0
