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
| `page.json` | the engine | `{"pg", "pt", "p1", "p2", "p3", "pp", "pa", "expires"}` | `{"pg", "pt", "p1", "p2", "p3", "pp", "pa"}` |
| `events\<ns>.json` | the daemon | `{"btn", "scr", "addr", "ts"}` | nothing: it is for the engine |
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
animation name or an empty string. A board that links gets the current page at once. The
board keeps no timer for a page, so the daemon clears it itself when its `expires` passes.
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

**Button presses.** A press the board hands to the host lands as `events\<ns>.json`: the
button (`pwr` or `aux`), the screen it was pressed on (`splash`, `usage`, `approve`, `notify`
or `page`), the Bluetooth address of the board, and the time. Names are nanosecond times that
only ever grow, so reading them in name order replays the presses in order. Read only names
that end in `.json`; a name that starts with a dot is a file still being written. The daemon
only ever adds files to `events`; it never deletes them.

**Several boards.** The daemon links every board bonded to this PC whose Bluetooth name is
ECHO_LabDaemon or one of its older names (ECHO_MiniDaemon, Clawdmeter). Each board gets its
own link and its own reconnect backoff, and every message goes to every linked board, so all
of them show the same prompts, notifications and pages. Usage is the one exception: each link
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
