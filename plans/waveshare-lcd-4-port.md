# Port: Waveshare ESP32-S3-Touch-LCD-4 (480x480 RGB, GT911) as the ECHO Clawdmeter

## RESUME STATE

- **Status:** PLANNING DONE, board folder not yet written. Factory firmware backed up.
- **Exact next action:** write `firmware/src/boards/waveshare_lcd_4/` (files listed below) and the
  `[env:waveshare_lcd_4]` block, then `pio run -d firmware -e waveshare_lcd_4` until it links.
  Then log intent in `C:\Users\OOrte\SYSTEM_CHANGE_LOG.md` and flash to COM11.
- **Device:** ESP32-S3 rev 0.2, 8 MB octal PSRAM, 16 MB quad flash, MAC `e8:3d:c1:f7:6f:20`,
  native USB-JTAG on **COM11** (Windows). Board revision (V1..V4 silkscreen) not yet read;
  factory image is ESP-IDF v5.5 which points at V4 (CH32V003 expander). The port probes both.
- **Backup (restore path):** `firmware/backups/lcd4_e83dc1f76f20_factory_16MB_2026-09-27.bin`
  (16,777,216 bytes, SHA256 `C3E2B28637A06BB504EEFC27F625186FF4F9DB58C5A4E489A9DC3A186041B2A5`,
  gitignored, local only). Restore:
  `& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" -m esptool --port COM11 --baud 921600 write-flash 0x0 <bin>`
- **Shipped:** nothing yet. Plan committed on branch `port/waveshare-lcd-4`.
- **Key files:** `firmware/platformio.ini` (new env), `firmware/src/boards/waveshare_lcd_4/*`,
  `docs/porting/adding-a-board.md` (the process), `boards/waveshare_amoled_18_c6/` (TCA9554 reference),
  `boards/waveshare_lcd_154/` (backlight PWM, GPIO power button, no-PMU battery precedent).
- **Reusable assets (scratchpad, copy into `docs/hardware/lcd4/` when the port lands):** Waveshare
  dimension PDF `lcd4_3d.pdf`, STEP `lcd4_asm/esp32-s3-touch-lcd-4_asm.stp`, V2 demo tree
  `lcd4_demo_v2/`, V4 sources `lcd4_ref/` (WS_CH32_IO.{h,cpp}, 01_HelloWorld.ino, 09_LVGL_Widgets.ino).
- **Build / flash:** `pio run -d firmware -e waveshare_lcd_4` ; add `-t upload --upload-port COM11`.
  Run from PowerShell (`~/.platformio/penv/Scripts/pio.exe`), long timeout or background.
- **Verification:** serial 115200 on COM11 shows which expander answered, which GT911 address ACKed,
  and `gfx->begin` result; `screenshot` serial command dumps the frame (PSRAM snapshot path);
  touch via the BLE reset zone; `buzz` serial command tests the buzzer.
- **Gotchas:** see "Hardware facts" and "Known risks" below. Do not trust the wiki's I2C pin claim.

## Why

Operator's 4" board is the same SoC/PSRAM class and the same 480x480 resolution as the reference
2.16" AMOLED, so the whole UI layout carries over (large breakpoint in `ui.cpp compute_layout`).
Once ported, the same image becomes the base for a Fox status page and a Kismet status page.

## Hardware facts (verified against both Waveshare demo trees, not the wiki)

- **RGB panel, identical on V2/V3 and V4:** `Arduino_SWSPI(DC=-1, CS=42, SCK=2, MOSI=1)` for the
  ST7701 3-wire init, `Arduino_ESP32RGBPanel(DE=40, VSYNC=39, HSYNC=38, PCLK=41,
  R0..R4 = 46,3,8,18,17; G0..G5 = 14,13,12,11,10,9; B0..B4 = 5,45,48,47,21;
  hsync 1/10/8/50, vsync 1/10/8/20)`, `Arduino_RGB_Display(480, 480, panel, rotation 2, auto_flush,
  bus, RST=-1, st7701_type1_init_operations)`.
- **One I2C bus for everything: SDA 15, SCL 7** (touch, expander, SW6106, RTC). The wiki's
  "I2C0 on GPIO 8/9" is wrong; 8 and 9 are R2 and G5.
- **Touch:** GT911, INT GPIO16, address 0x5D or 0x14 (set by INT level at reset; probe both).
  Status 0x814E (bit7 ready, low nibble = points), point 0 at 0x8150, clear by writing 0 to 0x814E.
  Rotation 2 means mirror both axes.
- **IO expander, two variants, auto-detected at boot:**
  - V2/V3 **TCA9554 @0x20**: P0 TP_RST, P1 backlight (on/off), P2 LCD_RST, P3 SD (hold LOW),
    P5 buzzer. Config mask outputs on 0,1,2,3,5.
  - V4 **CH32V003 @0x24**: regs DIR 0x02, OUT 0x03, IN 0x04, PWM 0x05 (backlight 0..255),
    ADC 0x06 (battery, 10-bit, Vbat = raw*3.3/1023*3.0), RTC_INT 0x07. Bits: 1 TP_RST, 3 LCD_RST,
    5 **SYS_EN (power latch, never clear)**, 6 buzzer. Power-on: DIR 0xFF, OUT 0x00, 200 ms,
    OUT = SYS_EN|LCD_RST|TP_RST.
- **Buttons:** BOOT on GPIO0 (shared with CAN RX, fine as input). PWRKEY goes to the power chip,
  not to an ESP GPIO. RESET is hardware.
- **Battery:** SW6106 charger @0x3C (registers unknown); on V4 the CH32 ADC gives Vbat.
- **No IMU, no audio codec, buzzer only (active type assumed; `buzz` command will tell).**

## Design

Folder `firmware/src/boards/waveshare_lcd_4/`:

| File | Content |
|---|---|
| `board.h` | pins above, `LCD_WIDTH/HEIGHT 480`, `BOARD_HAS_IO_EXPANDER 1`, `BOARD_HAS_BATTERY 0` for the fit-check build |
| `board_init.cpp` | `Wire.begin(15,7)`, `io_expander_init()` (probe 0x24 then 0x20, run that variant's power-on sequence, release resets) |
| `io_expander.{h,cpp}` | runtime variant enum; `set_backlight(level)`, `set_buzzer(on)`, `read_battery_mv()` |
| `display.cpp` | constructors verbatim from the demo; `round_area` and `tick` no-ops; brightness via expander (PWM on CH32, cached on/off on TCA) |
| `touch.cpp` | inline GT911 reader, INT-driven plus re-read while pressed (1.54 fix), both axes mirrored |
| `input.cpp` | BOOT = PRIMARY, no SECONDARY |
| `power.cpp` | synthesise `pwr_long_pressed`/`pwr_released` from a BOOT hold >= 1.5 s (pairing gesture); short presses stay with input_hal; battery from CH32 ADC when present else -1; vbus false |
| `imu.cpp` | stubs |
| `sound.cpp` | three unguarded functions; non-blocking beep pattern stepped in `tick` via expander buzzer pin |
| `caps.cpp` | name "Waveshare LCD 4", 480x480, 1 button, no rotation/imu |

`platformio.ini`: copy `[env:waveshare_amoled_18]`, rename, `-DBOARD_LCD_4`, drop XPowers/SensorLib,
keep PPCP flags, 16 MB partitions, `-DBOARD_HAS_PSRAM`, `-DARDUINO_USB_CDC_ON_BOOT=1`.

## Milestones

- [ ] M0 plan committed and pushed (this file), backups ignored
- [ ] M1 links (`pio run`), GFX 1.6.x `Arduino_ESP32RGBPanel` constructor args verified against the downloaded header
- [ ] M2 flashed, serial log names expander variant + GT911 address, panel shows splash
- [ ] M3 touch verified (BLE reset zone), buzzer verified (`buzz`), screenshot captured to `docs/media/lcd4/`
- [ ] M4 BLE pairing via BOOT hold verified with the Windows tray daemon
- [ ] M5 battery % on V4 (flip `BOARD_HAS_BATTERY`), README + CLAUDE.md board lists updated
- [ ] M6 hardware docs copied into `docs/hardware/lcd4/`; case work starts (separate repo)

## Known risks (name, do not solve in v1)

- RGB framebuffer in PSRAM plus NimBLE traffic can flicker or drift; bounce buffer is the fix if seen.
- Tearing on partial LVGL flushes is acceptable for v1.
- GFX 1.6.x may have added positional args to `Arduino_ESP32RGBPanel` after `vsync_back_porch`; check before building.
- Passive buzzer would need PWM, which neither expander pin offers; then sound stays silent.
