// Animation definitions for the bench (docs/bench/animations.html) and for the
// export tools (tools/bench_to_json.js writes claudepix-format JSON that
// tools/convert_to_c.js and tools/anim_gif.py read). One source, three uses.
//
// Lattice: 20 x 20 cells, values are palette indices, index 0 = transparent
// (drawn as panel black), at most 10 palette entries per animation.
(function (root) {
  const G = 20;
  const rows = s => s.trim().split(/\n/).map(l => l.trim().split('').map(Number));
  const clone = g => g.map(r => r.slice());
  const set = (g, r, c, v) => { if (r >= 0 && r < G && c >= 0 && c < G) g[r][c] = v; return g; };

  // Stock Clawd, frame 0 of claudepix "idle blink" (tools/claudepix_data/idle_blink.json);
  // the converter applies the brand tint (#D97757) to the body.
  const BASE = rows(`
00000000000000000000
00000000000000000000
00000000000000000000
00000000000000000000
00000111111111110000
00000111111111110000
00000112111112110000
00011112111112111100
00011111111111111100
00011111111111111100
00010111111111110100
00000111111111110000
00000111111111110000
00000111111111110000
00000100100010010000
00000100100010010000
00000100100010010000
00000000000000000000
00000000000000000000
00000000000000000000`);

  const blink = g => { const b = clone(g); set(b, 6, 7, 1); set(b, 6, 13, 1); return b; };
  const shut  = g => { const b = blink(g); set(b, 7, 7, 1); set(b, 7, 13, 1); set(b, 7, 6, 2); set(b, 7, 8, 2); set(b, 7, 12, 2); set(b, 7, 14, 2); return b; };

  // 1. Stock Clawd: idle blink (reference)
  const stock = {
    name: 'Stock Clawd · idle blink', key: 'idle_blink', category: 'Idle', reference: true,
    intent: 'Reference. The creature as it ships; every proposal must still read as this animal.',
    palette: ['transparent', '#D97757', '#0f0f0f'],
    frames: [
      {hold: 2400, grid: BASE}, {hold: 60, grid: blink(BASE)}, {hold: 100, grid: shut(BASE)}, {hold: 60, grid: blink(BASE)},
      {hold: 1600, grid: BASE}, {hold: 60, grid: blink(BASE)}, {hold: 80, grid: shut(BASE)}, {hold: 60, grid: blink(BASE)},
      {hold: 80, grid: BASE}, {hold: 60, grid: blink(BASE)}, {hold: 80, grid: shut(BASE)}, {hold: 60, grid: blink(BASE)},
    ],
  };

  // 2. Clawd with coffee. A proper mug: 3 wide, 4 tall (3 cream, 4 coffee on top), held in front of the
  // right arm at cols 16..18, rows 7..10, handle on col 19, the hand showing under it at row 11.
  // Steam (5) drifts above it. Every ~6 s the mug lifts one row to the mouth and the eyes squint (a sip).
  function mugAt(g, top) {
    const b = clone(g);
    for (let c = 15; c <= 17; c++) set(b, top, c, 4);                       // coffee surface
    for (let r = top + 1; r <= top + 3; r++) for (let c = 15; c <= 17; c++) set(b, r, c, 3);
    set(b, top + 1, 18, 3); set(b, top + 2, 18, 3);                          // handle
    set(b, top + 4, 16, 1);                                                  // hand under the mug
    return b;
  }
  const STEAM = [[[4, 16], [5, 17]], [[4, 17], [5, 16], [6, 17]], [[3, 16], [4, 17], [5, 17]], [[4, 16], [5, 16], [6, 16]]];
  const steam = (g, i) => { const b = clone(g); for (const [r, c] of STEAM[i % STEAM.length]) if (b[r][c] === 0) set(b, r, c, 5); return b; };
  const coffeeBase = mugAt(BASE, 7);
  const coffee = {
    name: 'Clawd · coffee', key: 'idle_coffee', fwname: 'coffee', category: 'Idle',
    intent: 'Proposal. Same body, right arm holds a mug; steam is the only motion at rest, a sip every six seconds.',
    palette: ['transparent', '#D97757', '#0f0f0f', '#e9e1d2', '#5a3524', '#cfd8dc'],
    frames: [],
  };
  {
    const f = coffee.frames;
    for (let k = 0; k < 8; k++) f.push({hold: 420, grid: steam(coffeeBase, k)});
    f.push({hold: 60, grid: steam(blink(coffeeBase), 0)});
    f.push({hold: 100, grid: steam(shut(coffeeBase), 1)});
    f.push({hold: 60, grid: steam(blink(coffeeBase), 2)});
    for (let k = 0; k < 4; k++) f.push({hold: 420, grid: steam(coffeeBase, k)});
    const sip = mugAt(BASE, 6);
    f.push({hold: 120, grid: steam(sip, 1)});
    f.push({hold: 700, grid: steam(shut(sip), 2)});
    f.push({hold: 120, grid: steam(sip, 3)});
    f.push({hold: 500, grid: steam(coffeeBase, 0)});
  }

  // 2b. Coffee, morning. Same mug, but the creature is waking up: eyes shut, a slow half-open,
  // shut again, a long first open, a sip with the eyes closed, then awake. One cycle ~12 s, mostly still.
  const coffeeMorning = {
    name: 'Clawd · coffee morning', key: 'coffee_morning', fwname: 'coffee morning', category: 'Idle',
    intent: 'Proposal. Holding the coffee and slowly waking up: shut, half, shut, open, sip, awake. Judge the slowness.',
    palette: coffee.palette,
    frames: [],
  };
  {
    const f = coffeeMorning.frames, sip = mugAt(BASE, 6);
    f.push({hold: 1400, grid: steam(shut(coffeeBase), 0)});
    f.push({hold: 900,  grid: steam(shut(coffeeBase), 1)});
    f.push({hold: 500,  grid: steam(blink(coffeeBase), 2)});   // half open
    f.push({hold: 1100, grid: steam(shut(coffeeBase), 3)});    // nope, back to sleep
    f.push({hold: 700,  grid: steam(shut(coffeeBase), 0)});
    f.push({hold: 450,  grid: steam(blink(coffeeBase), 1)});
    f.push({hold: 1300, grid: steam(coffeeBase, 2)});          // first real open
    f.push({hold: 160,  grid: steam(blink(coffeeBase), 3)});
    f.push({hold: 900,  grid: steam(coffeeBase, 0)});
    f.push({hold: 160,  grid: steam(sip, 1)});
    f.push({hold: 1400, grid: steam(shut(sip), 2)});           // long sip, eyes closed
    f.push({hold: 160,  grid: steam(sip, 3)});
    f.push({hold: 1600, grid: steam(coffeeBase, 0)});          // awake now
    f.push({hold: 90,   grid: steam(blink(coffeeBase), 1)});
    f.push({hold: 700,  grid: steam(coffeeBase, 2)});
  }

  // 3. ECHO creature. ECHO tokens: body --echo-deep 17836f, visor band --echo 35e0c0 with dark eyes,
  // antenna tip pings in --ping 6fe9ff, feet darker teal. Glitch split: for 60 ms rows 6..8 shift right
  // by one and the visor paints in --ping (the site's own glitch split accent). Breathes once per cycle.
  const echoBase = (() => {
    const b = clone(BASE);
    for (let c = 6; c <= 14; c++) { set(b, 6, c, 3); set(b, 7, c, 3); }
    set(b, 6, 7, 2); set(b, 7, 7, 2); set(b, 6, 13, 2); set(b, 7, 13, 2);
    set(b, 3, 15, 1); set(b, 2, 15, 1); set(b, 1, 15, 4);
    for (let r = 14; r <= 16; r++) for (const c of [5, 8, 12, 15]) set(b, r, c, 5);
    return b;
  })();
  const echoPing = on => { const b = clone(echoBase); set(b, 1, 15, on ? 4 : 1); return b; };
  const echoGlitch = () => {
    const b = clone(echoBase);
    for (const r of [6, 7, 8]) { const row = b[r].slice(); for (let c = G - 1; c > 0; c--) b[r][c] = row[c - 1]; b[r][0] = 0; }
    for (let c = 0; c < G; c++) { if (b[6][c] === 3) b[6][c] = 6; if (b[7][c] === 3) b[7][c] = 6; }
    return b;
  };
  const echoBreathe = () => { const b = clone(echoBase); b.splice(4, 1); b.splice(13, 0, echoBase[13].slice()); return b; };
  const echo = {
    name: 'ECHO creature · idle', key: 'echo_idle', fwname: 'echo idle', category: 'Idle',
    intent: "Proposal. Clawd's silhouette in ECHO's tokens: deep teal body, teal visor with dark eyes, a pinging antenna, one glitch split per cycle.",
    palette: ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#6fe9ff'],
    frames: [
      {hold: 1800, grid: echoPing(false)}, {hold: 140, grid: echoPing(true)}, {hold: 1400, grid: echoPing(false)},
      {hold: 60, grid: echoGlitch(), glitch: true}, {hold: 900, grid: echoPing(false)},
      {hold: 140, grid: echoPing(true)}, {hold: 700, grid: echoBreathe()}, {hold: 900, grid: echoPing(false)},
    ],
  };

  // 3b. ECHO float: the body drifts left, centre, right and bobs up a row while the legs stay
  // planted, like something hovering on its feet. Torso = rows 0..13 of the ECHO base, legs = rows 14+.
  function floatFrame(dx, dy) {
    const b = clone(echoBase);
    for (let r = 0; r <= 13; r++) for (let c = 0; c < G; c++) b[r][c] = 0;        // clear torso
    for (let r = 0; r <= 13; r++) for (let c = 0; c < G; c++) {
      const v = echoBase[r][c]; if (!v) continue;
      set(b, r + dy, c + dx, v);
    }
    return b;
  }
  const echoFloat = {
    name: 'ECHO · float', key: 'echo_float', fwname: 'echo float', category: 'Idle',
    intent: 'Proposal. The body floats back and forth over planted legs, one cell each way with a bob at the turn.',
    palette: echo.palette,
    frames: [
      {hold: 480, grid: floatFrame(0, 0)}, {hold: 260, grid: floatFrame(-1, 0)}, {hold: 420, grid: floatFrame(-1, -1)},
      {hold: 260, grid: floatFrame(-1, 0)}, {hold: 480, grid: floatFrame(0, 0)}, {hold: 260, grid: floatFrame(1, 0)},
      {hold: 420, grid: floatFrame(1, -1)}, {hold: 260, grid: floatFrame(1, 0)},
    ],
  };

  // 3c. Two agents: the ECHO creature splits into two 10x10 minis side by side and rejoins.
  // 2x2 majority downsample of the ECHO base; minis placed at (5, 0) and (5, 10).
  // 2x2 majority, except that eyes win a tie: the family's eyes are one cell wide, so a plain
  // majority always loses them to the visor and the minis came out blind (operator, 2026-09-28).
  function downsample(g) {
    const m = [];
    for (let r = 0; r < G; r += 2) {
      const row = [];
      for (let c = 0; c < G; c += 2) {
        const v = [g[r][c], g[r][c + 1], g[r + 1][c], g[r + 1][c + 1]].filter(Boolean);
        if (!v.length) { row.push(0); continue; }
        const cnt = {}; let best = v[0];
        for (const x of v) { cnt[x] = (cnt[x] || 0) + 1; if (cnt[x] > cnt[best]) best = x; }
        if ((cnt[2] || 0) >= 2) best = 2;
        row.push(best);
      }
      m.push(row);
    }
    return m;
  }
  function blit(dst, mini, r0, c0) { for (let r = 0; r < mini.length; r++) for (let c = 0; c < mini[r].length; c++) if (mini[r][c]) set(dst, r0 + r, c0 + c, mini[r][c]); return dst; }
  const echoMini = downsample(echoBase);
  const empty = () => Array.from({length: G}, () => new Array(G).fill(0));
  const twoAgents = (dr) => blit(blit(empty(), echoMini, 5, 0 + dr), echoMini, 5, 10 - dr);   // dr pulls them together
  const echoTwoAgents = {
    name: 'ECHO · two agents', key: 'echo_two_agents', fwname: 'two agents', category: 'Active',
    intent: 'Proposal. One creature splits into two agents and rejoins: glitch, split, work apart, merge.',
    palette: echo.palette,
    frames: [
      {hold: 1200, grid: echoPing(false)}, {hold: 60, grid: echoGlitch(), glitch: true}, {hold: 140, grid: echoPing(true)},
      {hold: 60, grid: echoGlitch(), glitch: true},
      {hold: 260, grid: twoAgents(3)}, {hold: 260, grid: twoAgents(1)}, {hold: 1600, grid: twoAgents(0)},
      {hold: 300, grid: blit(blit(empty(), echoMini, 5, 0), echoMini, 5, 10).map((row, r) => row.map((v, c) => (v === 4 && r === 5) ? 4 : v))},
      {hold: 700, grid: twoAgents(0)}, {hold: 260, grid: twoAgents(1)}, {hold: 260, grid: twoAgents(3)},
      {hold: 60, grid: echoGlitch(), glitch: true}, {hold: 900, grid: echoPing(false)},
    ],
  };

  // 3d. Token burner: past the budget line the creature is on fire. Amber and alert flames flicker
  // above the body and embers drift up the sides; the visor goes alert. Loud on purpose: this is the
  // state that should make you look up.
  const FIRE_PALETTE = ['transparent', '#17836f', '#06090b', '#e0665a', '#6fe9ff', '#0f5a4c', '#e0b25a', '#eafffb'];
  const FLAME_ROWS = [
    // each entry: [row, col, palette index]; four flicker phases over the head (rows 1..3) and sides
    [[3,6,6],[3,8,3],[3,10,6],[3,12,3],[3,14,6],[2,7,3],[2,11,6],[2,13,3],[1,9,6],[8,3,6],[9,17,6]],
    [[3,5,3],[3,7,6],[3,9,3],[3,11,6],[3,13,3],[3,15,6],[2,6,6],[2,10,3],[2,14,6],[1,8,3],[1,12,6],[7,3,3],[10,17,3]],
    [[3,6,6],[3,9,6],[3,12,3],[3,14,6],[2,8,3],[2,12,6],[1,10,3],[0,10,6],[9,3,6],[8,17,6]],
    [[3,5,6],[3,8,3],[3,11,3],[3,13,6],[3,15,3],[2,7,6],[2,9,3],[2,13,6],[1,11,3],[1,7,6],[6,3,3],[6,17,6]],
  ];
  function fireFrame(k) {
    const b = clone(echoBase);
    set(b, 1, 15, 3);                                                    // antenna tip burns
    for (let c = 6; c <= 14; c++) { if (b[6][c] === 3) b[6][c] = 3 + 0; if (b[7][c] === 3) b[7][c] = 3; }
    for (const [r, c, v] of FLAME_ROWS[k % FLAME_ROWS.length]) if (b[r][c] === 0) set(b, r, c, v);
    return b;
  }
  const tokenBurner = {
    name: 'ECHO · token burner', key: 'token_burner', fwname: 'token burner', category: 'Active',
    intent: 'Proposal. Past 500k tokens the creature is on fire: amber and alert flames over the head, embers up the sides, visor gone alert. The loud state.',
    palette: FIRE_PALETTE,
    frames: [0, 1, 2, 3, 0, 2, 1, 3].map(k => ({hold: 110 + (k % 2) * 40, grid: fireFrame(k)})),
  };

  // 3e. Ultramode: the creature dissolves into a rotating wireframe cube, the cube throws off a swirl
  // of braille-like dots, everything collapses back into the creature, and it dives in again.
  // Cube: eight 3D vertices rotated about Y (and tilted) and projected orthographically onto the
  // 20x20 lattice; edges drawn with Bresenham. Dots: two counter-rotating rings.
  function line(b, x0, y0, x1, y1, v) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { set(b, y0, x0, v); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function cubeFrame(angle, size, v) {
    const b = empty(), cs = Math.cos(angle), sn = Math.sin(angle), tilt = 0.55;
    const P = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const rx = x * cs + z * sn, rz = -x * sn + z * cs;                    // spin about Y
      const ry = y * Math.cos(tilt) - rz * Math.sin(tilt);                  // tilt toward the viewer
      P.push([Math.round(9.5 + rx * size), Math.round(9.5 + ry * size)]);
    }
    const E = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    for (const [i, j] of E) line(b, P[i][0], P[i][1], P[j][0], P[j][1], v);
    return b;
  }
  function swirl(base, k, n, radius, v, dir) {
    const b = clone(base);
    for (let i = 0; i < n; i++) {
      const t = dir * (k * 0.35) + i * (2 * Math.PI / n);
      set(b, Math.round(9.5 + Math.sin(t) * radius), Math.round(9.5 + Math.cos(t) * radius), v);
    }
    return b;
  }
  function dissolve(g, k) { const b = clone(g); for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (b[r][c] && ((r * 7 + c * 13 + k * 5) % 4) < k) b[r][c] = 0; return b; }
  const ultra = {
    name: 'ECHO · ultramode', key: 'ultramode', fwname: 'ultramode', category: 'Mode',
    intent: 'Proposal. The creature dissolves into a rotating wireframe cube that throws off spinning braille dots, collapses back into itself, then dives in again.',
    palette: ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#eafffb'],
    frames: [],
  };
  {
    const f = ultra.frames;
    f.push({hold: 900, grid: echoPing(false)});
    f.push({hold: 60, grid: echoGlitch(), glitch: true});
    for (let k = 1; k <= 3; k++) f.push({hold: 90, grid: dissolve(echoBase, k)});          // dissolve out
    for (let k = 0; k < 12; k++) {                                                            // cube spins, dots swirl
      let g = cubeFrame(k * Math.PI / 6, 5, 3);
      g = swirl(g, k, 6, 8.5, 4, 1);
      g = swirl(g, k, 4, 6.5, 6, -1);
      f.push({hold: 110, grid: g});
    }
    for (let k = 0; k < 4; k++) f.push({hold: 80, grid: swirl(cubeFrame(k * Math.PI / 6 + Math.PI, 5 - k, 3), 12 + k, 6, 8.5 - k, 4, 1)});  // cube shrinks
    for (let k = 3; k >= 1; k--) f.push({hold: 90, grid: dissolve(echoBase, k)});          // reassemble
    f.push({hold: 1400, grid: echoPing(true)});
    f.push({hold: 60, grid: echoGlitch(), glitch: true});
    f.push({hold: 700, grid: echoPing(false)});
  }

  // 3f. Credits out: the creature cries out. Visor alert-red, a wide open mouth, tears streaming
  // from both eyes, the body shaking a cell either way, and every fourth beat a full white-out scream.
  // Deliberately loud from the first frame to the last: this is the one state that should never be
  // mistaken for idle.
  const CRY_PALETTE = ['transparent', '#17836f', '#06090b', '#e0665a', '#6fe9ff', '#0f5a4c', '#eafffb'];
  function cryFrame(dx, tearPhase, scream) {
    const b = empty();
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) { const v = echoBase[r][c]; if (v) set(b, r, c + dx, scream ? (v === 2 ? 2 : 6) : v); }
    // mouth: wide open, dark, rows 10..11 cols 8..12
    for (let r = 10; r <= 11; r++) for (let c = 8; c <= 12; c++) set(b, r, c + dx, 2);
    if (!scream) {
      // tears fall from under each eye, two streams, phase-shifted
      const drops = [[8, 6], [9, 6], [11, 6], [12, 6], [8, 14], [10, 14], [11, 14], [13, 14]];
      drops.forEach(([r, c], i) => { if ((i + tearPhase) % 3 !== 0) set(b, r + (tearPhase % 2), c + dx, 4); });
      // antenna tip: alert
      set(b, 1, 15 + dx, 3);
    }
    return b;
  }
  const creditsOut = {
    name: 'ECHO · credits out', key: 'credits_out', fwname: 'credits out', category: 'Mode',
    intent: 'Proposal. The alarm: visor alert, mouth wide, tears streaming, body shaking, a white scream every fourth beat. Loud on purpose.',
    palette: CRY_PALETTE,
    frames: [
      {hold: 140, grid: cryFrame(0, 0, false)}, {hold: 120, grid: cryFrame(-1, 1, false)}, {hold: 140, grid: cryFrame(0, 2, false)},
      {hold: 120, grid: cryFrame(1, 0, false)}, {hold: 70, grid: cryFrame(0, 1, true)},
      {hold: 140, grid: cryFrame(0, 1, false)}, {hold: 120, grid: cryFrame(1, 2, false)}, {hold: 140, grid: cryFrame(0, 0, false)},
      {hold: 120, grid: cryFrame(-1, 1, false)}, {hold: 70, grid: cryFrame(0, 2, true)},
    ],
  };

  // 3g. CTF hoodie: when Claude is working a CTF the creature pulls on a black hoodie. Body goes to
  // hoodie charcoal, a hood wraps the head (row above, both temples), drawstrings hang from the
  // collar in flash, feet stay teal, visor stays teal so it is still ours. Slow blink, a glance
  // left and right, otherwise still: this is a long-session skin.
  const HOODIE_PALETTE = ['transparent', '#1b2326', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#eafffb', '#17836f'];
  function hoodieFrame(eyeDx, eyesOpen) {
    const b = clone(echoBase);
    // hood: row 3 across the head, temples down rows 4..7 one cell outside the body
    for (let c = 5; c <= 15; c++) set(b, 3, c, 1);
    for (let r = 4; r <= 6; r++) { set(b, r, 4, 1); set(b, r, 16, 1); }
    set(b, 2, 15, 1); set(b, 1, 15, 4);                                    // antenna pokes through the hood
    // drawstrings
    set(b, 8, 9, 6); set(b, 9, 9, 6); set(b, 8, 11, 6); set(b, 9, 11, 6);
    // eyes: shift within the visor, or shut
    for (let r = 6; r <= 7; r++) for (let c = 6; c <= 14; c++) if (b[r][c] === 2) b[r][c] = 3;
    if (eyesOpen) { for (let r = 6; r <= 7; r++) { set(b, r, 7 + eyeDx, 2); set(b, r, 13 + eyeDx, 2); } }
    else { set(b, 7, 7, 2); set(b, 7, 13, 2); }
    return b;
  }
  const ctfHoodie = {
    name: 'ECHO · CTF hoodie', key: 'ctf_hoodie', fwname: 'ctf hoodie', category: 'Idle',
    intent: 'Proposal. Working a CTF: black hoodie up, drawstrings, teal visor still showing. Slow blink and a glance either way; a long-session skin.',
    palette: HOODIE_PALETTE,
    frames: [
      {hold: 2200, grid: hoodieFrame(0, true)}, {hold: 90, grid: hoodieFrame(0, false)}, {hold: 1400, grid: hoodieFrame(0, true)},
      {hold: 700, grid: hoodieFrame(-1, true)}, {hold: 1600, grid: hoodieFrame(0, true)}, {hold: 700, grid: hoodieFrame(1, true)},
      {hold: 90, grid: hoodieFrame(1, false)}, {hold: 1200, grid: hoodieFrame(0, true)},
    ],
  };

  // 3h. ECHO coffee, and ECHO double coffee. The ECHO palette has three free slots, so the mug colours
  // ride along as indices 7 (cream), 8 (coffee), 9 (steam). Right mug as Clawd's; left mug mirrored.
  const ECHO_COFFEE_PALETTE = [...echo.palette, '#e9e1d2', '#5a3524', '#cfd8dc'];
  function echoMug(g, top, side) {
    const b = clone(g);
    const cols = side > 0 ? [15, 16, 17] : [2, 3, 4], handle = side > 0 ? 18 : 1, hand = side > 0 ? 16 : 3;
    for (const c of cols) set(b, top, c, 8);
    for (let r = top + 1; r <= top + 3; r++) for (const c of cols) set(b, r, c, 7);
    set(b, top + 1, handle, 7); set(b, top + 2, handle, 7);
    set(b, top + 4, hand, 1);
    return b;
  }
  const ECHO_STEAM = [[[4, 16], [5, 17]], [[4, 17], [5, 16], [6, 17]], [[3, 16], [4, 17], [5, 17]], [[4, 16], [5, 16], [6, 16]]];
  function echoSteam(g, i, mirror) {
    const b = clone(g);
    for (const [r, c] of ECHO_STEAM[i % ECHO_STEAM.length]) {
      const cc = mirror ? 19 - c : c;
      if (b[r][cc] === 0) set(b, r, cc, 9);
    }
    return b;
  }
  const echoCoffeeBase = echoMug(echoBase, 7, 1);
  const echoCoffee = {
    name: 'ECHO · coffee', key: 'echo_coffee', fwname: 'echo coffee', category: 'Idle',
    intent: 'Proposal. The ECHO creature with its own mug: steam at rest, an antenna ping, a sip.',
    palette: ECHO_COFFEE_PALETTE,
    frames: [],
  };
  {
    const f = echoCoffee.frames, sip = echoMug(echoBase, 6, 1);
    for (let k = 0; k < 6; k++) f.push({hold: 450, grid: echoSteam(k === 3 ? echoMug(echoPing(true), 7, 1) : echoCoffeeBase, k, false)});
    f.push({hold: 60, grid: echoSteam(echoMug(echoGlitch(), 7, 1), 0, false), glitch: true});
    for (let k = 0; k < 3; k++) f.push({hold: 450, grid: echoSteam(echoCoffeeBase, k, false)});
    f.push({hold: 140, grid: echoSteam(sip, 1, false)});
    f.push({hold: 800, grid: echoSteam(sip, 2, false)});
    f.push({hold: 140, grid: echoSteam(sip, 3, false)});
    f.push({hold: 600, grid: echoSteam(echoCoffeeBase, 0, false)});
  }
  const echoDoubleBase = echoMug(echoCoffeeBase, 7, -1);
  const echoDoubleCoffee = {
    name: 'ECHO · double coffee', key: 'echo_double_coffee', fwname: 'echo double coffee', category: 'Idle',
    intent: 'Proposal. Some days it is two mugs. Steam off both, alternating sips, a quicker antenna.',
    palette: ECHO_COFFEE_PALETTE,
    frames: [],
  };
  {
    const f = echoDoubleCoffee.frames;
    const both = (g, k) => echoSteam(echoSteam(g, k, false), k + 2, true);
    for (let k = 0; k < 4; k++) f.push({hold: 420, grid: both(k === 1 ? echoMug(echoMug(echoPing(true), 7, 1), 7, -1) : echoDoubleBase, k)});
    const sipR = echoMug(echoMug(echoBase, 6, 1), 7, -1), sipL = echoMug(echoMug(echoBase, 7, 1), 6, -1);
    f.push({hold: 120, grid: both(sipR, 0)}); f.push({hold: 700, grid: both(sipR, 1)}); f.push({hold: 120, grid: both(sipR, 2)});
    for (let k = 0; k < 3; k++) f.push({hold: 420, grid: both(echoDoubleBase, k)});
    f.push({hold: 120, grid: both(sipL, 1)}); f.push({hold: 700, grid: both(sipL, 2)}); f.push({hold: 120, grid: both(sipL, 3)});
    f.push({hold: 60, grid: both(echoMug(echoMug(echoGlitch(), 7, 1), 7, -1), 0), glitch: true});
    for (let k = 0; k < 2; k++) f.push({hold: 420, grid: both(echoDoubleBase, k)});
  }

  // 4. ECHO skin over the stock movements (docs/bench/stock_anims.js, generated by
  // tools/stock_to_bench.js). The stock frames translate the whole body, so every
  // feature is placed from the frame's own geometry: body bounding box for the shift,
  // frame 0's eye rows/cols for the visor, top row for the antenna, bottom rows for feet.
  const ECHO_PALETTE = ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#6fe9ff'];
  function bbox(g) {
    let top = G, bot = -1, left = G, right = -1;
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g[r][c]) { top = Math.min(top, r); bot = Math.max(bot, r); left = Math.min(left, c); right = Math.max(right, c); }
    return {top, bot, left, right};
  }
  function eyeGeom(g) {
    let rows = new Set(), cmin = G, cmax = -1;
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g[r][c] === 2) { rows.add(r); cmin = Math.min(cmin, c); cmax = Math.max(cmax, c); }
    return {rows: [...rows], cmin, cmax};
  }
  function skinFrame(g, ref) {
    const b = clone(g);
    const bb = bbox(g), rb = bbox(ref.grid);
    const dy = bb.top - rb.top, dx = bb.left - rb.left;
    // visor band
    for (const r0 of ref.eyes.rows) {
      const r = r0 + dy;
      for (let c = ref.eyes.cmin - 1 + dx; c <= ref.eyes.cmax + 1 + dx; c++) if (r >= 0 && r < G && c >= 0 && c < G && b[r][c] === 1) b[r][c] = 3;
    }
    // antenna on the top-right body column of the top row
    let tc = -1; for (let c = G - 1; c >= 0; c--) if (g[bb.top][c] === 1) { tc = c; break; }
    if (tc >= 0) { set(b, bb.top - 1, tc, 1); set(b, bb.top - 2, tc, 1); set(b, bb.top - 3, tc, 4); }
    // feet: bottom three body rows
    for (let r = bb.bot - 2; r <= bb.bot; r++) for (let c = 0; c < G; c++) if (b[r] && b[r][c] === 1) b[r][c] = 5;
    return b;
  }
  // Chest spinner: two opposite cells orbit a 3x3 ring on the chest (8 phases). Bench-only overlay,
  // baked at export as phase = frame index, so it can be judged and removed with one toggle.
  const RING = [[0,0],[0,1],[0,2],[1,2],[2,2],[2,1],[2,0],[1,0]];
  function spinnerAt(g, phase) {
    const b = clone(g), bb = bbox(g);
    const top = bb.top + 5, mid = Math.floor((bb.left + bb.right) / 2) - 1;
    for (const k of [phase % 8, (phase + 4) % 8]) { const [dr, dc] = RING[k]; const r = top + dr, c = mid + dc; if (b[r] && b[r][c] === 1) b[r][c] = 4; }
    return b;
  }
  const skinned = [];
  const STOCK = (typeof root.STOCK_ANIMS !== 'undefined') ? root.STOCK_ANIMS : (typeof require !== 'undefined' ? require('./stock_anims.js') : {});
  const WANT = ['idle_breathe', 'idle_look_around', 'expression_wink', 'expression_surprise', 'expression_sleep', 'dance_bounce', 'dance_sway', 'work_think'];
  for (const key of WANT) {
    const src = STOCK[key]; if (!src) continue;
    const grids = src.frames.map(f => f.rows.map(l => l.split('').map(Number)));
    const ref = {grid: grids[0], eyes: eyeGeom(grids[0])};
    if (ref.eyes.rows.length === 0) {
      // eyes shut in frame 0 (sleep): take them from the first open frame, else from the stock base
      const k = grids.findIndex(g => eyeGeom(g).rows.length);
      ref.grid = k >= 0 ? grids[k] : BASE; ref.eyes = eyeGeom(ref.grid);
    }
    const short = src.name.replace(/^(idle|expression|dance|work)\s+/, '');
    skinned.push({
      name: 'ECHO · ' + short, key: 'echo_' + key.replace(/^(idle|expression|dance|work)_/, ''), fwname: 'echo ' + short,
      category: /dance/.test(key) ? 'Active' : 'Idle', spinner: true,
      intent: `Stock "${src.name}" movement with the ECHO skin applied per frame; spinner overlay on the chest (toggle in the master bar).`,
      palette: ECHO_PALETTE,
      frames: src.frames.map((f, i) => ({hold: f.hold, grid: skinFrame(grids[i], ref)})),
    });
  }

  // Shared library for the extra creature files (docs/bench/anims_*.js): each of those does
  //   const L = (typeof window !== 'undefined' ? window : globalThis).BENCH_LIB;
  //   L.register([ ...cells ]);
  // and is loaded after this file (bench: script tags; export: tools/bench_to_json.js requires them).
  const BENCH = {G, anims: [stock, coffee, coffeeMorning, echo, echoCoffee, echoDoubleCoffee, echoFloat, echoTwoAgents, tokenBurner, ultra, creditsOut, ctfHoodie, ...skinned], spinnerAt};
  const BENCH_LIB = {G, rows, clone, set, BASE, blink, shut, ECHO_PALETTE, echoBase, echoPing, echoGlitch, bbox, eyeGeom, skinFrame, spinnerAt, STOCK,
    register(cells) { for (const c of cells) BENCH.anims.push(c); }};
  root.BENCH = BENCH; root.BENCH_LIB = BENCH_LIB;
  if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
})(typeof window !== 'undefined' ? window : globalThis);
