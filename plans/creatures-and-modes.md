# Creatures and modes: the ECHO creature learns to move, and the device learns what Claude is doing

Operator brief (2026-09-27, late): "apply some of the movements from the repo to the new creature",
"a spinning ascii square to the chest of the echo creature, try it, if it doesn't work we can remove it",
"working modes, entering Opus mode, entering ultracode and working in ultracode mode, splitting into
various agents", "button #1 to bring up the stats", "the number of agents that are working".

## RESUME STATE

- **2026-09-29 correction:** the creature hooks (`clawdmeter_hooks.py`, all 11 events) ARE installed in
  `~/.claude/settings.json` and proven live on the panel (ultracode work + agents badge during workflow
  wf_0d1fbc33-2f9). Lines below saying "hook NOT installed" refer only to the PermissionRequest approve
  hook, which is still operator gated. The project is now ECHO_LabDaemon; host side = LabDaemon Engine
  (`plans/labdaemon.md`).
- **Status:** 34 ECHO EDITION CREATURES ON DEVICE (2026-09-28 ~02:10), SPLASH_ANIM_COUNT 52, flash
  25.3%. Families: coffee ×4 (coffee, coffee morning, echo coffee, echo double coffee), echo idle/float,
  eight skinned stock movements, thinking set (think spin, think deep, work, write, read), modes (opus
  enter/work, ultracode enter/work, agents split/join, two agents, ultramode, token burner, credits out),
  model tiers (haiku, sonnet, opus, fable), ctf hoodie. ECHO names sit first in all three rotation
  groups (splash.cpp GROUP_NAMES, GROUP_MAX 10); modes and tiers are host-named only. BOOT short =
  stats toggle (BoardCaps.pwr_toggles_stats). Device captures in `docs/media/lcd4/*-device.png`, tier
  sheets in `docs/media/sheets/`. Discord pack (120 + 320 px, transparent) in `docs/media/discord/` and
  `Temp Media ECHO/discord/clawdmeter-creatures/`.
- **Workflow wf_1929d87d-05a DONE (4 lanes, 0 errors):** creature families committed; firmware/daemon
  lane committed too: payload `n` → `UsageData.agents` → "N AGENTS" tag on the usage screen (480-wide
  boards only) + splash badge top-left (PSRAM boards), hidden when BLE drops or data is >90 s old;
  daemon reads `%LOCALAPPDATA%\Clawdmeter\state.json` `{agents, anim, mode}` every tick, pushes at
  once on mtime change; `daemon/clawdmeter_state.py set|show|clear`; `usage_rate.cpp` ignores samples
  <50 s apart so pushes don't skew the rate; 133 daemon tests pass. Tray restarted to load it.
- **Approve on device SHIPPED (2026-09-28 ~00:52), end-to-end on the real panel:** Claude Code
  `PermissionRequest` hook `daemon/clawdmeter_approve.py` → `approve.json` → daemon pushes
  `{"q","qt","qs","qx"}` as its own BLE message (`WATCH_TICK` 1 s, no API call in the path) →
  `ui_approve_show` overlay (title, tool in accent, text, APPROVE button for touch, hint) → BOOT
  press or tap → `ble_send_approve` `{"approve":id}` on TX (daemon now subscribes TX) → daemon writes
  `decisions/<id>.json` → hook prints the allow JSON. Fall-through (no output, exit 0) when no fresh
  connected heartbeat (`daemon.heartbeat`, written every tick), panel busy, no answer in 40 s, bad
  input. 0.7 s arm delay; device self-expires; deny stays terminal only (long press collides with
  pair_tick). Serial pokes `ask` / `ok` / `askclr`. 166 daemon tests pass. Tray restarted (PID 20852).
  Capture `docs/media/lcd4/approve-device.png`. **Hook NOT installed in settings** (operator gated);
  snippet in README § Approve.
- **Clock + morning coffee (2026-09-28 ~08:10):** daemon config `%LOCALAPPDATA%\Clawdmeter\config`
  now has `clock=auto` → payload `t`/`tf` → usage title shows the live time (12 h detected from
  Windows). `ui_local_time(&hour,&yday)` exposes it; `splash.cpp` `morning_pick()`: 06:00 to 10:00
  local, groups idle/normal, two picks in three come from {coffee morning, echo coffee, coffee}; on
  days with yday % 3 == 0 "echo coffee" becomes "echo double coffee". Logged as `splash: morning ->`.
  Serial `stats` toggles the usage screen for captures. Captures `docs/media/lcd4/clock-device.png`,
  `morning-device.png`.
- **Replacing the stock set (operator 2026-09-28 ~19:10):** every stock Clawd animation gets an ECHO
  replacement drawn from scratch (no claudepix frames, no skinning), in `docs/bench/anims_replace.js`,
  each with `replaces: '<stock name>'`. At integration: add the script tag to animations.html, teach
  `tools/add_echo_anims.py` to drop every stock entry named in a `replaces` field from the table and from
  `GROUP_NAMES` (splash.cpp), and put the replacement in that slot of the rotation. Order (table order):
  dance bounce dj (**echo dj, done**), dance sway dj, dance djmix, idle breathe, idle blink, idle look
  around, work coding, work think, expression surprise, expression sleep, expression wink, dance bounce,
  dance sway, done, think, write, allow, limit. Note some ECHO skins already exist (echo breathe, echo
  wink...) but they are skinned from claudepix frames, so they count as NOT original and get redone too.
- **Batch of ten (2026-09-28 ~12:05), exported, compiled, NOT flashed (no USB data):** echo happy
  (> < eyes), echo ssh (packet to a tower), echo loading (visor = braille bar), echo eye spin, echo
  kiss + kiss b, echo summon (one variant; the "materialise behind" lane was stopped by a content
  classifier), echo openclaw, echo headphones + Clawd headphones (from the operator's cc1.jpg).
  Workflows wf_43b9a4ec-423, wf_249afe03-8d1, wf_21f58478-9f8 (design lane + frame audit each;
  `scratchpad/integrate_snippet.js` splices audited snippets before the "Shared library" marker).
  SPLASH_ANIM_COUNT 67, flash 27.1%, GROUP_MAX 14, new ones in the rotation groups. GIFs in
  docs/media/anims + discord (120/320) + Temp Media ECHO pack; README + landing + ECHO page boards
  say "Built" until the flash flips them to "On device". Also queued by the operator: coffee held by
  the handle (below). **Next flash = auto-rotate + these ten in one go; then device captures.**
- **PAUSED 2026-09-28 ~08:20 (operator off to school).** Everything above is committed and pushed
  (`481faa7`). Queued, not started: **coffee held by the handle** (operator: "a coffee version that
  looks like its holding a coffee cup from the coffee handle"): new mug with a handle on the right,
  arm out, hand on the handle; build in `docs/bench/anims.js` next to `mugAt`/`echoMug` (line ~52 and
  ~511), both Clawd and ECHO versions, then the usual export → firmware → captures.
- **Exact next action:** operator decides whether to add the PermissionRequest hook to their
  settings (README snippet). Then the activity table below into hooks (same gate). Touch-to-see-usage
  = BOOT today (`pwr_toggles_stats`); a tap needs the GT911 answer (factory image test waits on the
  operator). Stickers: `tools/sticker.py`, `tools/sticker_neon.py`, `tools/sticker_diecut.py`.
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

## The culture batch (2026-10-03)

Operator (2026-10-02): "Lets contue to develop more animations, I am open to ideas suchs are famous paintsing,
memes, popculture to be added to the naiumation list, we can do whatever we want, get crazy get creative."

- **Status: built, not flashed.** Sixteen creatures, one file each in `docs/bench/anims_culture_<lane>.js` (script
  tags in `animations.html`), lane GIFs and contact sheets in `docs/media/culture/` (checked cell for cell against
  the export), JSON in `tools/echo_anims/`. All big tier and 60 cells: the table is 99 rows with SPLASH_BIG and 73
  without (the big tier 26 rows, 3179 KB). All sixteen sit in the wildcard pool (`WILD_NAMES`, inside
  `#ifdef SPLASH_BIG`). Commits cf46577 (bench, media, JSON) and a38db70 (table, pool, partition).
- **lcd_4 partition:** the batch is 1,954,800 bytes of frames and overflowed default_16MB's 6.25 MB app0 (6,809,891
  bytes, 103.9 %). The lcd_4 env now uses `max_app_8MB.csv`, one 7.9 MB factory app with nvs unchanged at 0x9000
  and 0x5000 (the firmware uses no OTA and no filesystem): 82.5 % (6,809,891 of 8,257,536 bytes), 1.45 MB left.
  `board_build.app_partition_name = app0` keeps the size check honest (the platform only reads an ota_0 slot).
  amoled_216 is unchanged at 3,309,955 bytes (99.0 %).

| fwname | after | frames | bytes | loop |
|---|---|---|---|---|
| echo starry night | Van Gogh, The Starry Night (1889, public domain): it gazes up, its antenna answers a star | 38 | 136,800 | 10.8 s |
| echo scream | Munch, The Scream (1893, public domain): ECHO on the bridge under the banded sky | 36 | 129,600 | 8.47 s |
| echo great wave | Hokusai, Under the Wave off Kanagawa (about 1831, public domain): it surfs the wave, Fuji low right | 30 | 108,000 | 8.33 s |
| echo mona lisa | Leonardo, Mona Lisa (about 1503, public domain): the smile comes and goes, the eyes follow a passer by | 24 | 86,400 | 10.93 s |
| echo pearl earring | Vermeer, Girl with a Pearl Earring (about 1665, public domain): it turns to look, the pearl against the shadow | 31 | 111,600 | 7.74 s |
| echo creation | Michelangelo, The Creation of Adam (about 1512, public domain): ECHO plays both parts, the spark at the gap | 23 | 82,800 | 8.97 s |
| echo vitruvian | Leonardo, the Vitruvian figure (about 1490, public domain): the square and circle poses, then a wheel | 28 | 100,800 | 7.75 s |
| echo thinker | Rodin, The Thinker (1904, public domain): bronze, a bulb, it comes alive, back to bronze | 31 | 111,600 | 9.04 s |
| echo melting clock | a surrealist melting watch, artist and title deliberately unnamed: it melts with the watch | 28 | 100,800 | 9.92 s |
| echo this is fine | the meme format: calm with its coffee while the room burns, a bubble of three dots | 43 | 154,800 | 7.51 s |
| echo distracted | the meme format: one head turns after a shiny passer by, the partner glares | 39 | 140,400 | 8.82 s |
| echo galaxy brain | the expanding brain format: four brighter stages to a cosmic finale | 39 | 140,400 | 11.16 s |
| echo stonks | the stonks format: a suit, a chart line, the crash, the V shaped recovery | 33 | 118,800 | 8.57 s |
| echo slow dodge | a film moment with no characters: glyph rain, a long coat, the impossible lean as slow slugs pass | 42 | 151,200 | 7.76 s |
| echo saber duel | two creatures and two laser swords, generic fencing: en garde, the bind, the push, the spin, the bow | 41 | 147,600 | 7.46 s |
| echo crosswalk | four walkers in single file on a zebra crossing, after a 1969 album cover photograph | 37 | 133,200 | 7.03 s |

Sixteen creatures, 543 frames, 1,954,800 bytes of frame data.

**The IP rule.** Everything is drawn from scratch in code and the ECHO creature plays every role, so no real
person's likeness and no third party character appears. Public domain works are credited by maker, title and
date. A meme, film or photo lends its format only (setting, composition, gesture), never its characters, captions,
logos, people or pixels. A work still in copyright lends the idea, never the expression: the melting clock never
names its painter (also a registered trademark) or the painting, in any name, key, file, caption, README, site or
post, and never takes the "after X (public domain)" credit. A trademarked name stays out of every file, caption,
media index and commit: the film effect behind the slow dodge is a live UK mark (UK00902697340, Warner Bros.
Entertainment, classes 9, 28 and 41, renewed to 2032), so that lane was renamed before anything landed; the saber
duel uses the dictionary word only and none of the film's words, colours or costumes; the crosswalk never names
the band, the album, the photographer or the car; the distracted cell never names the photo or its people.
"echo this is fine" is the meme's own caption phrase (only a web search was done on the mark); renaming it is
the operator's call and a one line change. Never crop the great wave into a wave over a mountain emblem for a
sticker: a surf brand's logo comes from the same print.

**Gotchas.** Animation indexes in splash.cpp are `int8_t` (find_anim, group_lists, wild_list, morning_list,
bag_draw): 99 rows fit, row 128 needs them widened first. A rerun of `bench_to_json.js` writes LF over the CRLF
checkout, so `git status` lists every JSON as modified with no content change; `git add` clears it.

**Open:** the operator's OK on the new lcd_4 table, then the flash and device captures; README big tier counts and
tables, `docs/media/anims` GIFs (`anim_gif.py --only`) and the landing band; the pearl earring review fixes (a
stray rim cell, the broken fold, the pearl wire rounding, the mouth timing) and the optional polish in each lane's
review; on the panel, the mona lisa's faint smile, the thinker's dark bronze and the slow dodge coat.

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

## Queued by the operator (2026-09-28, ~02:40): pages for the hub

- **Built-in time**: clock page (payload `t`/`tf` exist; daemon sends them; page renders). First
  registry page after usage.
- **Weather**: host fetches a weather API (Open-Meteo needs no key; lat/lon from config) and pushes
  a `weather` page: temp, condition glyph as a 20x20 creature-style pixel icon, next 3 hours.
- **Spotify controller on the touch screen**: host holds the Spotify Web API token (PKCE, refresh on
  the host, never on the board) and exposes play/pause, next, previous, volume ±; board shows a
  `music` page with track/artist and tap targets. **Blocked on touch working** (GT911 silent);
  BOOT can do play/pause meanwhile. Same "host decides" rule; the board never sees the token.
- New creatures tonight: `job done` (thumbs up + confetti), `echo love` (beating heart, floating
  hearts), `echo consult` (speech bubble dots → lines, nod, ping).

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
