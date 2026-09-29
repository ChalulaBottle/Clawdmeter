# Port: Waveshare ESP32-S3-Touch-LCD-4 (480x480 RGB, GT911) as the ECHO Clawdmeter

## RESUME STATE

- **Status:** RUNNING ON HARDWARE (commit a2f01d4 + working tree). Board is **V4** (CH32V003
  @0x24). Panel up, backlight via CH32 PWM works, BLE paired to the Windows tray daemon and
  receiving usage payloads every 60 s. Splash visibly tears/drifts (bounce buffer added in the
  working tree, not yet observed). **Touch dead:** GT911 never ACKs at 0x5D/0x14; bus scan shows
  only 0x24 and 0x51. BOOT now plays the PWR role (short = cycle screens, long = pair); no HID key.
- **Touch verdict 2026-09-27 ~22:15 (firmware side exhausted):** GT911 never ACKs at 0x5D/0x14
  under any of: board_init release (INT driven low), datasheet reset with INT low then released
  to input (`DIR=0xFB`, per-bit DIR confirmed: IN bit2 reads the pull-up), same with INT high,
  DIR=0x00 (all inputs, pins float high). Bus scan always `0x24 0x51`. CH32, RTC and panel all
  work on the same bus. Conclusion: touch flex not seated or touch IC dead. Waveshare's own V4
  demo ships a "GT911 not found, run without pointer input" fallback. Pokes live in
  `serial_cmd.cpp` (`iox`, `iox w RR VV`, `iox r RR`, `scan`, `gt`, `gtseq`, `gtseq hi`, `tprst`, `bl N`).
- **Exact next action:** operator inspects/reseats the touch flex, then `gtseq` over serial (no
  reflash needed). Meanwhile: confirm bounce buffer cured the tearing (operator's eyes), confirm
  BOOT short press reaches the usage screen, capture `screenshot_win.py COM11 docs/media/lcd4/usage.png`,
  update README/CLAUDE.md board lists, merge branch.
- **Screen switching facts (main.cpp:366-373, 388-411; ui.cpp:479,559):** PWR short on splash =
  next animation, on usage = brightness. Splash<->usage = tap (global_click_cb) or the automatic
  peek (usage for 60 s every 5 min). With touch dead, the peek is the only route to the numbers.
  Upstream's HID Space (BOOT) is disabled on this board while BOOT plays PWR; revisit when touch works.
- **Sites, 2026-09-27 ~23:25:** fork landing LIVE at https://chalulabottle.github.io/ECHO_MiniDaemon/
  (GitHub Pages, branch `port/waveshare-lcd-4`, path `/docs`; repo description + homepage set;
  README opens with the Digital Orukami fork box). ECHO site: `site/clawdmeter.html` + `.pj` card
  + build-status row committed as 43dfa6b on ECHOCLUB_Site `main`, **NOT pushed** (deploy gate;
  13 commits waiting on that branch, not all mine). Copy doc for operator revision:
  https://claude.ai/code/artifact/29686539-7fa1-4a5d-beae-4cf873f2a358 (apply edits to all three
  copies: docs/index.html, site/clawdmeter.html, README box).
- **Landing page shipped 2026-09-27 (~22:45):** `docs/index.html`, single file, ECHO tokens
  (BRAND.md), octagon panels, no arrows/coloured borders/icons/inline links, honest state tiles
  (touch + battery PENDING). Media: `docs/media/landing/desktop-1280.png`, `phone-390-360.png`,
  device frame `docs/media/lcd4/splash-frame.png`. Not yet on echoclub.org: that is a `.pj` card
  on `site/projects.html` linking here, gated by the ECHO deploy rule. GitHub Pages for the fork
  not enabled yet (operator call: Pages from `docs/` on this branch or after merge).
- **Capture gotcha:** `tools/headless-shot.ps1` below ~500 px width crops a ~500 px layout (Chrome's
  minimum window), which looks like horizontal overflow. Verify narrow widths through an iframe
  harness (`scratchpad/harness390.html` pattern) instead.
- **Serial gotcha:** opening COM11 with DTR/RTS asserted resets the board; both helper scripts
  now clear them before open. Boot logs must be caught by opening the port BEFORE the reset.
- **Toolchain gotcha:** the pinned pioarduino platform 55.03.38-1 refuses PlatformIO Core < 6.1.19;
  this box had 6.1.18. Fix: `~/.platformio/penv/Scripts/python.exe -m pip install -U platformio`.
- **Windows helpers (scratchpad, copy to `tools/` when they prove out):** `serial_tail.py COM11 [s] [cmd]`
  and `screenshot_win.py COM11 out.png` (pure-Python PNG writer, no ffmpeg), both run with the
  PlatformIO penv python (pyserial comes with esptool).
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

## 2026-09-29 ~01:30: RESUME HERE. Board holds Waveshare's FACTORY image, not ours

Waveshare's own V4 factory firmware says `Touch not found` and crash-loops, beeping on every boot
(evidence: `docs/hardware/factory-firmware-touch-not-found.log`). The operator unplugged it mid way
through re-flashing ECHO_MiniDaemon, so the upload failed. **Next action:** hold BOOT while plugging
in USB (download mode: the factory app does not run, no beeping), then from `firmware/`:
`pio run -e waveshare_lcd_4 -t upload`. The factory image wrote the whole flash from 0x0 including NVS,
so the Bluetooth bond is gone: remove "ECHO_MiniDaemon"/"Clawdmeter" in Windows Bluetooth settings and
pair again, then restart the tray. A research agent was looking for similar GT911 failures when the
session paused; its answer does not change the verdict (vendor firmware fails too) but may list a
last trick to try.

## 2026-09-29: touch is a hardware fault, replacement being requested

Operator confirmed the box says **Touch** (so a GT911 should be fitted) and filed for a replacement. Evidence
for the claim: I2C scan on SDA15/SCL7 only ever shows 0x24 (CH32) and 0x51 (PCF85063); no ACK at 0x5D or
0x14 across both GT911 reset sequences, 100/400 kHz, and TP_INT released to an input after reset; the CH32
drives the backlight and resets normally. The touch code, the tap to approve and the inverse rotation remap
are already in the firmware and need no change on a working board: flash, run `gt`, done. Optional before
shipping it back: Waveshare's factory demo as the vendor-side proof (operator gated, overwrites ours
temporarily).

## 2026-09-28 ~12:45: flashed (auto-rotate + 67 animations), rotation PROVEN, touch lead 1 dead, USB flaky

- Board came back on COM11 at ~12:40 (it had been on a power-only path since ~09:40; **the port also
  dropped and returned mid-session once**, so the USB link is intermittent: cable or connector).
- **Auto-rotate proven on the panel:** `rot 1` → "rotate: quadrant 1, redraw 76 ms", framebuffer
  capture `docs/media/lcd4/rotate-quadrant1-device.png` shows the creature turned; `rot auto` back,
  56 ms. IMU absent (expected: QMI8658 breakout not yet fitted). Direction convention (CW vs CCW)
  gets settled with `IMU_SWAP_XY/FLIP` once the breakout is glued in.
- **Touch lead 1 (TP_INT as input) FAILED:** `tprst`, `iox w 02 FB` (DIR=0xFB confirmed), `gt` →
  "GT911 silent", scan still only 0x24 0x51. Remaining: lead 2 (does this SKU carry a GT911 / touch
  flex at all?) and the factory-image test, both on the operator.
- Ten new creatures confirmed on the panel (captures `echo-headphones/openclaw/loading/kiss-device.png`);
  boards flipped to "On device".

## Attachables page + touch leads from the research (2026-09-28 ~11:30)

`docs/attach.html` (live at /attach.html, generator `tools/gen_attach.js`, verified data
`tools/attach_data.json` from workflow wf_c28c46b0-f49: 4 research lanes, 3 adversarial verifiers,
1 synthesis; 11 paths, 76 items, 18 caveats, 110 sources). Two leads for the dead touch, to try the
moment USB data is back, in this order:
1. **EXIO2 (TP_INT) is left driven LOW as an output by both V4 init paths.** Driven low it selects
   0x5D and then fights the GT911's own INT output. Try: `iox w 02 FB` (DIR bit 2 → input) after a
   `tprst`, then `gt`. Our gtseq tried both INT levels but always as a driven output.
2. **Check the box label / flex:** the plain "ESP32-S3-LCD-4" SKU ships with no GT911 fitted. If the
   flex to the glass has no touch tail, there is nothing to probe.
Also from the research: GPIO16 is the PWRKEY *sense* input (active low, 10K pull-up), not a power
latch line (the latch is CH32 EXIO5 SYS_EN); either way, never drive it. It could carry the button
role later so BOOT stops clashing with CAN RX. And caveat 0: keep H3 at 3V3 before anything goes on
the I2C header.

## Auto-rotate (2026-09-28 ~10:10, built, NOT yet flashed: the board is on a power-only cable)

Operator: "if you were to turn the device can we make the screen auto adjust". The board has no IMU,
so a **QMI8658 breakout on the I2C header** (SDA 15 / SCL 7, 3V3; addresses 0x6B or 0x6A, both probed)
supplies the orientation. Code: `imu.cpp` (SensorLib QMI8658, same tracker as the AMOLED boards, 300 ms
hold before a turn, flat board keeps its quadrant; `IMU_SWAP_XY / IMU_FLIP_X / IMU_FLIP_Y` in board.h
to calibrate once the breakout is glued in), `display.cpp` `display_hal_tick` (backlight off →
`gfx->setRotation((LCD_ROTATION + q) & 3)` → full LVGL redraw → ramp back; Arduino_RGB_Display rotates
its own framebuffer writes, no strip buffer needed; redraw ms logged per turn), `touch.cpp` inverse
remap per quadrant (unverified: touch dead), `caps` has_rotation/has_imu on, SensorLib added to the
lcd_4 env. Serial: `rot N` / `rot auto`, `imu`, `fbshot` (panel framebuffer capture; the LVGL
`screenshot` never shows rotation; `screenshot_win.py COM11 out.png fbshot`). **Next:** flash when USB
data is back, `rot 1` + `fbshot` to prove the path and read the redraw time, then order the breakout.

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
- **V4 schematic facts (`ESP32-S3-Touch-LCD-4 V4.0.pdf`, net list), verified 2026-09-27:**
  EXIO0 = charger "change"/status, EXIO1 = TP_RST, **EXIO2 = TP_INT (touch INT is on the CH32,
  not on any ESP pin)**, EXIO3 = LCD_RST, EXIO4 = SD_CS, EXIO5 = SYS_EN, EXIO6 = BEE_EN,
  EXIO7 = RTC_INT, EXIO_PWM = backlight (AP3032 BL_EN), EXIO_ADC = battery divider.
  **ESP GPIO16 = SYS_OUT (power latch), never drive it.** TP_VCC is straight 3V3. Touch, RTC,
  CH32 and charger share SDA15/SCL7. The GT911 address is therefore chosen by CH32 bit 2.
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

## Direction (operator, 2026-09-27 ~23:30): from meter to hub

"We will be adding adapters, sensors, and other features and tools to this little fun meter. It will
be a central smart home control hub as well that can control the home lab." Nothing below is built;
it is the shape the port must not fight.

**Architecture rule: the board renders and reports, a host decides.** Every GPIO is spoken for by the
RGB panel, so the 4" board grows through its buses (I2C, RS485, CAN, Wi-Fi/BLE) and through
satellites, never through pins. Control logic, credentials and integrations live on a host on the
LAN (fox-pool is the natural one, it already runs THE DOCK and the relay fleet); the board holds a
device token and speaks one small protocol. That keeps the firmware small, keeps secrets off a
desk device, and means a new integration is a host-side page, not a reflash.

**Integration hooks to design into the firmware now:**
1. **Page registry.** Screens become entries in a table (name, layout, data source, tap targets)
   rather than the two hard-coded ones. Usage, Fox status, Kismet status, home controls, sensor
   panel all use it. Upstream's `ui_show_screen` grows a list; touch (or the BOOT cycle) walks it.
2. **One transport for pages: JSON over WebSocket to the host** (BLE stays only for the Clawdmeter
   usage feed, so upstream's daemon keeps working unchanged). Payload = page id + fields; commands
   go back the same socket. Token per device, LAN bind only (same P0 gates as the room puck plan).
3. **Local sensor bus.** I2C header (SDA 15 / SCL 7, shared with touch, CH32, RTC) with a runtime
   probe table: known addresses get a driver, readings are published to the host, the host decides
   what to show. First candidates: SHT4x (temperature/humidity), SCD40 (CO2), VL53L1X or LD2410
   over I2C (presence, wakes the screen). RS485 for Modbus gear, CAN for anything automotive/lab.
4. **Home control plane = Home Assistant (or its MQTT broker)**, not bespoke device code. The host
   maps HA entities to page fields and tap actions; the board never knows what a light is.
   Home lab actions (Proxmox, Docker, fleet health) come through the same host page layer, calling
   the AEGIS relays / THE DOCK APIs that already exist.
5. **Satellites** for what the board cannot carry: voice (the room puck plan, S3-BOX-3), Zigbee/Thread
   (ESP32-C6), LoRa and sniffers. They talk to the host, the 4" board is their shared face.
6. **Buzzer and backlight as outputs** exposed to the host (alerts, night dimming) through the same
   command channel.

**Sequencing suggestion (operator gates each):** touch working → page registry + WebSocket transport
with the usage page as the first registered page → Fox status page → first I2C sensor (presence)
→ HA bridge on the host → home controls page → home lab page. A hub deserves its own name before
the first public post about it; not yet.

## Known risks (name, do not solve in v1)

- RGB framebuffer in PSRAM plus NimBLE traffic can flicker or drift; bounce buffer is the fix if seen.
- Tearing on partial LVGL flushes is acceptable for v1.
- GFX 1.6.x may have added positional args to `Arduino_ESP32RGBPanel` after `vsync_back_porch`; check before building.
- Passive buzzer would need PWM, which neither expander pin offers; then sound stays silent.
