# Creatures and modes: the ECHO creature learns to move, and the device learns what Claude is doing

Operator brief (2026-09-27, late): "apply some of the movements from the repo to the new creature",
"a spinning ascii square to the chest of the echo creature, try it, if it doesn't work we can remove it",
"working modes, entering Opus mode, entering ultracode and working in ultracode mode, splitting into
various agents", "button #1 to bring up the stats", "the number of agents that are working".

## RESUME STATE

- **Status:** ON DEVICE (2026-09-28 ~00:20): `coffee` and `echo idle` are compiled into the firmware
  (`tools/add_echo_anims.py`, SPLASH_ANIM_COUNT 20), sit in rotation group 0 (idle) and play by name
  (`anim echo idle` over serial, or the host's `a` field). Device captures:
  `docs/media/lcd4/echo-idle-device.png`, `coffee-device.png`.
- **Exact next action:** increment 3a (BOOT short press = splash<->stats toggle via
  `BoardCaps.pwr_toggles_stats`), then increment 1 on the bench (ECHO skin over the nine embedded
  stock movements in `docs/bench/stock_anims.js` + the chest spinner), then modes (increment 2).
- **Pipeline (any new creature):** edit `docs/bench/anims.js` → `node tools/bench_to_json.js` →
  `.venv\Scripts\python.exe tools/add_echo_anims.py` → `pio run … -t upload` → `anim <name>` →
  `screenshot_win.py`. GIFs: `tools/anim_gif.py`. Reference (stock) cells carry `reference: true`
  and are not exported; `fwname` is the table name the host sends.
- **Bench:** `docs/bench/animations.html` + `docs/bench/anims.js` (single source) + generated
  `docs/bench/stock_anims.js` (3-colour claudepix movements embedded so file:// works).
- **Export:** `node tools/bench_to_json.js` → `tools/echo_anims/*.json`; `.venv\Scripts\python.exe
  tools/anim_gif.py` → `docs/media/anims/`. Firmware side: `tools/add_echo_anims.py` (to write, modelled
  on `tools/add_csb_anims.py`) appends an ECHO block to `firmware/src/splash_animations.h` and rewrites
  the table + `SPLASH_ANIM_COUNT`.
- **Firmware facts:** payload parsed at `main.cpp:117-131` (`a` = host-named animation already exists);
  BOOT short press on the splash = `splash_next()` at `main.cpp:370`; splash<->usage toggle =
  `ui_toggle_splash()` (`ui.cpp:777`); mini creature helper `splash_mini_create(parent, anim_name, px)`
  (`splash.cpp:230`) already draws a named animation small, useful for the agents row.
- **Gotchas:** claudepix movements translate the whole body between frames, so the ECHO skin must be
  applied per frame from the frame's own geometry (eye cells, top row, bottom rows), never at fixed
  coordinates. Multi-palette animations (work_coding, DJ set) collide with the ECHO palette indices; skin
  only the 3-colour ones for now.

## Increments (each: bench first, operator look, then firmware)

1. **ECHO skin over stock movements.** Transform per frame: body 1 → echo-deep, eyes 2 → dark, visor band
   across the eye rows between the eyes, antenna on the top-right body column, feet darker. Apply to
   breathe, blink, look around, wink, surprise, sleep, bounce, sway. Plus the **chest spinner**: a 3 by 3
   ring on the chest where two opposite cells orbit (8 phases), master toggle so it can be judged and
   removed in one click.
2. **Mode animations** (new, ECHO palette): `echo_opus` (entering: visor to flash, antenna rapid ping,
   body brightens; working: slow visor pulse), `echo_ultracode` (entering: three glitch splits, the
   creature shrinks to 10 by 10 and duplicates into agents; working: minis with their own spinner
   phases), `echo_split` (the split alone, for a host-triggered moment). Agents count rendered as a small
   mono digit badge top-left of the splash, fed by the payload.
3. **Firmware.** (a) BOOT short press toggles splash<->stats on boards that report
   `BoardCaps.pwr_toggles_stats` (new field, default false; only `waveshare_lcd_4` sets it); (b) payload
   field `n` = agents working → `UsageData.agents`, shown on the usage screen and as the splash badge;
   (c) ECHO animations compiled in via `tools/add_echo_anims.py`, selectable by the host through `a`.
4. **Daemon.** Reads `%LOCALAPPDATA%\Clawdmeter\state.json` `{agents, anim, mode}` each tick and pushes
   at once when it changes; `daemon/clawdmeter_state.py set --agents N --anim echo_ultracode` writes it.
   Claude Code hooks (SubagentStart/SubagentStop, and a Workflow/ultracode start) call that script; the
   hooks themselves go into the operator's settings only with the operator's yes (update-config skill).
5. **Site.** New creatures and modes land in the landing band and README table; GIFs regenerate.

## Not in scope tonight
Touch (hardware thread), the page registry / WebSocket transport (hub plan), a hub name.
