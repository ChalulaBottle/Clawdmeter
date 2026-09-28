# Creatures and modes: the ECHO creature learns to move, and the device learns what Claude is doing

Operator brief (2026-09-27, late): "apply some of the movements from the repo to the new creature",
"a spinning ascii square to the chest of the echo creature, try it, if it doesn't work we can remove it",
"working modes, entering Opus mode, entering ultracode and working in ultracode mode, splitting into
various agents", "button #1 to bring up the stats", "the number of agents that are working".

## RESUME STATE

- **Status:** 34 ECHO EDITION CREATURES ON DEVICE (2026-09-28 ~02:10), SPLASH_ANIM_COUNT 52, flash
  25.3%. Families: coffee ×4 (coffee, coffee morning, echo coffee, echo double coffee), echo idle/float,
  eight skinned stock movements, thinking set (think spin, think deep, work, write, read), modes (opus
  enter/work, ultracode enter/work, agents split/join, two agents, ultramode, token burner, credits out),
  model tiers (haiku, sonnet, opus, fable), ctf hoodie. ECHO names sit first in all three rotation
  groups (splash.cpp GROUP_NAMES, GROUP_MAX 10); modes and tiers are host-named only. BOOT short =
  stats toggle (BoardCaps.pwr_toggles_stats). Device captures in `docs/media/lcd4/*-device.png`, tier
  sheets in `docs/media/sheets/`. Discord pack (120 + 320 px, transparent) in `docs/media/discord/` and
  `Temp Media ECHO/discord/clawdmeter-creatures/`.
- **Workflow lanes (wf_1929d87d-05a):** three creature lanes landed (`docs/bench/anims_thinking.js`,
  `anims_modes.js`, `anims_models.js`, committed); firmware/daemon lane edited `data.h`, `main.cpp`,
  `ui.cpp` (agents count `n`), compiles, NOT yet committed pending its report (tests, daemon state file).
- **Exact next action:** read the firmware lane's report, commit its changes with the daemon state
  file + `clawdmeter_state.py`, then wire the activity table (below) into the daemon; ask the operator
  before touching Claude Code hooks. Then flip the landing board captions to device captures.
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

## Activity → creature mapping (operator 2026-09-28 ~01:20: "responsive to the Claude activities")

The board never infers activity; the host names the animation through the payload `a` field
(daemon merges `state.json`, written by `clawdmeter_state.py`, called by Claude Code hooks). The
board decides only what it can see in its own payload (usage %, status). Table to implement:

| Signal | Where it is known | Creature (`a`) |
|---|---|---|
| idle, morning (local time before 10:00) | daemon (clock) | `coffee morning`, else `coffee` / `echo idle` rotation |
| thinking (assistant turn, no tool) | hook: PreToolUse absent for >5 s after UserPromptSubmit | `echo think` |
| working (tool calls flowing) | hook: PreToolUse / PostToolUse | `echo work` |
| writing files | hook: PostToolUse on Edit/Write | `echo write` |
| subagents running (n) | hook: SubagentStart / SubagentStop counter | 1: `echo idle`, 2: `two agents`, 3+: `ultracode work`; `n` badge |
| workflow / ultracode start | hook on Workflow tool use | `ultracode enter` then `ultramode` while running |
| model tier in use | Claude Code status line / model env | `haiku` / `sonnet` / `opus` / `fable` |
| tokens this turn > 500k | hook: budget / usage reading | `token burner` |
| session limit hit | board: payload `st` != allowed or session ≥ 100 % | `credits out` (board-local, no host needed) |
| CTF work | hook: cwd under a CTF folder (htb-*, ctf, holmes-launch) or a `mode: ctf` set by hand | `ctf hoodie` |
| Opus / heavy reasoning | model tier + effort | `opus enter` then `opus work` |

Hooks go into the operator's settings only with the operator's yes (update-config skill); until
then `clawdmeter_state.py set --anim <name>` drives it by hand and the serial poke `anim <name>` for tests.

## Queued by the operator (2026-09-28, ~01:00): "this will turn into a big project now"

- **Clock page**: local time on the device. The payload already carries `t` (epoch) and `tf`
  (12/24) from the csb-buddy branch (`main.cpp` parses them); the daemon must send them and a
  clock screen must render them. First page-registry candidate after usage.
- **Countdown timers**: named timers pushed from the host (CTF start/end, lab windows), shown as
  a big mono countdown with the creature reacting at T minus 5 and at zero.
- **CTF updates**: scoreboard rank / solves / next challenge from the club's CTF tooling, as a page
  fed by a host script; ties to the ECHO CTF records page. Same "host decides" rule.
- Creature asks landed tonight: `echo float` (body drifts over planted legs), `coffee morning`
  (waking up with the mug). More families coming from the workflow lanes.
These belong to the hub plan's page registry (see `waveshare-lcd-4-port.md` § Direction); do not
hand-roll a fourth screen before the registry exists.

## Not in scope tonight
Touch (hardware thread), the page registry / WebSocket transport (hub plan), a hub name.
