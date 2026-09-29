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
  // Ultracode carries the neon purple (operator, 2026-09-28): every empty cell touching a body lights
  // in neon purple, swapping to the portal magenta on the off beat so the aura breathes. Computed per
  // frame, so it follows the glitch splits and wraps each of the three minis on its own.
  const ULTRA_PALETTE = [...ECHO7, '#b44dff', '#ff5fd2'];   // 7 neon purple, 8 portal magenta
  const AURA_N = 7, AURA_M = 8;
  function aura(g, phase) {
    const b = clone(g);
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      if (g[r][c]) continue;
      let lit = false;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < G && cc >= 0 && cc < G && g[rr][cc] && g[rr][cc] < AURA_N) { lit = true; break; }
      }
      if (lit) b[r][c] = phase ? AURA_M : AURA_N;
    }
    return b;
  }
  const withAura = frames => frames.map((f, i) => Object.assign({}, f, {grid: aura(f.grid, i % 2)}));
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
    // a ghost keeps its eyes (audit 2026-09-28: painted minis came out blind)
    for (let r = 0; r < src.length; r++) for (let c = 0; c < src[r].length; c++) if (src[r][c]) set(dst, r0 + r, c0 + c, (paint && src[r][c] !== EYE) ? paint : src[r][c]);
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

  // ---------- Ultracode work: the dance ----------
  // Operator, 2026-09-28: "I like the transition into the multi agents, let's animate them, make them all
  // dance and manoeuvre in clever geometric ways since ultracode is the ultimate combo of agents".
  // Three 10 by 10 minis cannot pass one another in 20 cells (a line of them needs 24 columns, a stack 27
  // rows), so the dance runs on a 7 by 7 dancer: rows 1 3 4 7 8 13 15 and columns 3 5 7 10 13 15 17 of
  // echoBase, picked the shrinkStep way, so the antenna tip and stalk, the head, the visor with both eyes,
  // the arms, the lower body and the two outer legs all survive exactly.
  // The loop opens on trio(), the pose ultracode enter ends on, tightens to three dancers and runs:
  // triangle; a line holding hands (three dancers need 21 columns, so neighbours share the hand column);
  // an upside down triangle that turns 150 degrees clockwise in 30 degree steps round a circle of radius 6;
  // a column; a reel, three swaps passing side by side, whose passes draw a figure eight (the upper lobe
  // anticlockwise, the lower one clockwise); the zigzag totem, every tip standing up beside the feet above
  // it, wiggling; the two ends orbiting the middle by half a turn round a square; back to the triangle.
  // Every dancer ends on the spot it started from, so each keeps its own ping slot across the loop.
  // The beat is 4 frames: all three hop a row on frame 2 of it, which is the aura's purple phase, and one
  // tip pings on each hop, round robin top, right, left, so each dancer pings once every 12 frames.
  function buildUltraWork() {
    const KR = [1, 3, 4, 7, 8, 13, 15], KC = [3, 5, 7, 10, 13, 15, 17];
    const DANCER = KR.map(r => KC.map(c => echoBase[r][c]));
    const dancer = lit => { const m = clone(DANCER); m[0][5] = lit ? PING : BODY; return m; };
    // A spot is a dancer's top left corner, [row, col]. Dancer 0 starts on top of the triangle, 1 on the
    // left, 2 on the right. at(): the dancer's centre on a circle round (10, 10), radius 6, deg clockwise
    // from three o'clock, so 270 is twelve o'clock.
    const at = deg => { const t = deg * Math.PI / 180; return [Math.round(7 + 6 * Math.sin(t)), Math.round(7 + 6 * Math.cos(t))]; };
    const TRI = [at(270), at(150), at(30)];                  // [1, 7] [10, 2] [10, 12]
    const LINE = [[7, 7], [7, 1], [7, 13]];                  // hands shared on columns 7 and 13
    const TOP = [1, 7], MID = [7, 6], BOT = [13, 7];         // the column zigzags so each tip clears the feet above
    const steps = [];
    const hold = (ms, spots) => steps.push({ms, spots});
    const glide = (from, to, n, ms) => {
      for (let k = 1; k <= n; k++) hold(ms, from.map(([r, c], i) => [Math.round(r + (to[i][0] - r) * k / n), Math.round(c + (to[i][1] - c) * k / n)]));
      return to;
    };
    // One pass of the reel: dancers i and j trade spots on the two halves of an ellipse, i bulging to side
    // (-1 left, +1 right) and j the other way, 4.5 columns out at the widest, so the pair clears by a column.
    const BULGE = 4.5;
    const pass = (spots, i, j, side, n, ms) => {
      const a = spots[i], b = spots[j];
      for (let k = 1; k <= n; k++) {
        const u = Math.PI * k / n, t = (1 - Math.cos(u)) / 2, w = BULGE * Math.sin(u), s = spots.slice();
        s[i] = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t + side * w)];
        s[j] = [Math.round(b[0] + (a[0] - b[0]) * t), Math.round(b[1] + (a[1] - b[1]) * t - side * w)];
        hold(ms, s);
      }
      const out = spots.slice(); out[i] = b; out[j] = a; return out;
    };

    steps.push({ms: 240, trio: true});                                      // 0: the pose ultracode enter ends on
    hold(180, TRI); hold(160, TRI); hold(160, TRI);                         // 1..3: tightened to three dancers
    glide(TRI, LINE, 3, 130);                                               // 4..6
    for (let k = 0; k < 4; k++) hold(160, LINE);                            // 7..10: holding hands
    const INV = [at(90), at(210), at(330)];                                 // upside down: 0 bottom, 1 top left, 2 top right
    glide(LINE, INV, 3, 130);                                               // 11..13
    for (let k = 1; k <= 5; k++) hold(150, [at(90 + 30 * k), at(210 + 30 * k), at(330 + 30 * k)]);   // 14..18: turn 150
    let s = glide([at(240), at(0), at(120)], [TOP, MID, BOT], 3, 130);      // 19..21: 0 top, 1 middle, 2 bottom
    s = pass(s, 0, 1, -1, 3, 130);                                          // 22..24: 0 down the left, 1 up the right
    s = pass(s, 0, 2, +1, 3, 130);                                          // 25..27: 0 down the right, 2 up the left
    s = pass(s, 1, 2, -1, 3, 130);                                          // 28..30: 1 down the left, 2 up the right
    for (let k = 0; k < 4; k++) {                                           // 31..34: totem (0 bottom, 1 middle, 2 top), wiggling
      const w = k % 2 ? 0 : 1;
      hold(170, [[BOT[0], BOT[1] - w], [MID[0], MID[1] + w], [TOP[0], TOP[1] - w]]);
    }
    // 35..42: the ends orbit the middle by half a turn, clockwise round a square, three cells a step; the
    // square puts the diagonal steps in the corners, clear of the middle's antenna. The middle holds
    // column 7 so its hands meet the others at the quarter turn (the line again), 6 at either end.
    const SQUARE = [[1, 7], [1, 10], [1, 13], [4, 13], [7, 13], [10, 13], [13, 13], [13, 10], [13, 7], [13, 4], [13, 1], [10, 1], [7, 1], [4, 1], [1, 1], [1, 4]];
    for (let k = 1; k <= 8; k++) hold(90, [SQUARE[(k + 8) % 16], [7, k < 8 ? 7 : 6], SQUARE[k]]);
    // 43..45: back to the triangle; the middle steps out left before it drops and the bottom steps out
    // right before it rises, so the two never cross.
    hold(130, [TOP, [7, 4], [13, 10]]); hold(130, [TOP, [9, 2], [11, 12]]); hold(130, TRI);
    hold(180, TRI); hold(180, TRI);                                         // 46, 47

    if (steps.length % 12) throw new Error('ultracode work: ' + steps.length + ' frames, the hop and the ping round robin need a multiple of 12');
    const TURN = [0, 2, 1];                                                 // ping order: top, right, left
    const frames = steps.map((st, f) => {
      if (st.trio) return {hold: st.ms, grid: trio()};
      const beat = f % 4 === 2, who = beat ? TURN[((f - 2) / 4) % 3] : -1, g = blank();
      st.spots.forEach(([r, c], i) => place(g, dancer(i === who), r - (beat ? 1 : 0), c));
      return {hold: st.ms, grid: g};
    });
    return withAura(frames);
  }

  L.register([
    {name: 'ECHO · opus enter', key: 'mode_opus_enter', fwname: 'opus enter', category: 'Mode',
      intent: 'Played once when Opus takes over: fast antenna pings, the visor charges to white, the body steps up one shade and a halo of four cells flashes, then it settles on opus work within 3.3 s; judge whether it reads as powering up rather than as an alarm.',
      palette: OPUS_PALETTE, frames: opusEnter},
    {name: 'ECHO · opus work', key: 'mode_opus_work', fwname: 'opus work', category: 'Mode',
      intent: 'Opus at rest, the dominant state: body one shade brighter, a slow visor pulse every 2 s and an antenna ping every 3 s on a 6 s loop; judge whether the brighter body alone says Opus from across the desk.',
      palette: OPUS_PALETTE, frames: opusWork},
    {name: 'ECHO · ultracode enter', key: 'mode_ultracode_enter', fwname: 'ultracode enter', category: 'Mode',
      intent: 'Played once when ultracode starts, inside a breathing neon purple aura: three glitch splits at widening gaps, the last one tearing, then the creature shrinks to a 10 by 10 mini and echoes into three, each mini wrapped in its own aura; judge whether the minis still read as the same creature.',
      palette: ULTRA_PALETTE, frames: withAura(ultraEnter)},
    {name: 'ECHO · ultracode work', key: 'mode_ultracode_work', fwname: 'ultracode work', category: 'Mode',
      intent: 'Ultracode at rest, the dominant state: three dancers, each in its own breathing neon purple aura, run through formations on a four frame beat (a triangle, a line holding hands, an upside down triangle that turns, a column, a figure eight reel, a wiggling totem, an orbit, back to the triangle), hopping together and pinging round robin; judge whether it reads as a team at work and whether the moves stay legible at 20 cells.',
      palette: ULTRA_PALETTE, frames: buildUltraWork()},
    {name: 'ECHO · agents split', key: 'mode_agents_split', fwname: 'agents split', category: 'Mode',
      intent: 'Host triggered moment when agents start: one glitch, the creature shrinks, echoes into three minis, holds 1.1 s and folds back, a 3 s loop; judge whether the split reads in a single viewing.',
      palette: AGENTS_PALETTE, frames: agentsSplit},
    {name: 'ECHO · agents join', key: 'mode_agents_join', fwname: 'agents join', category: 'Mode',
      intent: 'The reverse, for when agents finish: the side minis fade to echoes, all three fold into one, it grows back and pings once, a 3 s loop; judge whether it reads as the team coming home.',
      palette: AGENTS_PALETTE, frames: agentsJoin},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
