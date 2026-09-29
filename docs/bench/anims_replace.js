// ECHO replacements for the stock Clawd set (operator, 2026-09-28: "replace all of those with
// variations of the ECHO creature, one by one, the code has to be different from the original").
// Each animation here is drawn from scratch on the ECHO creature, not skinned or traced from the
// claudepix frames, and carries `replaces`: the stock name it takes the place of. The exporter ships
// it under its own fwname; the stock entry leaves the firmware table and the rotation lists when the
// replacement lands (tools/add_echo_anims.py reads `replaces`).
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {G, clone, set, ECHO_PALETTE, echoBase} = L;
  const ECHO7 = ECHO_PALETTE.slice(0, 7);
  const empty = () => Array.from({length: G}, () => new Array(G).fill(0));

  // ---------- 1. echo dj (replaces "dance bounce dj") ----------
  // The creature behind a deck: two platters with a marker spinning round each, the right hand drops
  // to scratch on every fourth beat, an equaliser pumps under the deck, the body bobs on the beat and
  // the eyes go > < on the drop. Everything here is geometry on the ECHO base, nothing from claudepix.
  const DJ_PALETTE = [...ECHO7, '#1a2124', '#ff5fd2', '#eafffb'];   // 7 deck, 8 magenta light, 9 flash
  const DECK = 7, LIGHT = 8, FLASH = 9, BODY = 1, EYE = 2, VISOR = 3, PING = 4;
  const RING = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]];   // 3x3 platter rim, clockwise
  function dj(beat, {drop = false, scratch = false} = {}) {
    const up = beat % 2 === 1;
    const b = empty();
    // the creature, one row higher on the off beat; the deck in front hides its legs either way
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const v = echoBase[r][c]; if (!v) continue;
      set(b, r - (up ? 1 : 0), c, v);
    }
    set(b, 1 - (up ? 1 : 0), 15, beat % 4 === 0 ? PING : BODY);             // antenna ping on the one
    // headset: a white band over the head (the antenna stands beside it) onto magenta cups over the ears
    const dy = up ? -1 : 0;
    for (let c = 5; c <= 14; c++) set(b, 3 + dy, c, FLASH);
    set(b, 4 + dy, 4, FLASH); set(b, 4 + dy, 16, FLASH);
    for (let r = 5; r <= 8; r++) for (const c of [3, 4, 16, 17]) set(b, r + dy, c, LIGHT);
    if (drop) {                                                             // > < eyes on the drop
      const top = 6 - (up ? 1 : 0);
      for (const c of [7, 13]) { set(b, top, c, VISOR); set(b, top + 1, c, VISOR); }
      set(b, top, 6, EYE); set(b, top + 1, 7, EYE); set(b, top, 8, EYE);
      set(b, top, 12, EYE); set(b, top + 1, 13, EYE); set(b, top, 14, EYE);
    }
    // the deck: rows 12..16, cols 1..18, with two platters and a light strip
    for (let r = 12; r <= 16; r++) for (let c = 1; c <= 18; c++) set(b, r, c, DECK);
    for (const c0 of [3, 14]) {
      for (const [dr, dc] of RING) set(b, 12 + dr, c0 + dc, BODY);
      set(b, 13, c0 + 1, VISOR);                                            // the label
      const [mr, mc] = RING[(beat * (c0 === 3 ? 1 : 3)) % RING.length];     // left spins slow, right fast
      set(b, 12 + mr, c0 + mc, FLASH);
    }
    for (let c = 7; c <= 12; c++) set(b, 15, c, (c + beat) % 3 === 0 ? LIGHT : DECK);   // chasing light
    if (scratch) { set(b, 10, 17, BODY); set(b, 11, 17, BODY); set(b, 12, 16, BODY); }   // hand down on the right platter
    // the equaliser under the deck: six bars, heights from the beat
    for (let i = 0; i < 6; i++) {
      const h = 1 + ((beat * 7 + i * 5) % 3);
      for (let k = 0; k < h; k++) set(b, 19 - k, 7 + i, k === h - 1 ? LIGHT : VISOR);
    }
    // lasers: beams from the two top corners sweep across the room behind the creature (they only light
    // empty cells, so they pass behind it). One pair before the drop, crossing pairs and a strobe on it.
    const beam = (r0, c0, r1, c1, v) => {
      const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
      for (let k = 0; k <= n; k++) {
        const r = Math.round(r0 + (r1 - r0) * k / n), c = Math.round(c0 + (c1 - c0) * k / n);
        if (r >= 0 && r < G && c >= 0 && c < G && b[r][c] === 0) b[r][c] = v;
      }
    };
    const sweep = [2, 5, 8, 11, 14, 17, 14, 11, 8, 5][beat % 10];
    if (beat % 2 === 0 || drop) {
      beam(0, 0, 11, sweep, PING);
      beam(0, 19, 11, 19 - sweep, LIGHT);
    }
    if (drop) {
      beam(0, 0, 11, 19 - sweep, LIGHT);
      beam(0, 19, 11, sweep, PING);
      if (beat % 2) for (let c = 0; c < G; c++) if (b[0][c] === 0) b[0][c] = FLASH;   // the strobe
    }
    return b;
  }
  const echoDj = {
    name: 'ECHO · dj', key: 'echo_dj', fwname: 'echo dj', category: 'Active', replaces: 'dance bounce dj',
    intent: 'Replaces the stock bounce DJ with our own: the creature in a headset behind a deck, two platters spinning at different speeds, a scratch every fourth beat, an equaliser under the deck, lasers sweeping from the corners behind it, a bob on every beat, then on the drop crossing lasers, a strobe and > < eyes; judge the tempo and whether the lasers read as behind the creature.',
    palette: DJ_PALETTE,
    frames: [],
  };
  for (let beat = 0; beat < 32; beat++) {
    const drop = beat >= 16 && beat < 24;
    echoDj.frames.push({hold: 130, grid: dj(beat, {drop, scratch: beat % 4 === 3})});
  }

  // ---------- the everyday set, drawn from scratch ----------
  // Shared tools for the replacements below. Every one of them starts from echoBase and moves its own
  // cells; nothing is read from the claudepix frames.
  const RP = [...ECHO7, '#eafffb', '#ff5fd2'];            // 7 flash, 8 magenta
  const W = 7, MAG = 8;
  const shift = (g, dy, dx = 0) => { const b = empty(); for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g[r][c]) set(b, r + dy, c + dx, g[r][c]); return b; };
  // Rows 0..13 (antenna, head, arms, body) move, rows 14..19 (the legs) stay planted.
  const torso = (g, dy, dx = 0) => { const b = empty(); for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) { const v = g[r][c]; if (!v) continue; if (r <= 13) set(b, r + dy, c + dx, v); else set(b, r, c, v); } return b; };
  // Eyes: clear both 1x2 eyes to visor, then paint the given cells.
  const eyes = (g, cells) => { const b = clone(g); for (const r of [6, 7]) for (const c of [7, 13]) set(b, r, c, VISOR); for (const [r, c] of cells) set(b, r, c, EYE); return b; };
  const OPEN = [[6, 7], [7, 7], [6, 13], [7, 13]];
  const HALF = [[7, 7], [7, 13]];
  const LINE = [[7, 6], [7, 7], [7, 8], [7, 12], [7, 13], [7, 14]];
  const at = (dc, dr = 0) => [[6 + dr, 7 + dc], [7 + dr, 7 + dc], [6 + dr, 13 + dc], [7 + dr, 13 + dc]].filter(([r]) => r >= 6 && r <= 7);
  const tip = (g, v) => { const b = clone(g); set(b, 1, 15, v); return b; };
  const B0 = echoBase;
  const F = (hold, grid) => ({hold, grid});

  // echo blink (replaces "idle blink"): long holds, a single blink, a slow double blink, a glance down.
  const echoBlink = {
    name: 'ECHO · blink', key: 'echo_blink', fwname: 'echo blink', category: 'Idle', replaces: 'idle blink',
    intent: 'Replaces the stock idle blink: long rests, a single blink, a slow double blink, a glance down between them; judge whether the rhythm feels alive without fidgeting.',
    palette: RP,
    frames: [
      F(2200, B0), F(60, eyes(B0, HALF)), F(90, eyes(B0, LINE)), F(60, eyes(B0, HALF)),
      F(1800, B0), F(700, eyes(B0, [[7, 7], [7, 13]])), F(900, B0),
      F(70, eyes(B0, HALF)), F(110, eyes(B0, LINE)), F(90, B0), F(70, eyes(B0, HALF)), F(110, eyes(B0, LINE)), F(70, eyes(B0, HALF)),
      F(1400, tip(B0, PING)),
    ],
  };

  // echo breath (replaces "idle breathe"): the head and arms rise one row on the in breath while the
  // legs stay put, the visor brightens at the top, then it all settles.
  const inhale = eyes(torso(B0, -1), OPEN.map(([r, c]) => [r - 1, c]));
  const echoBreath = {
    name: 'ECHO · breath', key: 'echo_breath', fwname: 'echo breath', category: 'Idle', replaces: 'idle breathe',
    intent: 'Replaces the stock idle breathe: the torso rises a row on the in breath over planted legs and the visor lifts to ping at the top, then settles; judge the pace.',
    palette: RP,
    frames: [
      F(1400, B0), F(500, inhale),
      F(700, (() => { const b = clone(inhale); for (let c = 6; c <= 14; c++) if (b[5][c] === VISOR) b[5][c] = PING; return b; })()),
      F(500, inhale), F(1600, B0),
    ],
  };
  // (inhale keeps its eyes: torso() moved them up with the head, eyes() above is a no-op on the old rows)

  // echo glance (replaces "idle look around"): the eyes slide left, back, right, up, down; the antenna
  // follows with a ping when the eyes stop on something.
  const echoGlance = {
    name: 'ECHO · glance', key: 'echo_glance', fwname: 'echo glance', category: 'Idle', replaces: 'idle look around',
    intent: 'Replaces the stock look around: the eyes slide left and hold, back, right and hold, then a look down and a ping as they settle; judge whether the eyes alone carry it.',
    palette: RP,
    frames: [
      F(1200, B0), F(120, eyes(B0, at(-1))), F(900, eyes(B0, at(-1))), F(160, B0), F(120, eyes(B0, at(1))), F(900, eyes(B0, at(1))),
      F(160, B0), F(700, eyes(B0, [[7, 7], [7, 13]])), F(140, tip(B0, PING)), F(1100, B0),
    ],
  };

  // echo startle (replaces "expression surprise"): a jump of two rows, the eyes go wide (2x2), an
  // exclamation mark over the antenna, a flash on the tip, then a wobbly landing.
  const wide = g => eyes(g, [[6, 7], [7, 7], [6, 8], [7, 8], [6, 12], [7, 12], [6, 13], [7, 13]]);
  const bang = g => { const b = clone(g); for (const r of [0, 1, 3]) if (b[r][11] === 0) set(b, r, 11, W); return b; };
  const echoStartle = {
    name: 'ECHO · startle', key: 'echo_startle', fwname: 'echo startle', category: 'Active', replaces: 'expression surprise',
    intent: 'Replaces the stock surprise: a two row jump with wide 2x2 eyes, an exclamation mark and a flash on the antenna, then a wobbly landing and a blink; judge the snap.',
    palette: RP,
    frames: [
      F(1400, B0), F(80, shift(wide(B0), -1)), F(420, bang(tip(shift(wide(B0), -2), W))), F(90, shift(wide(B0), -1)),
      F(110, torso(wide(B0), 0, -1)), F(110, torso(wide(B0), 0, 1)), F(500, wide(B0)),
      F(70, eyes(B0, HALF)), F(1200, B0),
    ],
  };

  // echo doze (replaces "expression sleep"): the eyes close to lines, the head sinks a row, small z's
  // rise from the antenna one at a time, a snore bob, a slow wake blink at the end.
  const z = (g, k) => { const b = clone(g); const pts = [[3, 17], [2, 18], [1, 19]]; pts.slice(0, k).forEach(([r, c], i) => set(b, r - (k - 1 - i), c, W)); return b; };
  const sleepy = torso(eyes(B0, LINE), 1);
  const echoDoze = {
    name: 'ECHO · doze', key: 'echo_doze', fwname: 'echo doze', category: 'Idle', replaces: 'expression sleep',
    intent: 'Replaces the stock sleep: eyes close to lines, the torso sinks a row onto the legs, z cells rise off the antenna one by one with a slow snore bob, then a drowsy half open and back under; judge whether it reads as asleep.',
    palette: RP,
    frames: [
      F(900, eyes(B0, HALF)), F(1000, sleepy),
      F(700, z(sleepy, 1)), F(700, z(torso(eyes(B0, LINE), 0), 2)), F(700, z(sleepy, 3)), F(700, z(torso(eyes(B0, LINE), 0), 2)), F(700, z(sleepy, 1)),
      F(600, torso(eyes(B0, HALF), 1)), F(1200, sleepy),
    ],
  };

  // echo hop (replaces "dance bounce"): hops on the beat with both arms up on the air frames.
  const armsUp = g => { const b = clone(g); for (let r = 7; r <= 10; r++) { set(b, r, 3, 0); set(b, r, 17, 0); } for (let r = 3; r <= 6; r++) { set(b, r, 3, BODY); set(b, r, 17, BODY); } set(b, 7, 4, BODY); set(b, 7, 16, BODY); return b; };
  const echoHop = {
    name: 'ECHO · hop', key: 'echo_hop', fwname: 'echo hop', category: 'Active', replaces: 'dance bounce',
    intent: 'Replaces the stock dance bounce: hops on the beat, arms up on every air frame, happy squint on the fourth hop; judge the bounce.',
    palette: RP,
    frames: [0, 1, 2, 3, 4, 5, 6, 7].flatMap(i => [
      F(150, shift(armsUp(i === 3 || i === 7 ? eyes(B0, [[7, 7], [7, 13]]) : B0), -1)),
      F(150, i % 4 === 0 ? tip(B0, PING) : B0),
    ]),
  };

  // echo sway (replaces "dance sway"): the torso sways a column left and right over planted legs,
  // eyes leading the sway, antenna ping at each end.
  const echoSway2 = {
    name: 'ECHO · sway', key: 'echo_sway_2', fwname: 'echo swing', category: 'Active', replaces: 'dance sway',
    intent: 'Replaces the stock dance sway: the torso swings a column left and right over planted legs, the eyes leading each swing and the antenna pinging at each end; judge whether it grooves.',
    palette: RP,
    frames: [
      F(260, B0), F(220, eyes(torso(B0, 0, -1), at(-2))), F(300, tip(eyes(torso(B0, 0, -1), at(-2)), PING)), F(220, B0),
      F(220, eyes(torso(B0, 0, 1), at(0))), F(300, tip(eyes(torso(B0, 0, 1), at(0)), PING)), F(220, B0),
    ],
  };

  // echo done (replaces "done"): a check mark draws itself stroke by stroke above the head, the eyes
  // go happy, the check flashes and fades.
  const CHECK = [[1, 5], [2, 6], [3, 7], [2, 8], [1, 9], [0, 10]];   // a V over the head, short stroke then long
  const check = (g, n, v) => { const b = clone(g); CHECK.slice(0, n).forEach(([r, c]) => set(b, r, c, v)); return b; };
  const happy = eyes(B0, [[6, 6], [7, 7], [6, 8], [6, 12], [7, 13], [6, 14]]);
  const echoDone = {
    name: 'ECHO · done', key: 'echo_done', fwname: 'echo done', category: 'Idle', replaces: 'done',
    intent: 'Replaces the stock done: a check mark draws itself stroke by stroke over the head, the eyes go happy, the check flashes and fades; judge whether the check reads.',
    palette: RP,
    frames: [
      F(700, B0), ...[1, 2, 3, 4, 5, 6].map(n => F(90, check(B0, n, VISOR))),
      F(200, check(happy, 6, W)), F(700, check(happy, 6, VISOR)), F(400, check(happy, 6, 5)), F(900, tip(B0, PING)),
    ],
  };

  // ---------- interactions: two ECHO creatures together ----------
  const MINI = (() => {
    const m = [];
    for (let r = 0; r < G; r += 2) {
      const row = [];
      for (let c = 0; c < G; c += 2) {
        const v = [B0[r][c], B0[r][c + 1], B0[r + 1][c], B0[r + 1][c + 1]].filter(Boolean);
        if (!v.length) { row.push(0); continue; }
        const n = {}; let best = v[0];
        for (const x of v) { n[x] = (n[x] || 0) + 1; if (n[x] > n[best]) best = x; }
        if ((n[2] || 0) >= 1) best = 2;
        row.push(best);
      }
      m.push(row);
    }
    return m;
  })();
  const mirror = m => m.map(r => r.slice().reverse());
  const MINI_R = mirror(MINI);                             // the second creature faces the first
  const blitM = (g, m, r0, c0, dy = 0) => { m.forEach((row, r) => row.forEach((v, c) => { if (v) set(g, r0 + r + dy, c0 + c, v); })); return g; };
  const handUp = (g, r0, c0, side) => { const c = c0 + (side > 0 ? 9 : 0); set(g, r0 + 2, c, BODY); set(g, r0 + 1, c, BODY); set(g, r0 + 4, c, 0); return g; };

  // echo high five: two minis walk in from the sides, raise a hand each, slap it with a flash and
  // sparks, hop together, walk back out.
  const pair = (xl, xr, {up = false, slap = false, hop = 0, ping = false} = {}) => {
    const g = empty();
    blitM(g, MINI, 8, xl, -hop); blitM(g, MINI_R, 8, xr, -hop);
    if (up) { handUp(g, 8 - hop, xl, 1); handUp(g, 8 - hop, xr, -1); }
    if (slap) { const mid = Math.round((xl + 9 + xr) / 2); for (const [r, c] of [[7, mid], [6, mid - 1], [6, mid + 1], [5, mid], [8, mid - 2], [8, mid + 2]]) set(g, r - hop, c, W); set(g, 7 - hop, mid, MAG); }
    if (ping) { set(g, 8 - hop, xl + 7, PING); set(g, 8 - hop, xr + 2, PING); }
    for (let c = 0; c < G; c++) set(g, 18, c, 5);
    return g;
  };
  const echoHighFive = {
    name: 'ECHO · high five', key: 'echo_high_five', fwname: 'echo high five', category: 'Active',
    intent: 'An interaction: two ECHO minis walk in from the sides, raise a hand each and high five with a flash and sparks, hop together and walk back out; judge whether the slap lands.',
    palette: RP,
    frames: [
      F(500, pair(-6, 16)), ...[-4, -2].map((x, i) => F(160, pair(x, 14 - i * 2, {hop: i % 2}))),
      F(200, pair(0, 10)), F(160, pair(0, 10, {up: true})), F(260, pair(0, 10, {up: true, slap: true})),
      F(160, pair(0, 10, {hop: 1, ping: true})), F(160, pair(0, 10)), F(160, pair(0, 10, {hop: 1, ping: true})), F(300, pair(0, 10)),
      ...[-2, -4].map((x, i) => F(160, pair(x, 12 + i * 2, {hop: i % 2}))), F(500, pair(-6, 16)),
    ],
  };

  // echo catch: two minis toss a glowing ball back and forth in an arc, each catching with a squint.
  const ball = (g, t) => { const x = Math.round(5 + t * 10), y = Math.round(9 - Math.sin(t * Math.PI) * 7); set(g, y, x, MAG); set(g, y, x + 1, W); return g; };
  const echoCatch = {
    name: 'ECHO · catch', key: 'echo_catch', fwname: 'echo catch', category: 'Active',
    intent: 'An interaction: two ECHO minis play catch, a glowing ball arcing between them, each one hopping to catch it with a ping; judge whether the arc reads.',
    palette: RP,
    frames: [
      ...[0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((t, i) => F(110, ball(pair(-3, 13, {hop: i === 7 ? 1 : 0, ping: i === 7}), t))),
      F(260, pair(-3, 13)),
      ...[1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0].map((t, i) => F(110, ball(pair(-3, 13, {hop: i === 7 ? 1 : 0, ping: i === 7}), t))),
      F(260, pair(-3, 13)),
    ],
  };

  L.register([echoDj, echoBlink, echoBreath, echoGlance, echoStartle, echoDoze, echoHop, echoSway2, echoDone, echoHighFive, echoCatch]);
})(typeof window !== 'undefined' ? window : globalThis);
