# labdaemon: our own control layer behind ECHO_MiniDaemon

Operator (2026-09-29 ~20:25): "Lets write our own for this entire build, we will add other things this
labdaemon can control over time." Asked in the same thread: Spotify controller, notifications/messages on
the panel, PWR as a second button (done, fc81354), connect automatically (done, HKCU Run restored).

## RESUME STATE

- **Status:** PLAN ONLY, nothing built. Waiting on operator answers (below).
- **Exact next action:** operator answers the open decisions; then build increment 1 (core + notify).
- **Shipped around it:** two buttons fc81354 (PWR GPIO16 short = stats/approve, BOOT short = aux,
  BOOT hold = pair); plan note 59f15bd; tray autostart re-registered (HKCU Run "Clawdmeter").
- **Key files today:** `daemon/claude_usage_daemon_windows.py` (owns the BLE link, 60 s tick, 1 s watch
  tick), `daemon/clawdmeter_approve.py` (the approve round trip this reuses), `firmware/src/main.cpp`
  (`handle_approve_msg`, button block), `firmware/src/ui.cpp` (`ui_approve_show`).
- **Decisions (operator, 2026-09-29 ~20:30):** Spotify **Premium** (full control). PC side is named
  **LabDaemon Engine**, own **private repo** `ChalulaBottle/labdaemon-engine`. The board and everything
  public is renamed **ECHO_LabDaemon** (repo, Pages, README, Bluetooth name, tray), same scope as the
  MiniDaemon rename (23c214a); the daemon keeps accepting the older bond names. Order: rename, then
  engine repo + increment 1.

## Shape

**One controller registry, three faces.** Every integration is a controller module with the same small
contract; the board, Claude and the command line all reach the same controllers.

```
controllers/<name>.py
  NAME, TITLE
  def state() -> dict          # what a page shows (small, flat, board-safe)
  ACTIONS = {"next": fn, ...}  # named verbs, no free-form code
  def poll(now) -> bool        # optional; True when state changed
```

- **Core (`labdaemon`)**: loads controllers, runs their polls, keeps the last state, runs actions, and
  serves a loopback-only HTTP API (`127.0.0.1`, random token in `%LOCALAPPDATA%\Clawdmeter\lab.token`):
  `GET /controllers`, `GET /state/<name>`, `POST /do/<name>/<action>`, `POST /notify`.
- **Face 1, the board**: the existing tray daemon keeps the BLE link (no second radio client). It asks the
  core for the active page each tick and pushes it as its own BLE message (same pattern as approve's
  `q`): `{"pg":"music","f":{...}}`. Button presses come back on TX as `{"btn":"aux"|"pwr","pg":...}` and
  the daemon maps them to that page's actions. The board renders, the host decides.
- **Face 2, Claude**: our own MCP server `labdaemon_mcp.py` (stdio) with three tools, `lab_list`,
  `lab_state`, `lab_do`, all calling the loopback API. Registered in Claude Code settings only with the
  operator's yes.
- **Face 3, CLI**: `python -m labdaemon do spotify next`, `labdaemon notify "text"` (hooks and scripts).

## Increments (each ends flashed, captured, committed, pushed)

1. **Core + notify controller + board overlay.** `ui_notify_show(title, text, secs)` = `ui_approve_show`
   without the button, self-expiring, either key dismisses. BLE message `{"nt","nx","ns"}`. Serial poke
   `msg <text>`. Proof: `labdaemon notify "hello"` shows on the panel, fbshot captured.
2. **Spotify controller.** Web API, Authorization Code + PKCE, operator creates the app at
   developer.spotify.com (client id only, no secret), redirect `http://127.0.0.1:8975/callback`
   (Spotify refuses `localhost`). Refresh token stored DPAPI-encrypted on the PC, never on the board.
   state = track, artist, is_playing, device name, progress; actions = play_pause, next, previous,
   volume_up, volume_down. Works on whichever device is active (PC or phone).
3. **Music page on the board.** Track + artist + progress bar + ECHO headphones creature. Shown while
   something plays and the operator steps to it; on it BOOT = play/pause, PWR = next (PWR still leaves
   the page on a double tap or after the page times out; settle on device).
4. **MCP face.** `labdaemon_mcp.py`, then the settings entry (operator gated).
5. **Later controllers (queue, operator orders them):** weather, countdown timers, CTF board, fleet /
   THE DOCK, Home Assistant, buzzer + backlight as outputs. Each is one file in `controllers/`.

## Rules carried in

- Board renders and reports, host decides (waveshare-lcd-4-port.md § Direction).
- No secrets on the board or in the repo; tokens under `%LOCALAPPDATA%\Clawdmeter\`, DPAPI where possible.
- API binds loopback only; the MCP talks to it with the token.
- Actions are named verbs only; nothing takes code or shell from a page, a payload or a tool call.
- Page registry in firmware arrives with increment 3 (music is the first page after usage), not before.
