# Windows Setup and Run Guide

This guide covers running the Clawdmeter Windows daemon on native Windows hardware.
It includes the turnkey `install-windows.ps1` bootstrap (tray icon + login autostart),
the manual-run fallback, and how to manage or remove autostart.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Native Windows** | Must run on real Windows — not WSL. The script prints a warning and BLE will not work under WSL. |
| **Python 3.11+** | Download from [python.org](https://www.python.org/downloads/) if not already installed. Ensure "Add python.exe to PATH" is checked during install. |
| **Claude Code installed** | Install Claude Code and complete `claude login` so credentials exist on disk. |
| **Clawdmeter powered on** | The device must be powered on and in range before the daemon starts. |
| **Paired with Windows Bluetooth** | Pair the device once via **Settings → Bluetooth & devices → Add device** (see [Pair the device](#pair-the-device-one-time)). This is required — the device is a bonded BLE HID keyboard, so pairing enables its physical buttons and keeps a persistent connection that shows your last usage even when the daemon is stopped. |

### Where are my credentials?

`claude login` writes the OAuth token to (first match wins):

1. `%USERPROFILE%\.claude\.credentials.json` — primary path (confirmed by Claude Code docs)
2. `%LOCALAPPDATA%\Claude\.credentials.json` — fallback
3. `%APPDATA%\Claude\.credentials.json` — fallback

The daemon probes these paths in order. You can also set `CLAUDE_CREDENTIALS_PATH` to an
absolute path or `CLAUDE_CONFIG_DIR` to a directory to override the search entirely.

> **Security note:** The credentials file contains your OAuth token. Never share its contents
> or embed it in scripts. The daemon reads it from disk and uses it only as the API
> `Authorization` header — the token is never written to any log, tooltip, or notification.

---

## Pair the device (one time)

The Clawdmeter is a **bonded BLE HID keyboard** as well as a usage display — its firmware
enables bonding (`NimBLEDevice::setSecurityAuth`) and advertises the HID service so its
physical buttons act as a keyboard (Space / Shift+Tab). Pair it with Windows **once**,
before running the daemon:

1. Put the device on its Bluetooth waiting screen (powered on, not yet connected).
2. Open **Settings → Bluetooth & devices → Add device → Bluetooth**.
3. Select **Clawdmeter** and complete pairing.

**Why this is required:**

- **Keyboard buttons** — HID over BLE requires bonding on Windows. Without pairing, the
  device's buttons won't reach the PC.
- **Persistent point-in-time view** — once paired, Windows maintains the BLE link and
  auto-reconnects the device whenever it is in range. This is intentional: the device keeps
  showing your **last-synced** usage even after you Quit the daemon, as a glanceable
  point-in-time view. Quitting the daemon releases only its data connection — it does **not**
  drop the Windows pairing, so the device stays connected to Windows.

To undo, use **Settings → Bluetooth & devices → (device) → Remove device**. Removing the
pairing disables the keyboard buttons.

---

## Setup (one time)

Open a PowerShell terminal and `cd` to the repository root.

**1. Create a virtual environment**

```powershell
python -m venv .venv
```

**2. Activate it**

```powershell
.venv\Scripts\Activate.ps1
```

If you see a scripts-execution-policy error, run:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Then repeat the `Activate.ps1` step.

**3. Install dependencies**

```powershell
pip install -r daemon\requirements-windows.txt
```

This installs `bleak` (WinRT BLE) and `httpx` (async HTTP for the Anthropic API).

---

## Running the daemon

With the venv active and the Clawdmeter powered on:

```powershell
python daemon\claude_usage_daemon_windows.py
```

### Expected console output

```
[HH:MM:SS] === Claude Usage Tracker Daemon (BLE, Windows) ===
[HH:MM:SS] Poll interval: 60s
[HH:MM:SS] Scanning for 'Clawdmeter' (8.0s)...
[HH:MM:SS] Not advertising; connecting to bonded address XX:XX:XX:XX:XX:XX
[HH:MM:SS] Connecting to XX:XX:XX:XX:XX:XX...
[HH:MM:SS] Connected
[HH:MM:SS] Sending: {"s":42,"sr":180,"w":17,"wr":8820,"st":"active","ok":true}
```

- **The device must be paired with Windows first** (see [Pair the device](#pair-the-device-one-time)).
  The daemon then connects over that existing link via `BleakScanner` + `BleakClient`; it does
  not pop its own pairing dialog.
- **`Scanning…` → `Not advertising; connecting to bonded address …` is normal.** Once paired,
  Windows keeps the device connected, so it stops advertising and an advertisement scan can't
  see it. The daemon detects this and connects directly to the device's address (recovered from
  the Windows PnP table). The 8-second scan that precedes the fallback happens once per session.
  Set `CLAWDMETER_BLE_ADDRESS=AA:BB:CC:DD:EE:FF` to pin the address and skip PnP lookup.
- After `Connected`, the daemon polls the Anthropic API immediately and sends the first
  payload within a few seconds of connect (warm token path). With a valid, non-expired token
  the device should leave its waiting screen and show session + weekly percentages within
  about 10 seconds of launch.
- The daemon then re-polls every 60 seconds while connected. If the device fires a refresh
  request (e.g., after a button press), an immediate re-poll occurs without waiting for the
  60-second interval.
- If the device disconnects or goes out of range, the daemon logs `Device disconnected` and
  re-scans automatically with exponential backoff (starting at 1 second, capped at 60 seconds).

### Stopping

Press **Ctrl+C** in the terminal. The daemon logs `Daemon stopping` and exits cleanly.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Warning: running under Linux/WSL` | Running in WSL, not native Windows | Run from a native PowerShell or Command Prompt on Windows |
| `Scanning for 'Clawdmeter'… Device not found` | Clawdmeter is off, out of range, or not yet paired | Power on the device, pair it once (see [Pair the device](#pair-the-device-one-time)), and ensure it is in range |
| `No token; skipping poll` | No credentials file found at any candidate path | Confirm `claude login` ran on this machine; check `%USERPROFILE%\.claude\.credentials.json` exists |
| `API HTTP 401` | Token expired | Re-run `claude login` in a terminal to refresh the token, then restart the daemon |
| `Connection failed` | WinRT BLE initialisation issue | Ensure Windows Bluetooth is on; try toggling Bluetooth off/on in Windows Settings |

---

## Tray icon, login autostart, and turnkey install

### One-command install (recommended)

> **Copy the repo to a native Windows path first.** Clone or copy this repository
> to a Windows location such as `%USERPROFILE%\Clawdmeter` — **not** a WSL share
> (`\\wsl$\...` or `\\wsl.localhost\...`). Installing from the WSL share would point
> the virtual environment and the login-autostart entry at a path that disappears when
> WSL shuts down, defeating the whole point of the Windows daemon. The installer
> detects a WSL path and refuses to run, telling you how to relocate.
>
> ```powershell
> Copy-Item -Recurse '\\wsl.localhost\Ubuntu\home\<you>\repos\Clawdmeter' "$env:USERPROFILE\Clawdmeter"
> cd "$env:USERPROFILE\Clawdmeter"
> ```

Run this once from the repository root in PowerShell (a native Windows path):

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

The script does four things in order and logs progress at each step:

1. Creates a Python virtual environment at `.venv`.
2. Installs dependencies from `daemon\requirements-windows.txt` (bleak, httpx, pystray, Pillow).
3. Registers the tray app to launch automatically at login via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` — per-user, no admin required.
4. Launches the tray app immediately (headless — no console window).

The script downloads nothing from the internet. It only installs the packages listed in
the in-repo `daemon\requirements-windows.txt`.

### Tray icon and status

After install, the Clawdmeter icon appears in the Windows notification area:

| State | Icon bubble | Tooltip |
|-------|-------------|---------|
| Connected | green | `Connected · last update HH:MM` |
| Scanning | amber | `Scanning…` |
| Error | red | `Error: token expired — run claude login` |

Hover over the icon to see the current status tooltip. A notification fires once when the
daemon first enters the Error state (e.g. after a token expiry).

### Tray menu

Right-click the tray icon for the menu:

- **Status header** (non-clickable) — live status + last data sync time.
- **Start at login** (checkable toggle) — enables or disables autostart at runtime.
  Reflects the current registry state each time the menu opens.
- **Quit** — stops the daemon cleanly and exits with no lingering process. It releases the
  daemon's own data connection but does **not** drop the Windows Bluetooth pairing — the
  device stays connected to Windows and keeps showing your last-synced usage (point-in-time
  view).

### Disabling or removing autostart

Use the tray menu toggle, or remove the registry value manually:

```powershell
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Clawdmeter /f
```

### WSL independence

The daemon operates fully independently of WSL. The token is read from native Windows
credential paths (`%USERPROFILE%\.claude\.credentials.json` and fallbacks); BLE uses
the WinRT stack directly. Running `wsl --shutdown` does not affect the BLE link, and
the daemon starts correctly even in a fresh Windows session where WSL has never been
launched.

---

## Relay files and several boards

The tray daemon is the one process that talks to the boards. Other tools, the LabDaemon
Engine first among them, reach the boards through small JSON files in
`%LOCALAPPDATA%\Clawdmeter\`, the same way the approve hook uses `approve.json`. Write each
file whole in one step: write a temp file in the same folder, then rename it over the target.
The daemon checks the files every second and sends each change to the boards as its own
message, never folded into the usage payload. A board holds one incoming message at a time,
so when several are due in the same second the daemon sends them a quarter second apart.

| File | Written by | Holds | The board gets |
|------|------------|-------|----------------|
| `notify.json` | the engine | `{"title", "body", "secs", "expires"}` | `{"nt", "nb", "nx"}` |
| `page.json` | the engine | `{"pg", "pt", "p1", "p2", "p3", "pp", "pa", "pi", "expires"}` | `{"pg", "pt", "p1", "p2", "p3", "pp", "pa", "pi"}` |
| `art\<id>.jpg` | the engine | the album picture for a page's `pi`, at most 24 KB | the picture in chunks, when a page names it (see Album art) |
| `wifi.json` | the engine's `wifi set` and `wifi clear`, or you | `{"ssid", "pass"}` | `{"wf", "wp"}`, once, and the file is deleted |
| `cmd\<ns>.json` | the engine | `{"c", "v", "expires"}`, one verb for the boards | `{"c", "v"}`, once, in name order, and the file is deleted (see Commands) |
| `events\<ns>.json` | the daemon | `{"btn", "scr", "addr", "ts"}` | nothing: it is for the engine |
| `board\<address>.json` | the daemon | `{"br", "scr", "an", "fw", "n", "dv", "do"}` from the board's report, with `{"cmd", "last", "ts", "addr", "name"}` | nothing: it is the board's answers, for the engine |
| `daemon.pages` | the daemon | `{"boards"}`, the boards it last sent a page to | nothing: it is the daemon's own note |

**Text.** Every text field is capped in bytes of `UTF-8`, the way the board caps it, and never
cut inside a character. Control characters other than a newline go out as spaces, which is how
the board shows them anyway. Text travels as `UTF-8` itself, not as `\u` escapes. The panel
fonts draw printable ASCII only, so a writer should fold its text to ASCII first, as the engine
does. Anything else still arrives intact, but the board has no glyph to draw it with.

**Notifications.** The title keeps at most 23 bytes and the body 96. The board shows the
notification for `secs` seconds (8 when `secs` is left out, never more than an hour) and never
past `expires`. A notification already on disk when a board links is not shown; write a new one.

**Pages.** The page name keeps at most 15 bytes, the title 23 and each of the three lines 40.
`pp` is progress as a whole number from 0 to 100, or `-1` for no bar, and `pa` is a creature
animation name or an empty string. `pi` is the album art id, up to 16 characters, each a
lowercase letter or a digit. It goes to the board unchanged and is never cut to fit; an id of
any other shape is left off, and the page goes without it. A board that links gets the current
page at once. The board keeps no timer for a page, so the daemon clears it itself when its
`expires` passes.
Rewriting the same page with a later `expires` keeps it up without sending anything again,
and a change to the progress alone is sent without a log line.

**Clearing.** `expires` is a Unix time in seconds and is required. While a board is linked, a
file that goes away, or one without `expires` or past it, clears the board: `{"nt":"","nb":""}`
for a notification, `{"pg":""}` for a page (an empty `pg` clears it too). A page can also be
gone by the time a board links again, for example when the engine dropped it while the PC was
asleep. The daemon notes in `daemon.pages` every board it sent a page to, and a board on that
note that links while there is no live page gets `{"pg":""}` first, even after the tray has
restarted. A board the daemon never sent a page is never sent a clear. A file that is not valid
JSON is logged and skipped, and the board keeps what it shows.

**Size on the wire.** One message carries at most the link's MTU less 3 bytes, and never more
than the 511 bytes a board keeps. The boards ask for an MTU of 256, so the daemon assumes 253
bytes until the link reports its own. A page, notification or approve prompt that would be
longer gives up text from the end of its least needed field until it fits: `p3` first, then
`p2`, `p1` and the title of a page, the body and then the title of a notification, the text and
then the tool name of a prompt. One that still does not fit is logged and not sent. A usage
payload always goes out whole.

**Album art.** The picture for a page travels over the Bluetooth link itself, so a board needs no
network to show it. When a page goes to a board with a `pi` that board has not had on this link,
the daemon sends it `art\<pi>.jpg`, the picture the engine keeps for that id, from a task of that
board's own, so the other messages and the other boards never wait on it. First comes the message
`{"ab", "al", "an"}`: the id, the size in bytes and the number of chunks. A quarter second later,
the time the board takes to read a message, the chunks follow on a characteristic of their own,
written without response, about 16 ms apart (the daemon asks for 8 ms, and the Windows clock
moves in steps of 15.6 ms). Each chunk is its number in 2 bytes, low byte first, then the next
part of the file: the link's MTU less 5 bytes, never more than 510 since one write to a
characteristic carries at most 512 bytes. That is 251 bytes at the MTU of 256 the boards ask
for, with the last chunk holding what is left. The board answers `{"art": id, "ok": 1}` once it
shows the picture. `{"art": id, "miss": [...]}` names chunks that never arrived, and exactly
those go again, at most three times. With no answer within 4 seconds of the last chunk the
daemon gives the picture up: a second more than the board's own 3 second timer, whatever moment
that counts from. Every picture gets one line in the log, whatever became of it: the id, what
happened, then the bytes, the chunks, the chunk writes it took and the milliseconds, as in
`Art 0123456789ab shown: 5120 bytes in 21 chunks, 21 writes, 900 ms`, about half of that the
quarter seconds before and after the header. A board that shows the picture already may answer
the header itself; then no chunk goes, and the line says `already on the board` in place of
`shown`. A page with a newer id stops the picture going out before its next chunk and drops one
still waiting for its turn. The same id again, on a progress update or after a page without
art, sends nothing more on that link. Only ids of 8 to 16 characters are sent, and only files of
at most 24 KB; a missing, empty or larger file is logged and skipped. A board on older firmware
has no characteristic for the chunks, and a link that cannot hear the board's answers cannot
finish a picture: either way the daemon says so once for the link and sends it no pictures.

**Button presses.** A press the board hands to the host lands as `events\<ns>.json`: the
button (`pwr` or `aux`, or `pwr2` and `aux2` for a double tap), the screen it was pressed on
(`splash`, `usage`, `approve`, `notify` or `page`), the Bluetooth address of the board, and
the time. Names are nanosecond times that only ever grow, so reading them in name order
replays the presses in order. Read only names that end in `.json`; a name that starts with a
dot is a file still being written. The daemon only ever adds files to `events`; it never
deletes them.

**Wi-Fi.** To put the boards on your Wi-Fi (the 4 inch board can also fetch album art over it,
when the art did not come over Bluetooth; a board built without Wi-Fi ignores this), use the
LabDaemon Engine. In its folder:

```powershell
.venv\Scripts\python.exe -m labdaemon_engine wifi set "Home Net"
.venv\Scripts\python.exe -m labdaemon_engine wifi clear
```

`wifi set` asks for the password without showing it and writes `wifi.json` whole, in one step.
`wifi clear` writes `{"ssid": ""}`, which sends `{"wf": ""}`, and the boards forget the network.
Without the engine, write the file yourself, whole as above, as `{"ssid": "...", "pass": "..."}`:
the `ssid` at most 32 bytes of `UTF-8`, the `pass` 8 to 63 bytes or a raw key of exactly 64
hex digits, and an empty `pass` for an open network. The daemon sends it once, as
`{"wf", "wp"}`, to every board linked at that moment, waiting for a link if there is none, and
then deletes the file. Its log says how many boards took it and never shows the password.
Taking the write is not keeping it: a board built without Wi-Fi takes it and drops it, so write
the file while the 4 inch board shows Connected. A file it cannot use is logged without its
content and left for you to fix. A file it cannot open yet, because another program has it
open, is logged once and read again every second until it opens. Each board keeps the
credentials in its own flash, so the file is needed once, not at every start. A board that
links after the file is gone does not get it: write the file again for that board.

**Commands.** A file in `cmd` is one named verb for the boards, `{"c": verb, "v": value,
"expires"}`, written whole like the others under a name that sorts in the order the verbs
should go (the engine uses nanosecond times, as for `events`). Every second the daemon reads
the files in name order, hands each one to every board linked at that moment and deletes it.
A file that cannot be opened for a moment (another program holding it) holds back the ones
after it, so a later verb never overtakes an earlier one. Each board's link then sends its
share as a message of its own, `{"c", "v"}`, at most four a second (more wait for the next
second), never waiting on another board, and never waiting for the answer. A file past its
`expires`, or without one, is deleted after a log line and goes to no board. So is a file that
is not valid JSON, whose verb is not a word of up to 15 ASCII letters, digits, `-` or `_`, or
whose value is not text of up to 32 bytes. A whole number as the value goes as its digits, and
a value is never cut, since a cut creature name would name another creature. With no board
linked the files wait, and the first board that links takes those still live. The verbs are
the board's: `bright` with 0 to 100 (the panel brightness, kept on the board), `anim` with a
creature name (held on the splash; an empty value lets it go), `screen` with `splash`, `usage`
or `page`, `dance` with `next`, `dview` with `card`, `large` or `full` (how big a page that
dances, the music card while a track plays, draws its dancer, kept on the board), `dvo` with 0
to 100 (the opacity of the strip the full view draws over the dancer, kept on the board), and
`status` with an empty value. The board
writes each new `bright`, `dview` and `dvo` value to its flash, so a slider is best sent once
it is let go, not at every step.

The board answers each one on its own: `{"c": verb, "ok": 1}`, `{"c": verb, "err": why}`, or
for `status` its report. Whatever comes back lands in `board\<address>.json`, the address
with dashes in place of its colons: the fields of the latest report (`br` the brightness from 0
to 100, or `-1` on a board that cannot set it, `scr` the screen on top, `an` the creature on
the splash, `fw` the board's name, `n` how many animations it has, `dv` the dance view a
dancing page gets, `card` on a board without PSRAM, and `do` the overlay opacity; firmware from before
the dance view reports neither), `last` with the latest
answer as `{"c", "ok": 1}` or `{"c", "err"}`, `cmd` true, then `ts`, `addr` and `name`. `ts`
is the time of the latest answer, while the report's fields stay until the next report
replaces them: ask for `status` after a change to see its effect there. Each link asks its
board for a report once, as soon as it can hear the board's answers, so the file is there
without anyone asking. A board on firmware from before the commands answers one with the
plain `{"err": true}`: its file then says `cmd` false, with `last` naming the verb and the
error `old firmware`, and the log says so once for the link. Flash that board to use the verbs.

**Several boards.** The daemon links every board bonded to this PC whose Bluetooth name is
ECHO_LabDaemon or one of its older names (ECHO_MiniDaemon, Clawdmeter). Each board gets its
own link and its own reconnect backoff, and every message goes to every linked board, so all
of them show the same prompts, notifications and pages and take the same commands, each board
answering in its own `board` file. Usage is the one exception: each link
polls it on its own schedule, so two boards can show numbers up to a minute apart, and the API
is asked once a minute for each board. An approve or a button press
from any board counts, and its event carries that board's address. Connects take turns, one
board at a time. The heartbeat reads connected, and the tray shows Connected, while at least
one board is linked. Log lines from each link start with the board address in brackets. With
one bond the daemon behaves exactly as before. The bond list is read when the daemon starts
and each time its board has to be found again, so after pairing another board, Quit the tray
and start it again. `CLAWDMETER_BLE_ADDRESS` still pins exactly one board and skips the
lookup.

---

## What is NOT covered here

- PyInstaller / one-file `.exe` packaging — v2
- MAC-address cache / sleep-wake reconnect hardening — Phase 3
