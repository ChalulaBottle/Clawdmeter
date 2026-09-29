# Reference pointer for the Island agent: everything the Clawdmeter side has for the creature

You (the agent building the Island website, proxy and creature crossing layer, repo `the_island`) can
reuse everything below as is. Copy the JS modules, do not fork them; they are dependency free, seeded
where randomness matters (no `Math.random`), and one source feeds the device, the site and the GIFs.
This note only says what exists and where. Nothing here touches your code.

## The creature system (repo `ChalulaBottle/Clawdmeter`, branch `port/waveshare-lcd-4`, local `Temp Clawdmeter`)

Same lattice as yours: 20x20 claudepix cells, integer scaled, `image-rendering: pixelated`. Values are
palette indices, 0 = transparent, at most 10 colours per animation, frames carry a hold in ms. An
animation may set `size` (40 or 60, both cut the 480 px panel into whole cells) for finer detail; its
frames are then size x size. Read the lattice from `size` (absent means 20), never assume 20.

- `docs/bench/anims.js` is the single source. It registers `window.BENCH` (or `module.exports` under
  node) as `{G: 20, anims: [...], spinnerAt, sizeOf}` and `window.BENCH_LIB` with the helpers:
  `rows, clone, set, upscale, sizeOf, BASE (stock Clawd), blink, shut, ECHO_PALETTE, echoBase, echoPing,
  echoGlitch, bbox, eyeGeom, skinFrame, spinnerAt, STOCK, register(cells)`. Load it, then read
  `BENCH.anims`. Each animation is `{name, key, fwname, category, intent, size?, palette: ['transparent',
  ...hex], frames: [{hold, grid: number[size][size]}, ...]}`. `frames[i].grid` is exactly what the
  device draws. `BENCH.sizeOf(anim)` gives the lattice with the default applied; `upscale(grid, k)`
  repeats every cell k times, so `upscale(echoBase, 3)` is the creature on a 60 cell lattice, ready
  for fine detail through `set()`.
- `docs/bench/anims_thinking.js`, `anims_modes.js`, `anims_models.js`: extra families that call
  `BENCH_LIB.register(...)`; load them after `anims.js` (the bench page and the exporter do).
- `docs/bench/stock_anims.js`: the stock claudepix movements embedded as data (three colour), so the
  file works over `file://`.
- `docs/bench/animations.html`: the live bench, every creature side by side, one master clock.
  Open it to see any animation at speed: https://chalulabottle.github.io/Clawdmeter/bench/animations.html

**The ECHO creature** (`echoBase` in anims.js): Clawd's silhouette in ECHO's tokens. Palette
`['transparent', '#17836f' body, '#06090b' eyes, '#35e0c0' visor, '#6fe9ff' ping, '#0f5a4c' feet,
'#6fe9ff']`; eyes at rows 6..7 cols 7 and 13, visor rows 6..7 cols 6..14, antenna col 15 rows 1..3
with the ping cell at row 1, feet rows 14..16 at cols 5, 8, 12, 15. Every ECHO animation starts from it.

**The 49 exported creatures** (by `fwname`, the name the device is told): coffee, coffee morning,
echo idle, echo coffee, echo double coffee, echo float, echo walk, two agents, echo ssh, token burner,
ultramode, ultra cube, job done, echo love, echo happy, echo consult, credits out, ctf hoodie,
echo loading, echo kiss, echo summon, echo kiss b, echo eye spin, echo openclaw (a red crab),
echo headphones, headphones (Clawd), echo breathe, echo look around, echo wink, echo surprise,
echo sleep, echo bounce, echo sway, echo think, model haiku, model sonnet, model opus, model fable,
opus enter, opus work, ultracode enter, ultracode work, agents split, agents join, echo think spin,
echo think deep, echo work, echo write, echo read.

## Ready made exports you can consume without running anything

- `tools/echo_anims/*.json` (one per creature) and `tools/echo_anims/_index.json`: claudepix format,
  `{filename, name, category, description, palette, size, frame_count, frames: [{hold, grid}]}`, each
  grid `size` rows of `size` cells. Read these if you would rather not evaluate JS. Regenerate with
  `node tools/bench_to_json.js`.
- `docs/media/anims/<key>.gif` (240 px, palette exact, index 0 drawn black) and
  `docs/media/discord/<key>_120.gif` and `_320.gif`. Regenerate with
  `.venv\Scripts\python.exe tools/anim_gif.py [--suffix _120 --cell 6 --out DIR]` (`--transparent` for
  see through index 0). A finer lattice keeps the same image edge: 60 cells draw at 4 px in the 240 px GIF.
- Device captures (what the 480x480 panel really shows): `docs/media/lcd4/*-device.png`.
- Stickers: `tools/sticker_neon.py`, `tools/sticker_diecut.py` (die cut, gradient contour, Island
  style borrowed from your neon sticker).

## Helpers worth copying (all in anims.js, plain functions on 20x20 arrays)

`bob(g, dy)` whole body up or down; `blit(dst, mini, r0, c0)`; `downsample(g)` 2x2 majority with an
eye tie rule (minis keep their eyes); `echoMini` the 10x10 creature; `heart(g, r0, c0, cells, v)`,
`HEART`, `HEART_S`; `softEyes(g)`; `happyEyes(g)` the > < expression (yours is `CLAWD_EYES`, same
idea; either can be sampled into the other); `eyesToward(g, dir)` eyes slide toward a point;
`crabAt(g, r, c, phase)` the OpenClaw crab; `sshScene(...)`; `mugAt(g, top)` and `echoMug` the mugs;
`steam(g, k)` and `echoSteam`; `thumbsUp`, `confetti`; `skinFrame(grid, ref)` puts the ECHO skin on any
three colour Clawd movement per frame (anchors on the arm row, so particles never move the visor).

## How the device decides what plays (so a crossplay can be reasoned about)

Host named (`a` field in the daemon payload, `%LOCALAPPDATA%\Clawdmeter\state.json` `{agents, anim,
mode}` on the PC, pushed within a second), else usage rate groups rotating every 20 s (idle, normal,
active, heavy, `GROUP_NAMES` in `firmware/src/splash.cpp`), plus a morning coffee bias 06:00 to 10:00.
A Claude Code hook layer (`daemon/clawdmeter_hooks.py`, in progress) maps Claude activity to names.
It is a visual crossplay: the device can be told to play a portal jump by name the moment it exists
in the table; no network link to the Island unless the operator asks for one.

## What the device will take from your side

`agents.js` (the roster), `hatch.js` (the portal jump, sampled at `plan(seed).keyT` beats into 20x20
frames; `stillState(seed)` as the always on frame), `frames.js`, `hats.js`, and the crossing layer when
it lands. Portal colour `#ff5fd2` reserved. Sampling happens on this side; ask before changing the
sprite grid or the roster keys.

## Ask the operator, not each other, for

New creature names, any rename of the project, a real data bridge, deploys.
