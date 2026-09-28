// Mode animations for the ECHO creature (plans/creatures-and-modes.md, increment 2): what the device
// shows when the host says Claude has entered Opus, is running ultracode, or is splitting into agents.
// Registers into the bench (docs/bench/animations.html) and the export (tools/bench_to_json.js).
//
// Two families, each on its own palette (10 colours max, index 0 transparent). Indices 0..6 are
// ECHO_PALETTE unchanged in both, so echoBase, echoPing and echoGlitch are used as they are.
//   Opus: + flash eafffb, body one step brighter 1fa88c, visor mid 90f0dd (halfway to flash).
//     Brightening shifts the whole ramp one step: body 17836f to 1fa88c, feet 0f5a4c to 17836f.
//   Ultracode and agents: ECHO_PALETTE only. The creature shrinks to a 10 by 10 mini (2 by 2 block
//     downsample of echoBase) and echoes into three minis in a triangle: the middle one on top
//     (content cols 6..13, rows 0..8), left and right below it (cols 1..8 and 11..18, rows 10..18).
//     The top left corner stays clear for the firmware's agents count badge.
// Enter animations are played once by the host and end on the pose the matching work loop starts from.
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {G, rows, clone, set, BASE, blink, shut, ECHO_PALETTE, echoBase, echoPing, echoGlitch, bbox, eyeGeom, skinFrame, spinnerAt, STOCK} = L;

  const BODY = 1, EYE = 2, VISOR = 3, PING = 4, FEET = 5, FLASH = 7, BRIGHT = 8, VMID = 9;
  const ECHO7 = ECHO_PALETTE.slice(0, 7);                // the indices echoBase uses; guards the 10 colour cap
  const OPUS_PALETTE = [...ECHO7, '#eafffb', '#1fa88c', '#90f0dd'];
  const AGENTS_PALETTE = ECHO7.slice();
  const TIP = [1, 15];                                   // antenna tip in echoBase

  const blank = () => Array.from({length: G}, () => new Array(G).fill(0));
  const recolor = (g, map) => g.map(r => r.map(v => (map[v] !== undefined ? map[v] : v)));

  // ---------- Opus ----------
  // Halo: four single cells N, E, S, W, each with one clear cell between it and the silhouette.
  const HALO = [[2, 10], [10, 19], [18, 10], [10, 1]];
  function opus({tip = false, visor = VISOR, bright = false, halo = 0} = {}) {
    const b = clone(echoBase);
    set(b, TIP[0], TIP[1], tip ? PING : BODY);
    const map = {[VISOR]: visor};
    if (bright) { map[BODY] = BRIGHT; map[FEET] = BODY; }   // one lookup, so body and feet shift together
    const out = recolor(b, map);
    if (halo) for (const [r, c] of HALO) set(out, r, c, halo);
    return out;
  }

  // Enter: accelerating tip pings, visor charges to flash, body steps up, the halo flashes once, settle.
  const opusEnter = [{hold: 320, grid: opus()}];
  for (const [on, off] of [[110, 110], [90, 90], [70, 70], [60, 60]]) opusEnter.push({hold: on, grid: opus({tip: true})}, {hold: off, grid: opus()});
  opusEnter.push(
    {hold: 110, grid: opus({tip: true, visor: VMID})},
    {hold: 140, grid: opus({tip: true, visor: FLASH})},
    {hold: 180, grid: opus({tip: true, visor: FLASH, bright: true})},
    {hold: 120, grid: opus({tip: true, visor: FLASH, bright: true, halo: FLASH})},
    {hold: 100, grid: opus({tip: true, visor: FLASH, bright: true, halo: PING})},
    {hold: 140, grid: opus({visor: VMID, bright: true})},
    {hold: 1500, grid: opus({bright: true})},
  );

  // Work: 6 s loop (visor pulse every 2 s, tip ping every 3 s). The two periods must meet once per
  // cycle; they meet on the accent at the end, so every other event stands alone.
  const opusRest = () => opus({bright: true}), opusPulse = () => opus({bright: true, visor: VMID});
  const opusWork = [
    {hold: 1580, grid: opusRest()},
    {hold: 420, grid: opusPulse()},                                          // t 2.0 pulse
    {hold: 580, grid: opusRest()},
    {hold: 140, grid: opus({bright: true, tip: true})},                      // t 3.0 ping
    {hold: 860, grid: opusRest()},
    {hold: 420, grid: opusPulse()},                                          // t 4.0 pulse
    {hold: 1580, grid: opusRest()},
    {hold: 140, grid: opus({bright: true, visor: VMID, tip: true})},         // t 6.0 pulse and ping
    {hold: 280, grid: opusPulse()},
  ];

  // ---------- Minis ----------
  // Most common nonzero index among the cells, else 0. Ties go to the lowest index, which keeps the
  // mini's visor row symmetric (body, eye, visor, visor, eye, body).
  function mostCommon(cells) {
    const n = {};
    for (const v of cells) if (v) n[v] = (n[v] || 0) + 1;
    let best = 0, count = 0;
    for (const k of Object.keys(n).map(Number).sort((a, b) => a - b)) if (n[k] > count) { best = k; count = n[k]; }
    return best;
  }
  // 2 by 2 block downsample, 20 by 20 to 10 by 10.
  // Eyes win a tie: the family's eyes are one cell wide, so each 2 by 2 block holding an eye holds
  // two eye cells and two visor cells, and a plain majority picks the visor. The minis came out
  // blind that way (operator, 2026-09-28: "when the agent splits they are missing their eyes").
  function downsample2(g) {
    const H = G / 2, m = Array.from({length: H}, () => new Array(H).fill(0));
    for (let r = 0; r < H; r++) for (let c = 0; c < H; c++) {
      const block = [g[2 * r][2 * c], g[2 * r][2 * c + 1], g[2 * r + 1][2 * c], g[2 * r + 1][2 * c + 1]];
      m[r][c] = block.filter(v => v === EYE).length >= 2 ? EYE : mostCommon(block);
    }
    return m;
  }
  // The one frame between full size and the mini, 11 by 11: drop one row or column from each repeated
  // run of echoBase (antenna stalk, head, arms, lower body, legs, visor middle, hands) so the eyes, the
  // visor, the antenna and all four legs survive exactly. A window sampler erodes the eyes at this size.
  const KEEP_R = [1, 3, 4, 6, 7, 8, 10, 11, 13, 14, 16], KEEP_C = [4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16];
  const shrinkStep = g => KEEP_R.map(r => KEEP_C.map(c => g[r][c]));
  // Blit the nonzero cells of a small grid with its top left at (r0, c0), clipped to the lattice.
  // paint forces one colour: a ghost, the echo of a mini before it becomes solid.
  function place(dst, src, r0, c0, paint = 0) {
    for (let r = 0; r < src.length; r++) for (let c = 0; c < src[r].length; c++) if (src[r][c]) set(dst, r0 + r, c0 + c, paint || src[r][c]);
    return dst;
  }

  const MINI = downsample2(echoBase);
  const M_TIP = [0, 7], M_CHEST = [5, 5];                // chest: the big chest centre (10, 10) halved
  function mini({tip = false, chest = false} = {}) {
    const m = clone(MINI);
    m[M_TIP[0]][M_TIP[1]] = tip ? PING : BODY;
    m[M_CHEST[0]][M_CHEST[1]] = chest ? PING : BODY;
    return m;
  }
  const CENTRE = [5, 5];
  const SPOT = {top: [0, 5], left: [10, 0], right: [10, 10]};
  const CLOCKWISE = ['top', 'right', 'left'];

  const shrunk = () => place(blank(), shrinkStep(echoPing(false)), 4, 5);   // centre (9, 10), between full and mini
  const centred = () => place(blank(), mini(), ...CENTRE);
  // Echo trail: two ghosts two cells either side, behind the centred mini, the frame before it splits.
  const trail = () => { const g = blank(); place(g, MINI, CENTRE[0], CENTRE[1] - 2, PING); place(g, MINI, CENTRE[0], CENTRE[1] + 2, PING); return place(g, mini(), ...CENTRE); };
  const echoes = () => { const g = blank(); place(g, MINI, ...SPOT.left, PING); place(g, MINI, ...SPOT.right, PING); return place(g, mini(), ...SPOT.top); };
  const trio = ({chest = null, ping = null} = {}) => {
    const g = blank();
    for (const k of CLOCKWISE) place(g, mini({tip: ping === k, chest: chest === k}), ...SPOT[k]);
    return g;
  };

  // ---------- Ultracode ----------
  // The third glitch also tears the lower body one cell left, so the last one reads as coming apart.
  const tear = () => {
    const b = echoGlitch();
    for (const r of [11, 12, 13]) { const row = b[r].slice(); for (let c = 0; c < G; c++) b[r][c] = c + 1 < G ? row[c + 1] : 0; }
    return b;
  };
  const ultraEnter = [
    {hold: 300, grid: echoPing(false)},
    {hold: 60, grid: echoGlitch(), glitch: true},
    {hold: 160, grid: echoPing(false)},
    {hold: 60, grid: echoGlitch(), glitch: true},
    {hold: 320, grid: echoPing(false)},
    {hold: 60, grid: tear(), glitch: true},
    {hold: 480, grid: echoPing(false)},
    {hold: 90, grid: shrunk()},
    {hold: 280, grid: centred()},
    {hold: 100, grid: trail()},
    {hold: 110, grid: echoes()},
    {hold: 1500, grid: trio()},
  ];

  // Work: one chest light passes clockwise (top, right, left), 1.2 s on each; every mini pings its
  // antenna 0.6 s after its own light goes out, so the pings are staggered by 1.2 s as well.
  const ultraWork = [];
  CLOCKWISE.forEach((k, i) => {
    const before = CLOCKWISE[(i + 2) % 3];
    ultraWork.push({hold: 600, grid: trio({chest: k})}, {hold: 140, grid: trio({chest: k, ping: before})}, {hold: 460, grid: trio({chest: k})});
  });

  // ---------- Agents ----------
  const agentsSplit = [
    {hold: 1000, grid: echoPing(false)},
    {hold: 60, grid: echoGlitch(), glitch: true},
    {hold: 80, grid: shrunk()},
    {hold: 160, grid: centred()},
    {hold: 90, grid: trail()},
    {hold: 90, grid: echoes()},
    {hold: 1100, grid: trio()},
    {hold: 90, grid: echoes()},
    {hold: 90, grid: trail()},
    {hold: 160, grid: centred()},
    {hold: 80, grid: shrunk()},
  ];
  // Frame 0 here is the trio, so no glitch frame (the bench's glitch toggle shows frame 0 instead);
  // the creature announces it is whole again with one antenna ping.
  const agentsJoin = [
    {hold: 1000, grid: trio()},
    {hold: 90, grid: echoes()},
    {hold: 90, grid: trail()},
    {hold: 160, grid: centred()},
    {hold: 80, grid: shrunk()},
    {hold: 600, grid: echoPing(false)},
    {hold: 140, grid: echoPing(true)},
    {hold: 840, grid: echoPing(false)},
  ];

  L.register([
    {name: 'ECHO · opus enter', key: 'mode_opus_enter', fwname: 'opus enter', category: 'Mode',
      intent: 'Played once when Opus takes over: fast antenna pings, the visor charges to white, the body steps up one shade and a halo of four cells flashes, then it settles on opus work within 3.3 s; judge whether it reads as powering up rather than as an alarm.',
      palette: OPUS_PALETTE, frames: opusEnter},
    {name: 'ECHO · opus work', key: 'mode_opus_work', fwname: 'opus work', category: 'Mode',
      intent: 'Opus at rest, the dominant state: body one shade brighter, a slow visor pulse every 2 s and an antenna ping every 3 s on a 6 s loop; judge whether the brighter body alone says Opus from across the desk.',
      palette: OPUS_PALETTE, frames: opusWork},
    {name: 'ECHO · ultracode enter', key: 'mode_ultracode_enter', fwname: 'ultracode enter', category: 'Mode',
      intent: 'Played once when ultracode starts: three glitch splits at widening gaps, the last one tearing, then the creature shrinks to a 10 by 10 mini and echoes into three; judge whether the minis still read as the same creature.',
      palette: AGENTS_PALETTE, frames: ultraEnter},
    {name: 'ECHO · ultracode work', key: 'mode_ultracode_work', fwname: 'ultracode work', category: 'Mode',
      intent: 'Ultracode at rest, the dominant state: three minis, one chest light passing clockwise 1.2 s at a time and each antenna pinging once per 3.6 s; judge whether it reads as a team at work rather than a marquee.',
      palette: AGENTS_PALETTE, frames: ultraWork},
    {name: 'ECHO · agents split', key: 'mode_agents_split', fwname: 'agents split', category: 'Mode',
      intent: 'Host triggered moment when agents start: one glitch, the creature shrinks, echoes into three minis, holds 1.1 s and folds back, a 3 s loop; judge whether the split reads in a single viewing.',
      palette: AGENTS_PALETTE, frames: agentsSplit},
    {name: 'ECHO · agents join', key: 'mode_agents_join', fwname: 'agents join', category: 'Mode',
      intent: 'The reverse, for when agents finish: the side minis fade to echoes, all three fold into one, it grows back and pings once, a 3 s loop; judge whether it reads as the team coming home.',
      palette: AGENTS_PALETTE, frames: agentsJoin},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
