# Waveshare ESP32-S3-Touch-LCD-2.8: the "harder things" dev board

Operator, 2026-10-03: attached a new board — "ESP32-S3-Touch_LCD 2.8 240x320 screen, speakers, all
sorts of attachment capabilities... I want to use this board as a development board, I want you to
try some harder things with this board, the labdaemon is the base, but we will start to integrate
other projects into it. Such as the echo sentinel, can we fold this into it as well?" — then,
mid-survey: **"First work on getting the daemon firmware working on this device."** This file covers
that first milestone only. The echo sentinel fold-in and every other "harder things" idea are queued
at the back (see the bottom), not started.

## RESUME STATE

- **2026-10-03: MILESTONE 1 BUILT, NOT FLASHED.** Board identified on COM14: ESP32-S3 (QFN56, rev
  v0.2), 16 MB quad flash, 8 MB octal PSRAM (esptool `chip-id` and `flash-id`) — electrically the same
  ESP32-S3R8 module as the existing `waveshare_lcd_154` port, which is why that port is this one's
  base rather than the generic template. New PlatformIO env `waveshare_lcd_28`,
  `firmware/src/boards/waveshare_lcd_28/` (board.h, display.cpp, touch.cpp, input.cpp, power.cpp,
  imu.cpp, sound.cpp, board_init.cpp, caps.cpp), built clean first try: **43.1% flash, 31.8% RAM**, no
  missing or duplicate HAL symbols. Every other file in the shared tree (main.cpp, ui.cpp, splash.cpp,
  the whole creature/BLE/notify/page/dance/cmd stack built across Increments 1 to 5) is untouched —
  the entire LabDaemon feature set should come up on this board for free, once the HAL is right.
- **Exact next action:** the operator flashes and reports back. This session's auto-mode permission
  check blocks `pio -t upload` (the same block hit on the 4" board's flashes this session), so the
  flash itself is the operator's step:

  ```powershell
  cd "<Clawdmeter checkout>\firmware"
  $env:PLATFORMIO_OFFLINE = "1"
  pio run -e waveshare_lcd_28 -t upload --upload-port COM14
  pio run -e waveshare_lcd_28 -t monitor --upload-port COM14
  ```

  Watch for: the display lighting up with the splash screen (or staying black — see Common pitfalls
  below), and one OK/failed line per peripheral in the serial log (every reference port in this repo
  logs these; this port's touch line is the one most likely to say failed on the first try). Paste the
  serial log back, or say what the screen shows (or doesn't), and the next round fixes whichever pin
  turns out wrong from that.
- **What is NOT hardware-verified, in order of how much it matters right now:**
  1. **Display pins** (`LCD_CS/SCLK/MOSI/DC/RST/BL`, board.h) — from a web search of Waveshare's wiki,
     not a hardware-tested reference the way the 1.54 port had (BambuHelper). If the screen stays
     black, this is the first thing to recheck.
  2. **Touch** (CST328, `I2C addr 0x1A`, `TOUCH_SDA/SCL/INT/RST`) — the CST3xx family's public register
     maps disagreed between two passes of the same search; `touch.cpp`'s read function is a best
     guess (status byte + 4 point bytes at `0xD000`), with a `TOUCH_DEBUG` flag in that file that, if
     flipped to 1 and reflashed, prints every raw byte read on each touch so the real layout can be
     read off the live chip instead of guessed again.
  3. **IMU/RTC bus and addresses** (`IIC_SDA/SCL`, `QMI8658_ADDR`, `PCF85063_ADDR`) — unused this
     milestone (`BOARD_HAS_IMU` is 0, the RTC has no HAL slot at all yet), so wrong numbers here cost
     nothing today.
  4. **Audio pins** (PCM5101 I2S) — wired in board.h, `BOARD_HAS_SOUND` is 0, untouched this milestone.
- **Deliberate scope cuts for Milestone 1** (each is a real HAL contract question answered, not an
  oversight — see board.h's own comments for the reasoning):
  - **No PWR-role button.** This kit has exactly one physical button (BOOT) plus a non-readable RESET.
    `input_hal.h` documents BOOT/PRIMARY as driving HID Space (Claude Code voice-mode PTT) on every
    board in the fleet, so it keeps that job here. That leaves nothing for `power_hal`'s PWR role
    (screen cycle, hold-to-pair, approve/notify dismiss): `power.cpp` is an honest no-op stub, logged
    once at boot. The working touchscreen already drives notify/approve/screen dismiss through LVGL's
    own click handling (every touch-capable board gets that for free; lcd_4 is the one exception, its
    touch being broken) — the real gap is **pairing-by-button and the PWR-sourced creature cycle**.
    **Milestone 2** (after touch is confirmed working): synthesize the PWR edges from a touch-and-hold
    zone instead of a GPIO, the same way the AMOLED-1.8 port synthesizes them from an IO-expander line
    rather than a direct pin. Needs touch bring-up first so the gesture has something real to read.
  - **No sound.** `BOARD_HAS_SOUND` is 0 even though the PCM5101 + speaker are real and wired in
    board.h, per the operator's standing, binding rule across every project: no beeps or buzzer,
    panels stay visual (memory `no-beeps-no-buzzer.md`). If this board ever plays something, it should
    be a deliberate choice — most plausibly the house sound language (the alien clicks already used on
    the PC side) rather than a tone — not a default switched on because the hardware happens to
    support it. `chime.h`'s existing reset bell on other boards is an ES8311-codec engine anyway and
    wouldn't run on a plain PCM5101 DAC unmodified, so reusing it isn't even a drop-in option.
  - **No battery, no IMU, no RTC, no SD.** Not found as readable in research (battery), not useful yet
    (IMU — fixed enclosure orientation, same call the 1.54 port made), no HAL slot exists for either
    (RTC, SD card) today. All real "harder things" candidates, queued below.

## Common pitfalls (from `docs/porting/adding-a-board.md`, most likely to bite this port)

- **Display stays black, no panic.** Check `board_build.arduino.memory_type = qio_opi` is really what
  got flashed (it's in the env), and that the LCD_RST pin is actually pulsing (no IO expander here to
  blame — this board's reset is a direct GPIO pulsed by `Arduino_ST7789`'s own constructor path).
- **Touch reads zeros.** Expected on the first flash per the RESUME STATE above; flip `TOUCH_DEBUG` in
  `touch.cpp` and reflash to see raw register bytes.
- **GPL warning when picking a touch driver.** Not hit — `touch.cpp` is vendored from scratch, no
  library.

## Queued ("harder things", operator orders them; nothing here started)

- **Milestone 2:** touch-synthesized PWR role (pairing, creature cycle) once touch bring-up lands.
- **Fold in echo sentinel (ECHO_PEX).** The operator asked directly. That project
  (`Downloads\Temp AEGIS_Deep\echo-sentinel`, now published as its own repo, `ECHO_PEX`) runs on a
  *different* board (LilyGo T-QT Pro, ESP32-S3FN4R2, 0.85" GC9107) and is a single-file-firmware WiFi
  promiscuous-mode monitor with its own PC dashboard — architecturally nothing like LabDaemon's
  multi-board HAL tree. "Fold in" needs a real design decision before any code: does the LCD-2.8 run
  ECHO_PEX's scanning logic as a new LabDaemon controller (PC side, the board just renders a page, the
  way every other controller works) or as board-side firmware sharing the HAL (closer to ECHO_PEX's
  own architecture, further from LabDaemon's "board renders, host decides" rule) — the first fits this
  project's own house rules far better and reuses a working WiFi-promiscuous-mode engine without
  touching Bluetooth-heavy LabDaemon firmware at all, but it is the operator's call, not an engineering
  default. Comes after Milestone 1 is confirmed on hardware.
- **PCM5101 audio** — the house sound language only (alien clicks), never a tone; operator-gated.
- **QMI8658 IMU** — auto-rotation, if the enclosure situation ever makes that useful.
- **PCF85063 RTC** — a local clock source instead of the host's `clock=auto` push; needs a new HAL slot
  (today's contract has no `rtc_hal.h`).
- **microSD** — needs a new HAL slot too; no existing board uses the card.
