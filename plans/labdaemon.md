# LabDaemon Engine: our own control layer behind ECHO_LabDaemon

Operator (2026-09-29 ~20:25): "Lets write our own for this entire build, we will add other things this
labdaemon can control over time." Same thread: Spotify controller, notifications/messages on the panel,
PWR as a second button (done, fc81354), connect automatically (done, HKCU Run restored), ultracode it,
test the hooks, and it must run on the smaller board too (both plugged in, both flashed).

## RESUME STATE

- **2026-10-03, CULTURE BATCH BUILT, NOT FLASHED (branch feat/idle-shuffle, cf46577 + a38db70):** sixteen culture
  creatures (`plans/creatures-and-modes.md` § The culture batch) in the big tier: 99 animations with SPLASH_BIG, 73
  without, all sixteen in the wildcard pool on SPLASH_BIG boards. They overflowed default_16MB's 6.25 MB app0
  (103.9 %), so the lcd_4 env now uses `max_app_8MB.csv` (one 7.9 MB factory app, nvs unchanged): lcd_4 82.5 %
  (6,809,891 of 8,257,536 B), amoled_216 unchanged at 3,309,955 B (99.0 %). **Exact next action:** the operator
  OKs the new partition table, then flash lcd_4 (the flash writes the table; NVS bonds, Wi-Fi credentials and
  brightness should survive), `anim echo starry night` and a few more on serial, device captures, then README
  big tier tables and `docs/media/anims` GIFs.
- **2026-10-03, INCREMENT 4 (the engine's dashboard, Google, Discord, and the cmd message here):
  RESUME FROM the engine repo's `plans/dashboard.md` RESUME STATE, which is authoritative for this
  increment.** Board side committed on branch `feat/cmd-message` (from `ee63a70`): firmware `02631fa`,
  daemon `2415e13`, and this plan; pushed as that branch only, NOT FLASHED, not merged. Engine side on
  labdaemon-engine main: `bcfa368` dashboard, `158cfb6` google, `17e982e` discord, `951d041` docs and
  plan (1130 tests). Next: restart the engine, merge `feat/cmd-message` and `feat/idle-shuffle` into
  `port/waveshare-lcd-4` (pull first: the local branch is 2 behind origin), build lcd_4, flash with an
  explicit `--upload-port`, restart the tray, bring-up list in Increment 4 below.
  **Release branch 
elease/increment-4** (2026-10-03) = origin/port/waveshare-lcd-4 + feat/cmd-message + feat/idle-shuffle; lcd_4 moves to the stock max_app_8MB partition table (operator OK needed before the flash).
- **STATUS 2026-10-02: docs and landing page ACTUALLY caught up (branch `site-catchup-2026-10-02`, not
  yet merged into `port/waveshare-lcd-4`, pending operator review).** The 2026-10-01 ~03:00 entry below
  claimed "docs and landing page updated" — true only for the creature grid; the engine, Spotify, the
  notify/page system, the dance floor and the Claude Code hooks had never made it onto the public page.
  README's album-art paragraph was also stale, still describing the parked Wi-Fi/HTTP path instead of
  the shipped BLE one. Fixed on the review branch: README's BLE art paragraph (marked not-yet-proven,
  per the GATT re-pair blocker below, which is still open); a new landing-page band for the dance floor
  using the five existing `dancefloor-*.png` captures; a fourth "LabDaemon Engine" panel; three new
  state-of-the-port tiles (Spotify, Notify/page, Claude hooks); the touch tile corrected to "confirmed
  non-responsive" (Waveshare's own factory-test firmware agrees, SYSTEM_CHANGE_LOG.md 2026-09-29); the
  button-row spec replaced with the real increment-2 table; a second-board spec row; and the "Pages, not
  screens" panel reworded to separate the shipped BLE page transport from the still-planned LAN
  WebSocket registry. **Second board correction:** the "never enumerated: data cable" note two bullets
  down is now stale — it's flashed (`waveshare_amoled_216_c6`, 2026-10-01 afternoon,
  SYSTEM_CHANGE_LOG.md), advertising over BLE as `D4:05:92:B7:8B:E2`, stock table only, not yet paired.
  **Exact next action:** operator reviews branch `site-catchup-2026-10-02`, merges into
  `port/waveshare-lcd-4` to go live (GitHub Pages rebuilds automatically on that push).
- **STATUS 2026-10-01 ~03:00: increments 1, 2, 2b (board + host), 2c and the big tier are ON THE 4 INCH
  BOARD (table 11e2bc2, 83 animations; dance floor 5ebe84f; BLE art firmware efd5f1f; host art 4ab5e74 +
  5e38b71). Spotify follows the operator's playback (phone or PC, same account). Tray and engine run the
  committed code and autostart at login. MCP `labdaemon` registered. Everything committed and pushed
  in both repos; docs and landing page updated (creature band has the 8 HD creatures).
- **Exact next action:** (1) the operator re-pairs ECHO_LabDaemon in Windows Bluetooth (the cached GATT
  table hides the new art characteristic), then restart the tray and play a track: expect `art: <id>
  from ble, N bytes in M ms` on serial and `Art <id> shown` in daemon.log; capture the card with art.
  (2) Ask or act on the operator's answer about a dance layout (creature in the middle of the card
  while pa is "dance"; today the band is about a quarter of the panel). (3) done: engine LAN art listener is
  opt-in (433bba8, engine restarted, 8977 on loopback only). (4) Increment 3, notification centre (no sounds; the
  alien clicks play on the PC). Also queued: the 3CHO rename of the Meeting Copilot, the second board
  (never enumerated: data cable), the battery order (PH 2.0, pin 1 GND, pin 2 B+), the installer, the
  Service Changed indication so a flash never needs a re-pair, the tray waiting for the board's `wf`
  answer, the firmware `#ifdef SPLASH_BIG` in splash.cpp's group row (could be a plain name).
- **Gotchas this session:** `fbshot` captures are upside down relative to the mounted panel: rotate 180
  before committing (the pre-09-29 LVGL `screenshot` captures are upright, do not rotate those). Builds:
  `$env:PLATFORMIO_OFFLINE = "1"` first. amoled_216 sits at 99.0 % (3309215 B of 3342336): nothing
  non-big may be added to the shared table without the 16 MB layout. Pausing music resets the dance
  sequence (pa flips to echo headphones). Campus Wi-Fi: no LAN features, never mark it Private.
- **Status (history):** INCREMENT 1 ON THE 4 INCH BOARD (2026-09-29 ~23:30). Build workflow wf_e25c290c-f9d
  (13 agents: 4 lanes, 4 reviews, 3 fix rounds, 1 integration, GO). Board side b3955a7, engine 65c6473 +
  3b40eea (p3 = track length only). Flashed lcd_4 with `PLATFORMIO_OFFLINE=1`; tray restarted on the new
  daemon; engine served (`pythonw labdaemon_engine\__main__.py serve`, loopback 8976, lab.token issued).
  **Proven on the panel:** serial `msg Build done|...` (docs/media/lcd4/notify-device.png), serial
  `page Spotify|Hoppipolla|Sigur Ros|Desk speaker|42|echo headphones` (page-spotify-device.png: title,
  headphones creature, three lines, 42 % bar), and the full engine path `python -m labdaemon_engine notify`
  → notify.json → tray `{"nt","nb","nx"}` → overlay (engine-notify-device.png). Daemon 472 tests, engine 372.
- **2026-09-29 ~23:58, SPOTIFY LIVE ON THE PANEL:** operator created the Spotify app (client id in
  `%LOCALAPPDATA%\Clawdmeter\spotify.client`, never in a repo), `spotify login` (PKCE) succeeded, tokens
  DPAPI-encrypted in `spotify.tok`; the card followed real playback on the operator's PC (XICO): Hunnids,
  GREAT WHITE NORTH, 2 Step Stevie, with the bar moving (capture `docs/media/lcd4/spotify-live-device.png`).
  Then flashed 01c60d8: echo mushroom + echo mushroom b in the table (74 animations; echo mushroom in the
  idle rotation in the dead `echo sleep` slot) and `idle_keep_awake()` (a page still receiving updates
  keeps a lit panel lit). `anim echo mushroom` plays on the device (serial confirms; capture pending, the
  live card sits over it until the music pauses).
- **Dark-panel incident ~23:50:** operator saw nothing on the 4 inch panel while the framebuffer held
  the live card, the link was up, and the CH32 PWM register read 0xC8 (backlight on). Not the idle sleep
  (timeout is 30 min). Suspect: RGB panel refresh stall under BLE traffic + 5 s page updates (the plan's
  known risk; bounce buffer). The reflash reset cleared it. Operator's answer (solid black vs frozen)
  pending; if it recurs, capture `iox` + `fbshot` first, then look at the bounce-buffer path in display.cpp.
- **2026-10-01 ~00:40:** BLE art firmware flashed (efd5f1f) but the first run is blocked by the
  Windows GATT cache (re-pair pending, operator). Dance floor firmware committed (5ebe84f, not flashed).
  On the bench and committed: echo breakdance hd (+ hd b), echo acrobat hd (6ee96b1); rave bunny and
  moonwalk workflows running (wf_8d4449dd-433, wf_a097ecee-878). **Exact next action:** when both
  land, commit their bench files, run `tools/add_echo_anims.py` (big tier rows), build lcd_4 and
  amoled_216 (216 must stay under 3342336 B; big rows do not touch it), flash lcd_4, `page
  Test|a|b|c|40|dance` or a real track, expect `page: dance feature <name>`, capture, update README
  (dance pools, serial `dance`), plan. Then the re-pair + art test, then Increment 3.
- **2026-09-30 ~20:15:** Wi-Fi art is parked (operator is on public campus Wi-Fi: captive portal, client
  isolation; never mark it Private). Album art moves to BLE (Increment 2b): host half shipped (daemon
  4ab5e74, engine 5e38b71, engine restarted on 128 px art), firmware half building in workflow
  wf_a7f1cb5b-3d9. Mushroom HD flashed (64e34d5 + media): `echo mushroom hd` (60 lattice, black
  dilated pupils) in the idle rotation on lcd_4 via the new **big tier** (`tier: 'big'` in anims.js,
  compiled only with `-DSPLASH_BIG=1`, lcd_4 env; amoled_216 unchanged at 3308759 B). Spotify card
  idle since ~19:40: the linked account reports no track, device "Heart monitor.ble7294"; asked the
  operator to check Private Session / which account. 3CHO is the new name for the Meeting Copilot
  (rename queued, its own increment). Next after 2b: flash, tray restart, play an unseen album,
  expect `art: <id> from ble` on serial; then Increment 3 (notification centre, no sounds, the alien
  clicks play on the PC).
- **2026-09-30 ~04:30, INCREMENT 2 ON THE 4 INCH BOARD, waiting on Wi-Fi:** workflow wf_f62c2d86-d89
  (13 agents, GO). Board side 4d27b53, engine c5dafe1, docs 6340532. Flashed lcd_4 (Flash 54.1 %; the
  hung lane build tree was ended by PID first, logged). Tray and engine restarted on the new code; the
  engine's art listener is up on 0.0.0.0:8977 (`lab.art` token); the board holds the art base (serial
  `art status` shows it, "wifi down"). **Waiting on the operator:** `wifi set "<ssid>"` in a real
  console (getpass) while the 4 inch board is Connected, and the firewall: the LAN adapter's profile
  is PUBLIC, so either `Set-NetConnectionProfile -InterfaceAlias "Ethernet 4" -NetworkCategory Private`
  or a rule for TCP 8977 with `-Profile Any` (both admin). Then play a track: expect `art: <id> 160x160`
  on serial and `art <id> sent to <ip>` in engine.log, the card in the art layout, `page: dance <name>`
  every 12 to 25 s. Buttons now: PWR tap cycles creature, usage, live page; on the page BOOT tap =
  play/pause (400 ms delay), BOOT double = next, PWR double = previous.
- **Known follow-ups from increment 2:** tray should wait for the board's `wf` answer before deleting
  wifi.json (spec in the fw lane B report; today a board without Wi-Fi can consume the file);
  `echo mushroom b` stays bench-only; every board's PWR now cycles to usage instead of next creature
  (plan rule; the 2.16 operator will notice); engine loop is still single-threaded (art download runs
  inside it).
- **2026-09-30 ~00:20:** MCP wired (`claude mcp add --scope user labdaemon`, status Connected; tools
  lab_list, lab_state, lab_do, lab_notify appear in new Claude Code sessions). Engine autostart on
  (HKCU Run `LabDaemonEngine`). Increment 2 (music card v2) building in workflow wf_f62c2d86-d89.
  `echo mushroom b` is bench-only (benchOnly flag, e46e25e); the 4 inch board still runs the table
  that includes it (01c60d8) until the next flash.
- **Not yet proven:** the btn TX message (needs a press on the board while a page is up: expect
  `BLE: btn pwr on page` on serial, `events/<ns>.json` in the relay dir, one "routed" or "dropped" line in
  engine.log); Spotify login (needs the operator's client id in `spotify.client`); the second board
  (never enumerated tonight: charge-only cable or board off; last seen COM12, USB serial
  D4:05:92:B7:8B:E0; both boards are VID_303A PID_1001 so identify by the boot banner); engine autostart
  (`autostart.py enable`, not run); the MCP entry (`~/.claude.json`, operator gated).
- **Exact next action:** operator presses PWR with the serial page up, then plugs the second board in
  with a data cable: read its banner, build its env, flash with `--upload-port`, pair it, restart the
  tray (multi-board mode is picked per discovery round). Then Spotify login and a real track on the card.
- **Gotchas from the build:** the shared PlatformIO penv lost charset_normalizer during an automatic
  upgrade (repaired with `pip install --ignore-installed --no-deps charset-normalizer==3.5.1`; if pio
  fails in seconds with "Failed to install Python dependencies", set `$env:PLATFORMIO_OFFLINE = "1"`).
  amoled_216 is at 98.3 % flash (58 KB left): the stock Clawdmeter env needs the 16 MB partition layout
  before it gains anything. Panel fonts draw ASCII only; the engine folds every relay field. A page
  message must stay under MTU minus 3 (253 bytes assumed); the daemon cuts fields to fit. The engine
  loop is single-threaded: a slow controller poll delays the others (isolate later).
- **Decisions (operator, 2026-09-29 ~20:30):** Spotify **Premium**. PC side = **LabDaemon Engine**, own
  private repo `ChalulaBottle/labdaemon-engine`, local `Downloads\Temp LabDaemon Engine`. Board and
  everything public renamed **ECHO_LabDaemon** (done, 7225102; old URL redirects; no re-pair needed).
- **Hooks test:** the creature hooks are ALREADY installed in `~/.claude/settings.json` (all 11 events)
  and proven live 2026-09-29 21:08 to 21:24: panel showed "ultracode work" with the agents badge while
  the understand workflow ran (capture in the session scratchpad `ultracode.png`). The only hook not
  installed is **PermissionRequest** (approve on device); operator gated, asked.
- **Shipped around it:** two buttons fc81354; rename 7225102; engine repo created (empty until the
  build lane's first commit).
- **Gotchas found by the critic:** (1) `parse_json` accepts ANY JSON object, so a notify or page
  message reaching a board on OLD firmware renders as a zeroed usage screen: flash both boards before
  the engine sends anything, and tighten `parse_json` to require `"s"`. (2) On every board except lcd_4,
  BOOT is HID Space (types into the PC) and `board_aux_pressed` is the weak default; dismiss there is
  PWR or a touch tap. (3) The daemon serves ONE board today (first bonded match, one client, singleton
  tray, global relay files). (4) The notify overlay must be created BEFORE the approve overlay (z-order)
  and added to the `ui_show_screen` splash guard. (5) Idle mini creature asks for "expression sleep",
  which no longer exists; `splash_mini_create` is a single static instance.

## Protocol (settled 2026-09-29 ~21:35; every lane uses these names verbatim)

**Host to board, each its own BLE message, never merged into usage.** Firmware dispatch order:
`handle_approve_msg || handle_notify_msg || handle_wifi_msg || handle_cmd_msg || handle_art_header_msg || handle_page_msg || parse_json(requires "s")`,
then ack (the Wi-Fi and cmd messages answer for themselves, below; the art header exists in
`FEATURE_PICTURE` builds only).

| Message | Fields | Clear |
|---|---|---|
| approve (exists) | `q` id, `qt` tool, `qs` text, `qx` seconds left | `{"q":""}` |
| notify | `nt` title (≤23), `nb` body (≤96), `nx` seconds (default 8) | `{"nt":"","nb":""}` |
| wifi (increment 2; boards built with `FEATURE_PICTURE` only, today lcd_4) | `wf` SSID (1 to 32 bytes), `wp` password (empty for an open network, 8 to 63 characters, or exactly 64 hex digits) | `{"wf":""}` forgets the network |
| page | `pg` page name (≤15), `pt` title (≤23), `p1` `p2` `p3` lines (≤40 each), `pp` progress 0..100 or -1, `pa` creature name, "dance" or "", `pi` album art id or absent | `{"pg":""}` |
| cmd (increment 4) | `c` verb, `v` value as text: `bright` 0 to 100, `anim` a creature name (`""` lets the held one go), `screen` splash, usage or page, `dance` next, `status` empty | none: one verb per message |

**cmd answers:** in place of the plain ack the board answers `{"c":"<verb>","ok":1}` or
`{"c":"<verb>","err":"<why>"}` (why: `verb`, `value`, `no`, `name`, `no page`, `no dance`), and
`status` answers `{"c":"status","br","scr","an","fw","n"}` within MTU minus 3 (`br` -1 where the
brightness cannot be set). Firmware from before has no handler, so the message falls through to
`parse_json` and gets the plain `{"err":true}`, which the tray reads as "takes no cmds".

**Wi-Fi answers:** in place of the plain ack the board answers `{"ack":true,"wf":"ok"}` (stored or
forgotten) or `{"err":true,"wf":"no"}` (not stored: refused or NVS failed). A board without Wi-Fi has
no handler, so the message falls through to `parse_json` and gets the plain `{"err":true}`.

**`pi` rule:** 8 to 16 characters of a to z and 0 to 9 (the engine sends 12); anything else is not
fetched. Boards without `FEATURE_PICTURE` ignore it.

**Board to host on TX:** existing `{"approve":"<id>"}` plus `{"btn":"pwr"|"pwr2"|"aux"|"aux2","scr":"splash"|"usage"|"approve"|"notify"|"page"}`
(`scr` read BEFORE the local action changes it; wake-swallowed presses send nothing). `pwr2` and `aux2`
are the double taps of increment 2 and only ever come with `"scr":"page"`.

**Local button rules (board), in order:** wake swallow → approve accept → notify clear → page: PWR and
aux do nothing locally (host decides) → existing behaviour (lcd_4: PWR stats toggle, aux next creature /
brightness; other boards: PWR next creature / brightness, touch tap toggles screens). Touch tap also
clears notify and leaves a page. A page is a generic card screen (title, three lines, progress bar, a mini
creature via `splash_mini_create` when `pa` is set); it is the first page-registry entry after usage.

**Host relay (tray daemon), file drops in `%LOCALAPPDATA%\Clawdmeter\`, same atomic pattern as approve.json:**
`notify.json` `{title, body, secs, expires}`, `page.json` `{pg, pt, p1, p2, p3, pp, pa, expires}`; button
TX lands as `events/<ns>.json` `{"btn","scr","addr","ts"}`. No HTTP inside the daemon loop.

**Multi-board:** the daemon connects to EVERY bonded board whose FriendlyName is in DEVICE_NAMES (one
`connect_and_run` per address, gathered), mirrors every message to all of them, accepts decisions and
button events from any, heartbeat `connected` = any link up. `CLAWDMETER_BLE_ADDRESS` still pins one.

**Engine (`labdaemon_engine`, Python 3.11, its own .venv):**
- `core.py`: controller registry, 1 s loop (polls, tails `events/`, routes `btn` to the active page's
  controller), writes notify.json / page.json, loopback HTTP API on `127.0.0.1:8976` with a random
  token in `%LOCALAPPDATA%\Clawdmeter\lab.token` (`GET /controllers`, `GET /state/<name>`,
  `POST /do/<name>/<action>`, `POST /notify`, `POST /page/off`).
- Controller contract: `NAME`, `TITLE`, `state() -> dict`, `ACTIONS = {"verb": fn}`, optional
  `poll(now) -> bool`, optional `page() -> dict|None` (the card to show while active), optional
  `on_button(btn, scr)`. Named verbs only; nothing takes code or shell.
- `controllers/notify.py`: `show(title, body, secs)`.
- `controllers/spotify.py`: Web API, Authorization Code + PKCE, client id only (operator creates the
  app; redirect `http://127.0.0.1:8975/callback`, Spotify refuses `localhost`), refresh token
  DPAPI-encrypted (`ctypes` CryptProtectData) in `%LOCALAPPDATA%\Clawdmeter\spotify.tok`; state = track,
  artist, playing, device, progress, duration; actions play_pause, next, previous, volume_up,
  volume_down; page while playing (creature `echo headphones`, progress bar); buttons on the page:
  aux = play_pause, pwr = next; page clears 30 s after playback stops or on `page/off`.
- Faces: CLI `python -m labdaemon_engine <serve|notify|do|state|spotify login|page off>`; MCP
  `labdaemon_mcp.py` (stdio, `mcp` package: `lab_list`, `lab_state`, `lab_do`, `lab_notify`), settings
  entry operator gated. Autostart: HKCU Run value `LabDaemonEngine` (base pythonw), same helper pattern.

## Increment 2: music card v2 (operator 2026-09-30 ~00:10: album art, everything, the daemon dancing, switch displays while music plays)

**Buttons (all boards, board-side, replaces the increment 1 card rules):**
- PWR tap = cycle screens: creature → usage → live page (when one exists) → creature. A page the
  operator cycled away from stays live and hidden; it comes back on the next PWR cycle, or when a
  DIFFERENT pg arrives. Updates to the hidden page (pp, pt, lines, pa) never bring it back.
- PWR double tap (two taps within 400 ms) on the page = `{"btn":"pwr2"}` (host maps to previous).
- BOOT tap on the page = `{"btn":"aux"}` (play/pause); BOOT double tap = `{"btn":"aux2"}` (next).
  Elsewhere BOOT keeps its increment 1 roles. Double taps are detected generically in main.cpp (a
  single tap fires after the 400 ms window closes, so a single now has a 400 ms delay on the page only).
- Approve and notify overlays keep precedence as before. Serial pokes `btn pwr|pwr2|aux|aux2` simulate.

**Dancing daemon (board-side):** page field `pa` = `"dance"` means the board picks a random member of
DANCE_NAMES {echo dj, echo rave, echo mixer, echo notes, echo headphones, echo hop, echo swing,
echo cartwheel} every 12 to 25 s (random), and one time in four it hides the creature for 4 to 8 s and
brings it back with a different dance; the card layout leaves the band free for it. A plain creature
name in `pa` still means that creature, fixed.

**Album art (lcd_4 first, build flag `FEATURE_PICTURE=1` set only in the lcd_4 env; the 2.16 partition
has no room for Wi-Fi):**
- Board: Wi-Fi station joined from NVS credentials set over serial (`wifi <ssid>|<password>`,
  `wifi off`, `wifi status`), or over BLE from wifi.json (the engine's `wifi set` and `wifi clear`, relayed
  by the tray as the wifi message); never in a repo, never echoed back in full; reconnect with backoff, BLE
  untouched. `art <base url>` stores the engine's art base, which carries the LAN token
  (e.g. `http://192.168.1.50:8977/a/<token>/`, printed by the engine's `art base`).
- Page field `pi` = an 8 to 16 char art id; the board fetches `<base><pi>.jpg` over HTTP (2 s timeout,
  one fetch at a time, cached last id), decodes with JPEGDEC into an LVGL image; the card shows the art
  as a square on one side, text on the other, creature band below; no art = today's layout. Fetch
  failures fall back silently.
- Engine: spotify controller downloads the 300 px album image from the Web API item, resizes to
  the card's art size (Pillow, new requirement), stores under `%LOCALAPPDATA%\Clawdmeter\art\<id>.jpg`
  (id = first 12 hex of sha1 of the Spotify image url), keeps at most 50; a LAN listener on
  `0.0.0.0:8977` serves ONLY `/a/<token>/<id>.jpg` (token = lab.art token file, random, printed by
  `art base` CLI so the operator can paste the base url into the board), nothing else, no directory
  listing, no other paths; page gets `pi`. Daemon relays `pi` unchanged (fits the MTU: ≤16 chars).
- Controls: engine maps aux → play_pause, aux2 → next, pwr2 → previous; volume stays CLI and MCP.

**Increment 2 order:** buttons + dance + daemon relay + engine mapping (all boards) → Wi-Fi + art
(lcd_4) → flash, captures (card with art, dance rotation GIF), plan, README.

## Increment 2b: album art over BLE (2026-09-30 ~05:20; the operator is on public campus Wi-Fi)

Campus Wi-Fi needs a captive portal or 802.1X the board cannot do, isolates clients (the board
could never reach the PC's 8977), and must never be marked Private on Windows. The laptop's own
radio is on the campus network too, so no hotspot. A desk device that follows the operator anywhere
must not depend on a LAN: **art travels over the bonded BLE link, like everything else.**
- Firmware: a second RX characteristic (`...0005`, write without response, binary) receives chunks
  of a baseline JPEG: header message on the JSON RX `{"ab":"<id>","al":<bytes>,"an":<chunks>}`,
  then chunk k = 2 byte index + payload (MTU minus 5); the board assembles in PSRAM (cap 24 KB),
  verifies length, decodes with JPEGDEC, shows it exactly as the Wi-Fi path does; missing chunks
  after 3 s = `{"art":"<id>","miss":[k,...]}` on TX and the host resends those; `{"art":"<id>","ok":1}`
  when shown. Cached last id, so a repeated pi costs nothing. The Wi-Fi path stays for pages that
  need a network (websites, screen tiles) and for the future; `pi` keeps meaning "art id", the
  board tries the BLE cache first, then Wi-Fi if it is up.
- Engine: art files shrink to 128 px, quality 70 (about 4 to 6 KB) so a transfer is 20 to 30
  packets, well under a second; `art\<id>.jpg` stays the cache.
- Daemon: on a page with a new pi, streams `art\<pi>.jpg` after the page message (header, chunks
  at the link's write pace, resend on miss), per board, never blocking the tick loop (asyncio task
  per transfer, one at a time per board); logs one line per transfer with bytes and ms.
- Bring-up: play a track on campus, expect `art: <id> from ble, N bytes in M ms` on serial.
- **Host half SHIPPED 2026-09-30 (daemon 4ab5e74, 584 tests; engine 5e38b71, 590 tests).** Contract
  details the FIRMWARE half must match (settled by the daemon lane and its reviewer):
  the board sends `miss` 3 s after the HEADER (and, in a resend round, 3 s after the miss it last
  sent); the daemon waits 4 s. Chunk k = 2 byte little endian index + payload; every chunk but the
  last carries min(MTU minus 5, 510) bytes. Characteristic `...0005` is registered ONLY in
  FEATURE_PICTURE builds (its absence is how the daemon knows a board has no art). A header naming
  the id the board already shows is answered at once with `{"art":"<id>","ok":1}` and no chunks
  follow. A second header for a different id drops the half-built picture and starts the new one.
  Chunks may arrive before the main loop has parsed the header: store them. The daemon leaves
  0.25 s between the header and chunk 0. Art is 128 px on both paths (BLE and Wi-Fi); the card
  layout sizes the square from the decoded image. Bring-up order: restart the engine (128 px files)
  before the tray, flash lcd_4, restart the tray, then play an album not seen before (the 160 px
  files already cached keep their ids until their track plays again).

**2b firmware SHIPPED efd5f1f, flashed 2026-09-30 ~23:00; FIRST BRING-UP BLOCKED BY THE WINDOWS GATT
CACHE:** daemon.log says `Board has no album art characteristic (older firmware)` while `art status` on
the board shows the BLE art state live. Windows keeps the service table it cached at pairing for a
bonded device, and bleak's `use_cached_services=False` does not refresh it. Fix now: remove and
re-pair ECHO_LabDaemon in Windows, restart the tray. Fix for good (follow-up): the firmware should
indicate GATT Service Changed after a table change (NimBLE `ble_svc_gatt_changed(start, end)` once
on the first connection after a flash whose characteristic set differs from the one stored in NVS),
so Windows re-reads the table without a re-pair.

## Increment 2c: the dance floor (operator 2026-09-30 ~20:40, firmware, after 2b lands)

Operator: dances on the music card "last like 1.5 minutes before having a transition into something
else", plus "little 30 s clips of repetitive dance moves before it switches to another dance move,
moonwalking". Replaces the 12 to 25 s random rotation of increment 2.
- Two pools in `ui.cpp` (names absent from the table are skipped, so the same lists serve every
  board): **FEATURES** (90 s each): echo breakdance hd, echo acrobat hd, echo rave bunny hd (queued),
  echo dj, echo rave, echo mixer; **CLIPS** (30 s each, repetitive moves): echo moonwalk hd (queued),
  echo hop, echo swing, echo headphones, echo notes, echo cartwheel.
- Sequence while `pa` is "dance": feature 90 s → transition → clip 30 s → transition → next feature,
  never the same feature twice in a row, random order within a pool; the clock runs only while the
  page is on top. **Transition** = 1.2 s: the creature shrinks to a dot and pops back as the next
  one (the mini canvas scales; no new frames needed), no hide-for-seconds any more.
- A track change does not reset the sequence; a page clear does. Serial `dance next` skips.
- Creature queue (bench first, then the big tier): echo breakdance hd (running), echo acrobat hd
  (running), echo rave bunny hd (bunny ears on the antenna, dilated black pupils like mushroom HD,
  glow sticks, strobe), echo moonwalk hd (a 30 s clip: four moonwalk steps that loop seamlessly).

**2c SHIPPED: firmware 5ebe84f and table 11e2bc2, flashed 2026-10-01, proven over serial** (feature
echo dj 87 s, `dance next`, clip echo notes 28 s, feature echo breakdance hd) with captures in
`docs/media/lcd4/dancefloor-*-device.png` (6fde043).

## Increment 3: notification centre (queued 2026-09-30 ~05:00; NO SOUNDS, operator rule)

Operator: "I dont like beeps, they hurt animals ear drums. We designed the alien clickings for this
reason." Nothing in this project ever drives the buzzer (a single-tone piezo cannot play a clip);
strike "buzzer as an output" from the hub direction. The sound language is the alien clicks already
approved for the Meeting Copilot: `Downloads\Temp Meeting Copilot\sounds\on.wav` and `off.wav`
(operator's own recording). The engine plays them on the PC (Windows audio, stdlib `winsound`) for
urgent notifications; the panel itself stays visual.
- Priorities: normal (8 s, no sound) and urgent (accent title, slow brightness pulse, stays until
  dismissed; the engine plays on.wav when it fires and off.wav when it is dismissed from the
  board). Quiet hours (configurable, default 23:00 to 07:00: urgent shows without the pulse and
  without sound, normal is held for the history page). Per-source on/off, duration and sound
  on/off in the engine config; the cue files are copied into the engine repo's `sounds/` with
  their provenance noted, never regenerated as tones.
- History page: the last five notifications as a page in the PWR cycle.
- Sources, one engine controller each, in this order: Claude Code events via the existing hooks (job
  done, needs permission, error, session ended), Google Calendar (meeting in 10 min), one chat
  (Slack first, the fleet workspace is already connected; Discord after), THE DOCK / fleet host down.
  Windows toast forwarding last (packaged-app restriction makes it unreliable).
- Housekeeping: tray waits for the board's `wf` answer before deleting wifi.json; art download off
  the engine's main loop.

## Increment 4: the cmd message (2026-10-02, with the engine's dashboard)

Operator 2026-10-02: a browser dashboard with "more options on what the device can do". The build
plan is the engine repo's `plans/dashboard.md` (lanes A to D); this is the board side, lane D.
- **Host side:** the engine's `board` controller drops `cmd\<ns>.json` `{c, v, expires}` (actions
  brightness, creature, release, screen, dance_next, refresh). The tray reads the files in name order
  every tick, hands each to every linked board, deletes it, and each link sends at most four a tick
  without waiting for answers. Expired, malformed or undated files are dropped after one log line; a
  file that cannot be read yet holds back the ones after it, so a later verb never overtakes an
  earlier one. Answers land in `board\<AA-BB-..>.json`: the status fields plus `cmd`, `last`, `ts`,
  `addr`, `name`. Each new link asks for one status report. A plain nack within 2 s of a cmd marks
  the board `cmd` false (`old firmware`).
- **Board side:** `cmd.h` and `cmd.cpp` (the five verbs), `handle_cmd_msg` after Wi-Fi in main.cpp,
  serial poke `cmd <verb> <value>`, brightness 0 to 100 in NVS `brt_lvl` (0 maps to 16 of 255),
  `splash_hold_anim` (the hold survives the usage poll, pauses the idle rotation and the usage peek;
  `""` or the creature key at the desk lets go), `ui_go_to`, `ui_dance_next`, `ble_tx_max` on every
  board, trailing BoardCaps flag `fixed_brightness` (false on every board today).
- **SHIPPED on `feat/cmd-message`, not flashed:** firmware `02631fa`, daemon `2415e13` (daemon tests
  595 before, 701 after, 2 skipped). Built: lcd_4 4,854,435 of 6,553,600 B (74.1 %), amoled_216
  3,311,527 of 3,342,336 B (99.1 %, 30,809 B left), amoled_216_c6 2,939,448 of 6,553,600 B (44.9 %);
  the binaries predate one comment only edit in splash.cpp.
- **Bring-up after the flash:** `cmd status`, `cmd bright 40`, `cmd bright 0` (the panel must stay
  visible), `cmd anim echo dj` (held past a 60 s usage poll), `cmd screen usage`, `cmd screen page`
  (`no page` with no card up), `cmd dance next` with a dancing card; then the dashboard's Ask for a
  report and `board\<address>.json`. No re-pair: the cmd message uses the existing RX and TX.
- **Open:** the tray's `_write_json_atomic` retry on PermissionError (a board report can be lost
  while the engine reads it); an NVS write debounce for brightness; a bounded skip in `take_cmds` for
  a file that stays unreadable; lcd_4 V1 to V3 (TCA9554) can only switch the backlight; the root
  README cmd section, the serial poke paragraph and the `fixed_brightness` row in
  docs/porting/capability-flags.md.

## Increments (each ends flashed, captured, committed, pushed)

1. **Firmware:** notify overlay + generic page + button TX + tightened parse_json, all boards, plus serial
   pokes `msg <text>`, `msgclr`, `page <title>|<l1>|<l2>|<l3>|<pp>`, `pageclr`, and `btn` logging.
2. **Daemon:** notify.json / page.json relay, events/ writer, multi-board mirror, tests in conftest.
3. **Engine:** core + notify + spotify + CLI + MCP + tests + README + runbooks (human and agent) + docs/media.
4. **On device:** flash both boards, `labdaemon notify "hello"`, Spotify login, a track playing, captures.
5. **Later controllers (queue, operator orders them):** weather, countdown timers, CTF board, fleet /
   THE DOCK, Home Assistant, buzzer + backlight as outputs. Each is one file in `controllers/`.

## Rules carried in

- Board renders and reports, host decides (waveshare-lcd-4-port.md § Direction).
- No secrets on the board or in the repo; tokens under `%LOCALAPPDATA%\Clawdmeter\`, DPAPI where possible.
- API binds loopback only; the MCP talks to it with the token.
- No `#ifdef BOARD_*` in shared firmware; new capability flags are trailing BoardCaps fields.
- No arrows, no decorative icons, no coloured borders, no slash-dash overkill in any UI or doc.
