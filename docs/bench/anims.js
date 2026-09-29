// Animation definitions for the bench (docs/bench/animations.html) and for the
// export tools (tools/bench_to_json.js writes claudepix-format JSON that
// tools/convert_to_c.js and tools/anim_gif.py read). One source, three uses.
//
// Lattice: 20 x 20 cells unless the animation sets size, values are palette indices, index 0 =
// transparent (drawn as panel black), at most 10 palette entries per animation.
//
// size (optional on an animation, default BENCH.G = 20): every frame is size x size cells and the
// 480 px panel draws each cell at 480 divided by size, so 40 gives 12 px cells and 60 gives 8 px
// cells, both exact. BENCH.sizeOf(anim) reads it with the default applied.
// upscale(grid, k) repeats every cell k times across and down: a 60 cell animation starts from
// upscale(echoBase, 3), the creature at 3x exactly, and paints its fine detail on top with set().
// The posing helpers (blink, shut, echoPing, echoGlitch, skinFrame) stay on the 20 cell lattice.
(function (root) {
  const G = 20;
  const rows = s => s.trim().split(/\n/).map(l => l.trim().split('').map(Number));
  const clone = g => g.map(r => r.slice());
  // Clips to the grid's own lattice, never less than G: every grid of 20 rows or fewer clips
  // exactly as it always did, and an upscaled 60 cell grid takes a write anywhere in its 60 x 60.
  const set = (g, r, c, v) => { const n = Math.max(G, g.length); if (r >= 0 && r < n && c >= 0 && c < n) g[r][c] = v; return g; };
  // Each cell repeated k times across and down; a fresh grid whose rows are never shared.
  const upscale = (g, k) => {
    if (!Number.isInteger(k) || k < 1) throw new Error('upscale: k must be a whole number, 1 or more, got ' + k);
    const out = [];
    for (const row of g) {
      const wide = [];
      for (const v of row) for (let j = 0; j < k; j++) wide.push(v);
      for (let i = 0; i < k; i++) out.push(wide.slice());
    }
    return out;
  };
  const sizeOf = a => (a.size === undefined ? G : a.size);

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
      {hold: 260, grid: twoAgents(2)}, {hold: 260, grid: twoAgents(1)}, {hold: 1600, grid: twoAgents(0)},
      {hold: 300, grid: blit(blit(empty(), echoMini, 5, 0), echoMini, 5, 10).map((row, r) => row.map((v, c) => (v === 4 && r === 5) ? 4 : v))},
      {hold: 700, grid: twoAgents(0)}, {hold: 260, grid: twoAgents(1)}, {hold: 260, grid: twoAgents(2)},
      {hold: 60, grid: echoGlitch(), glitch: true}, {hold: 900, grid: echoPing(false)},
    ],
  };

  // 3c2. SSH: the creature makes contact with another machine. It steps back to its mini, a server
  // tower stands on the right (dark, three slots, one LED each), a packet leaves the creature along
  // the visor row, the first LED answers, a packet comes back, then the link goes solid and the LEDs
  // walk while the creature's antenna pings: connected. The link drops and the creature returns.
  function sshScene(packet, link, leds, ping) {
    const b = blit(empty(), echoMini, 5, 0);
    set(b, 5, 7, ping ? 4 : 1);                                              // the mini's antenna tip
    for (let r = 4; r <= 15; r++) for (let c = 13; c <= 18; c++) set(b, r, c, 5);   // the tower
    [6, 9, 12].forEach((r, i) => { for (let c = 15; c <= 17; c++) set(b, r, c, 1); set(b, r, 14, leds[i] || 5); });
    if (link) for (let c = 10; c <= 12; c++) set(b, 8, c, 3);               // the session, solid
    if (packet >= 0) set(b, 8, packet, 4);                                   // one packet on the wire
    return b;
  }
  const echoSsh = {
    name: 'ECHO · ssh', key: 'echo_ssh', fwname: 'echo ssh', category: 'Active',
    intent: 'Proposal. Contact with another machine: a packet out to the tower, an LED answers, a packet back, the link goes solid and the LEDs walk while the antenna pings. Host plays it when an agent opens a remote session.',
    palette: echo.palette,
    frames: [
      {hold: 900, grid: echoPing(false)}, {hold: 60, grid: echoGlitch(), glitch: true},
      {hold: 500, grid: sshScene(-1, false, [], false)},
      {hold: 140, grid: sshScene(10, false, [], true)}, {hold: 140, grid: sshScene(11, false, [], false)}, {hold: 140, grid: sshScene(12, false, [], false)},
      {hold: 320, grid: sshScene(-1, false, [4], false)},
      {hold: 140, grid: sshScene(12, false, [4], false)}, {hold: 140, grid: sshScene(11, false, [4], false)}, {hold: 140, grid: sshScene(10, false, [4], false)},
      {hold: 600, grid: sshScene(-1, true, [4, 4], true)},
      {hold: 380, grid: sshScene(-1, true, [3, 4, 4], false)}, {hold: 380, grid: sshScene(-1, true, [4, 3, 4], true)},
      {hold: 380, grid: sshScene(-1, true, [4, 4, 3], false)}, {hold: 380, grid: sshScene(-1, true, [3, 4, 4], true)},
      {hold: 420, grid: sshScene(-1, false, [], false)},
      {hold: 60, grid: echoGlitch(), glitch: true}, {hold: 140, grid: echoPing(true)}, {hold: 1200, grid: echoPing(false)},
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
    name: 'ECHO · ultra cube', key: 'ultra_cube', fwname: 'ultra cube', category: 'Mode',
    intent: 'Earlier ultramode idea, kept: the creature dissolves into a rotating wireframe cube with braille dots, collapses back, dives in again.',
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

  // 3e2. Ultramode, second take (operator: "I like the shifting concept but it can be cleaner").
  // No dissolve, no cube: the creature stays whole and its rows SHIFT. A ripple runs down the body
  // (each row offset by a small wave), then the creature slides apart into three horizontal bands
  // (head, torso, legs) that pull in opposite directions and snap back, with the visor lit ping on the
  // frames where the bands are apart. Coherent motion, one idea, then rest.
  function shiftRows(g, fn, edge) {
    const b = empty();
    for (let r = 0; r < G; r++) {
      const dx = fn(r);
      for (let c = 0; c < G; c++) if (g[r][c]) set(b, r, c + dx, g[r][c]);
      if (edge && dx) { // a lit cell on the leading edge of every shifted row
        const cs = []; for (let c = 0; c < G; c++) if (b[r][c]) cs.push(c);
        if (cs.length) set(b, r, dx > 0 ? cs[cs.length - 1] : cs[0], 4);
      }
    }
    return b;
  }
  const ultraShift = {
    name: 'ECHO · ultramode', key: 'ultramode', fwname: 'ultramode', category: 'Mode',
    intent: 'Proposal, take two. The creature stays whole: a ripple shifts its rows, then head, torso and legs slide apart and snap back. Clean shifting, one idea per beat.',
    palette: echo.palette,
    frames: [],
  };
  {
    const f = ultraShift.frames;
    f.push({hold: 1100, grid: echoPing(false)});
    // ripple: a wave of offsets travelling down the rows, 6 frames
    for (let k = 0; k < 6; k++) f.push({hold: 80, grid: shiftRows(echoBase, r => Math.round(Math.sin((r - k * 2) / 1.6) * (k < 5 ? 1 : 0)), true)});
    f.push({hold: 500, grid: echoPing(true)});
    // bands apart: head (rows 0..7) right, torso (8..13) left, legs (14..) right; then further, then back
    const band = amt => shiftRows(echoBase, r => r <= 7 ? amt : r <= 13 ? -amt : amt, true);
    f.push({hold: 110, grid: band(1)}); f.push({hold: 700, grid: band(2)}); f.push({hold: 110, grid: band(1)});
    f.push({hold: 60, grid: echoGlitch(), glitch: true});
    f.push({hold: 900, grid: echoPing(false)});
    // the mirror: bands the other way
    const band2 = amt => shiftRows(echoBase, r => r <= 7 ? -amt : r <= 13 ? amt : -amt, true);
    f.push({hold: 110, grid: band2(1)}); f.push({hold: 700, grid: band2(2)}); f.push({hold: 110, grid: band2(1)});
    f.push({hold: 1200, grid: echoPing(true)});
  }

  // Neon purple aura for ultramode (operator, 2026-09-28): every empty cell touching the body lights
  // up in neon purple, and the aura breathes by swapping to the portal magenta on the off beat. It is
  // computed from each frame's own grid, so it follows the ripple and the bands.
  const ULTRA_PALETTE = [...echo.palette, '#b44dff', '#ff5fd2'];   // 7 neon purple, 8 portal magenta
  function aura(g, phase) {
    const b = clone(g);
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      if (g[r][c]) continue;
      let lit = false;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < G && cc >= 0 && cc < G && g[rr][cc] && g[rr][cc] < 7) { lit = true; break; }
      }
      if (lit) b[r][c] = phase ? 8 : 7;
    }
    return b;
  }
  ultraShift.palette = ULTRA_PALETTE;
  ultraShift.intent = 'Proposal, take two, with the aura. The creature stays whole inside a neon purple aura that breathes: a ripple shifts its rows, then head, torso and legs slide apart and snap back, the aura following every shift.';
  ultraShift.frames = ultraShift.frames.map((fr, i) => Object.assign({}, fr, {grid: aura(fr.grid, i % 2)}));

  // 3i. Echo walk: the creature moves around. It walks four cells to the right and back with the
  // feet alternating and a one-row bob on every step, a glance at each turn. Movement, not a fidget.
  function walkFrame(dx, step) {
    const b = empty();
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const v = echoBase[r][c]; if (!v) continue;
      if (r >= 14) continue;                                      // legs drawn separately
      set(b, r - (step % 2), c + dx, v);
    }
    const feet = step % 2 ? [6, 8, 12, 14] : [5, 8, 12, 15];      // inner/outer stance, always on the ground
    for (let r = 14; r <= 16; r++) for (const c of feet) set(b, r, c + dx, 5);
    if (step % 2) for (const c of feet) set(b, 13, c + dx, 1);     // the body lifted a row: fill the hip row so no gap shows
    return b;
  }
  const echoWalk = {
    name: 'ECHO · walk', key: 'echo_walk', fwname: 'echo walk', category: 'Active',
    intent: 'Proposal. It walks: four cells right, a look back, four cells left, with alternating feet and a bob. The creature moving around the lattice.',
    palette: echo.palette,
    frames: [],
  };
  {
    const f = echoWalk.frames;
    f.push({hold: 700, grid: walkFrame(-2, 0)});
    for (let s = 1; s <= 4; s++) f.push({hold: 240, grid: walkFrame(-2 + s, s)});
    f.push({hold: 600, grid: walkFrame(2, 0)});
    f.push({hold: 300, grid: (() => { const g = walkFrame(2, 0); for (let r = 6; r <= 7; r++) { set(g, r, 2 + 7, 3); set(g, r, 2 + 13, 3); set(g, r, 2 + 8, 2); set(g, r, 2 + 14, 2); } return g; })()});  // glance right
    f.push({hold: 400, grid: walkFrame(2, 0)});
    for (let s = 1; s <= 4; s++) f.push({hold: 240, grid: walkFrame(2 - s, s)});
    f.push({hold: 900, grid: walkFrame(-2, 0)});
  }

  // 3j. Job done: the payoff animation. Two quick bounces, then the right arm shoots up with a
  // thumbs up, the visor flashes white, confetti pops in ping, amber and flash around the head,
  // a little sway while it holds the pose, arm down, rest. Fun on purpose, but still the family.
  const DONE_PALETTE = [...echo.palette, '#e0b25a', '#eafffb'];   // 7 amber, 8 flash
  function bob(g, dy) { const b = empty(); for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g[r][c]) set(b, r + dy, c, g[r][c]); return b; }
  function thumbsUp(g, flash) {
    const b = clone(g);
    // right arm off the shoulder (rows 7..9, cols 16..17 are arm/hand in the base) and up along col 17
    for (let r = 7; r <= 9; r++) { set(b, r, 16, 1); set(b, r, 17, 0); }
    set(b, 10, 17, 0);
    for (let r = 3; r <= 7; r++) set(b, r, 17, 1);               // arm up
    set(b, 3, 18, 1); set(b, 4, 18, 1);                           // fist
    set(b, 2, 18, 3); set(b, 1, 18, 3);                           // thumb, visor teal so it pops
    if (flash) for (let r = 6; r <= 7; r++) for (let c = 6; c <= 14; c++) if (b[r][c] === 3) b[r][c] = 8;
    return b;
  }
  const CONFETTI = [
    [[1, 5, 4], [0, 9, 7], [2, 12, 8], [1, 3, 7], [3, 1, 4], [0, 14, 4]],
    [[0, 6, 7], [2, 3, 4], [1, 11, 8], [3, 19, 7], [2, 0, 8], [0, 12, 4]],
    [[2, 7, 8], [1, 1, 7], [0, 4, 4], [3, 13, 7], [1, 19, 4], [2, 10, 7]],
  ];
  function confetti(g, k) { const b = clone(g); for (const [r, c, v] of CONFETTI[k % 3]) if (b[r][c] === 0) set(b, r, c, v); return b; }
  const jobDone = {
    name: 'ECHO · job done', key: 'job_done', fwname: 'job done', category: 'Mode',
    intent: 'Proposal. The payoff: two bounces, arm up with a thumbs up, visor flashes white, confetti pops, a sway on the pose, arm down. Host plays it when a task finishes.',
    palette: DONE_PALETTE,
    frames: [
      {hold: 600, grid: echoPing(false)},
      {hold: 130, grid: bob(echoBase, -1)}, {hold: 130, grid: echoBase}, {hold: 130, grid: bob(echoBase, -1)}, {hold: 160, grid: echoBase},
      {hold: 110, grid: thumbsUp(echoBase, false)},
      {hold: 160, grid: confetti(thumbsUp(echoPing(true), true), 0)},
      {hold: 160, grid: confetti(bob(thumbsUp(echoBase, true), -1), 1)},
      {hold: 160, grid: confetti(thumbsUp(echoPing(true), true), 2)},
      {hold: 160, grid: confetti(bob(thumbsUp(echoBase, true), -1), 0)},
      {hold: 160, grid: confetti(thumbsUp(echoPing(true), true), 1)},
      {hold: 700, grid: thumbsUp(echoPing(true), false)},
      {hold: 110, grid: echoBase},
      {hold: 1400, grid: echoPing(false)},
    ],
  };

  // 3k. Love: a pixel heart beats above the creature, then two small hearts float up and away while the
  // eyes go soft (a one-row squint) and the visor warms to flash. "I love you", in cells.
  const LOVE_PALETTE = [...echo.palette, '#ff6ad5', '#eafffb'];   // 7 pink, 8 flash
  const HEART = [[0, 1], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 3], [3, 2]];   // 4 rows x 5 cols
  const HEART_S = [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2], [2, 1]];                                          // 3 x 3
  function heart(g, r0, c0, cells, v) { const b = clone(g); for (const [r, c] of cells) if (b[r + r0] && b[r + r0][c + c0] === 0) set(b, r + r0, c + c0, v); return b; }
  const softEyes = g => { const b = clone(g); set(b, 6, 7, 3); set(b, 6, 13, 3); for (let r = 6; r <= 7; r++) for (let c = 6; c <= 14; c++) if (b[r][c] === 3) b[r][c] = 8; set(b, 7, 7, 2); set(b, 7, 13, 2); return b; };
  const love = {
    name: 'ECHO · love', key: 'echo_love', fwname: 'echo love', category: 'Mode',
    intent: 'Proposal. A heart beats over the creature, then two small hearts float up and off while the eyes go soft and the visor warms. The I-love-you.',
    palette: LOVE_PALETTE,
    frames: [
      {hold: 700, grid: echoPing(false)},
      {hold: 260, grid: heart(echoBase, 0, 8, HEART, 7)}, {hold: 200, grid: heart(bob(echoBase, -1), -1, 8, HEART, 7)},
      {hold: 260, grid: heart(echoBase, 0, 8, HEART, 7)}, {hold: 200, grid: heart(bob(echoBase, -1), -1, 8, HEART, 7)},
      {hold: 500, grid: heart(softEyes(echoBase), 0, 8, HEART, 7)},
      {hold: 220, grid: heart(heart(softEyes(echoBase), 2, 2, HEART_S, 7), 3, 15, HEART_S, 7)},
      {hold: 220, grid: heart(heart(softEyes(echoBase), 1, 1, HEART_S, 7), 2, 16, HEART_S, 7)},
      {hold: 220, grid: heart(heart(softEyes(echoBase), 0, 2, HEART_S, 7), 1, 15, HEART_S, 7)},
      {hold: 220, grid: heart(heart(softEyes(echoBase), -1, 1, HEART_S, 7), 0, 16, HEART_S, 7)},
      {hold: 900, grid: softEyes(echoPing(true))},
      {hold: 1100, grid: echoPing(false)},
    ],
  };

  // 3l. Consulting: the creature is in a conversation. A speech bubble to the right cycles three dots
  // (thinking), then fills with three short lines (talking) while the head nods, then the bubble clears
  // and the antenna pings once as if the advice landed. Loops with a rest.
  function bubble(g, content) {
    const b = clone(g);
    // bubble frame: rows 0..4, cols 12..19, with a tail toward the head at (5, 13)
    for (let c = 12; c <= 19; c++) { set(b, 0, c, 3); set(b, 4, c, 3); }
    for (let r = 1; r <= 3; r++) { set(b, r, 12, 3); set(b, r, 19, 3); }
    set(b, 5, 13, 3);
    if (content === 'dots1') set(b, 2, 14, 4);
    if (content === 'dots2') { set(b, 2, 14, 4); set(b, 2, 16, 4); }
    if (content === 'dots3') { set(b, 2, 14, 4); set(b, 2, 16, 4); set(b, 2, 18, 4); }
    if (content === 'lines') { for (const c of [14, 15, 16, 17]) set(b, 1, c, 4); for (const c of [14, 15, 16]) set(b, 2, c, 4); for (const c of [14, 15, 16, 17, 18]) set(b, 3, c, 4); }
    return b;
  }
  // the antenna sits at col 15 rows 1..3, inside the bubble; hide it while the bubble is up
  const noAntenna = g => { const b = clone(g); set(b, 1, 15, 0); set(b, 2, 15, 0); set(b, 3, 15, 0); return b; };
  const consult = {
    name: 'ECHO · consulting', key: 'echo_consult', fwname: 'echo consult', category: 'Active',
    intent: 'Proposal. In conversation: a speech bubble cycles three dots, fills with lines while the head nods, clears, and the antenna pings once as the advice lands.',
    palette: echo.palette,
    frames: [
      {hold: 600, grid: echoPing(false)},
      {hold: 260, grid: bubble(noAntenna(echoBase), 'dots1')}, {hold: 260, grid: bubble(noAntenna(echoBase), 'dots2')}, {hold: 260, grid: bubble(noAntenna(echoBase), 'dots3')},
      {hold: 260, grid: bubble(noAntenna(echoBase), 'dots1')}, {hold: 260, grid: bubble(noAntenna(echoBase), 'dots2')}, {hold: 260, grid: bubble(noAntenna(echoBase), 'dots3')},
      {hold: 500, grid: bubble(noAntenna(echoBase), 'lines')}, {hold: 220, grid: bubble(noAntenna(bob(echoBase, 1)), 'lines')},
      {hold: 500, grid: bubble(noAntenna(echoBase), 'lines')}, {hold: 220, grid: bubble(noAntenna(bob(echoBase, 1)), 'lines')},
      {hold: 500, grid: bubble(noAntenna(echoBase), 'lines')},
      {hold: 140, grid: echoBase}, {hold: 300, grid: echoPing(true)}, {hold: 1200, grid: echoPing(false)},
    ],
  };

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
  // bbox and eyeGeom scan the grid's own lattice (g.length), so they also work on a 40 or 60 cell grid.
  function bbox(g) {
    const n = g.length;
    let top = n, bot = -1, left = n, right = -1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c]) { top = Math.min(top, r); bot = Math.max(bot, r); left = Math.min(left, c); right = Math.max(right, c); }
    return {top, bot, left, right};
  }
  function eyeGeom(g) {
    const n = g.length;
    let rows = new Set(), cmin = n, cmax = -1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] === 2) { rows.add(r); cmin = Math.min(cmin, c); cmax = Math.max(cmax, c); }
    return {rows: [...rows], cmin, cmax};
  }
  // Anchor on the ARM ROW, the first row with 14 or more lit cells: particles (sleep Z's, surprise
  // sparks, bounce dust) shift a bounding box but can never fake a 14-wide run. The 2026-09-28 audit
  // found the bbox anchor jumping the visor, antenna and feet in six of the skinned movements.
  function anchor(g) {
    for (let r = 0; r < G; r++) {
      let n = 0, left = -1;
      for (let c = 0; c < G; c++) if (g[r][c]) { n++; if (left < 0) left = c; }
      if (n >= 14) return {row: r, left};
    }
    const bb = bbox(g); return {row: bb.top, left: bb.left};
  }
  function skinFrame(g, ref) {
    const b = clone(g);
    const A = anchor(g), R = anchor(ref.grid), rb = bbox(ref.grid);
    const dy = A.row - R.row, dx = A.left - R.left;
    // visor band on the reference eye rows, shifted with the body
    for (const r0 of ref.eyes.rows) {
      const r = r0 + dy;
      for (let c = ref.eyes.cmin - 1 + dx; c <= ref.eyes.cmax + 1 + dx; c++) if (r >= 0 && r < G && c >= 0 && c < G && b[r][c] === 1) b[r][c] = 3;
    }
    // no eyes in this frame (sleep): a closed-eye line on the lower band row, '222 333 222'
    if (eyeGeom(g).rows.length === 0 && ref.eyes.rows.length) {
      const r = ref.eyes.rows[ref.eyes.rows.length - 1] + dy;
      for (const c0 of [ref.eyes.cmin, ref.eyes.cmax]) for (let c = c0 - 1 + dx; c <= c0 + 1 + dx; c++) if (b[r] && b[r][c] === 3) b[r][c] = 2;
    }
    // antenna on the reference top-right column, shifted with the body
    let tc = -1; for (let c = G - 1; c >= 0; c--) if (ref.grid[rb.top][c] === 1) { tc = c; break; }
    if (tc >= 0) { const t = rb.top + dy, cc = tc + dx; set(b, t - 1, cc, 1); set(b, t - 2, cc, 1); set(b, t - 3, cc, 4); }
    // feet: the reference's bottom three rows, shifted
    for (let r = rb.bot - 2 + dy; r <= rb.bot + dy; r++) for (let c = 0; c < G; c++) if (b[r] && b[r][c] === 1) b[r][c] = 5;
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

  // 3o. Happy eyes: the eyes scrunch into > < chevrons (the visor grows up a row so a three-row
  // chevron fits) and blink back and forth with the plain eyes: a quick pair, then a long happy
  // hold with a bounce, then back. The echo skin blinks by painting the eye visor-colour, not body.
  function happyEyes(g) {
    const b = clone(g);
    for (let c = 6; c <= 14; c++) set(b, 5, c, 3);                          // visor grows a row
    set(b, 6, 7, 3); set(b, 7, 7, 3); set(b, 6, 13, 3); set(b, 7, 13, 3);   // plain eyes go
    for (const [r, c] of [[5, 6], [6, 7], [7, 6]])   set(b, r, c, 2);       // >
    for (const [r, c] of [[5, 14], [6, 13], [7, 14]]) set(b, r, c, 2);      // <
    return b;
  }
  const echoBlinkFrame = g => { const b = clone(g); set(b, 6, 7, 3); set(b, 6, 13, 3); return b; };
  const echoHappy = {
    name: 'ECHO · happy eyes', key: 'echo_happy', fwname: 'echo happy', category: 'Idle',
    intent: 'Proposal. The eyes scrunch into > < and blink back and forth with the plain eyes: a quick pair, a long happy hold with a bounce. Judge whether the chevrons read as eyes at 20 cells.',
    palette: echo.palette,
    frames: [
      {hold: 900, grid: echoPing(false)},
      {hold: 500, grid: happyEyes(echoBase)}, {hold: 260, grid: echoBase},
      {hold: 500, grid: happyEyes(echoBase)}, {hold: 260, grid: echoPing(true)},
      {hold: 700, grid: happyEyes(echoBase)}, {hold: 220, grid: happyEyes(bob(echoBase, -1))},
      {hold: 700, grid: happyEyes(echoBase)}, {hold: 220, grid: happyEyes(bob(echoBase, -1))},
      {hold: 900, grid: happyEyes(echoBase)},
      {hold: 60, grid: echoBlinkFrame(echoBase)}, {hold: 1300, grid: echoPing(false)},
    ],
  };

  // 3m. Loading bar: the visor goes dark around the open eyes and swallows them, and the band fills as a braille loading bar
  // in ping, top dot first, bottom dot one column behind, a flash cursor one cell ahead; then full, a flash, empty, eyes back.
  function echoLoadingFrame(mode, s) {                                    // only the band (rows 6..7, cols 6..14) and the antenna tip change
    const b = echoPing(false);                                            // antenna tip at rest
    const band = v => { for (const r of [6, 7]) for (let c = 6; c <= 14; c++) set(b, r, c, v); };
    if (mode === 'half') { set(b, 6, 7, 3); set(b, 6, 13, 3); }           // blink: only the lower eye cells stay dark
    if (mode === 'sink' || mode === 'track' || mode === 'bar') band(5);   // dark track
    if (mode === 'sink') for (const r of [6, 7]) { set(b, r, 7, 2); set(b, r, 13, 2); }   // the track closes round the eyes, still open
    if (mode === 'flash') band(7);
    if (mode === 'bar') {                                                 // s = 0..10, one column a frame
      for (let k = 0; k < Math.min(s, 9); k++) set(b, 6, 6 + k, 4);       // top dots lead
      for (let k = 0; k < Math.min(s - 1, 9); k++) set(b, 7, 6 + k, 4);   // bottom dots settle one column behind
      if (s <= 8) set(b, 6, 6 + s, 7);                                    // cursor one cell ahead, runs off the end at s 9
    }
    return b;
  }
  const echoLoading = {
    name: 'ECHO · loading bar', key: 'echo_loading', fwname: 'echo loading', category: 'Thinking',
    intent: 'Proposal. Working or planning: after one blink the visor goes dark around the open eyes, the eyes sink into it and the band is a braille loading bar, a dark track that fills left to right in ping one column a frame with the top dot first, the bottom dot settling one column behind and a flash cursor one cell ahead, then it holds full, flashes once, empties in one frame and the eyes come back with an antenna ping; the eyes are gone only while the band is the bar, so judge whether the staggered two row fill reads as a braille loading bar and not a wipe.',
    palette: [...echo.palette, '#eafffb'],   // 7 flash: the cursor and the completion flash
    frames: [
      {hold: 1000, grid: echoPing(false)},
      {hold: 120, grid: echoLoadingFrame('half')},
      {hold: 500, grid: echoPing(false)},
      {hold: 200, grid: echoLoadingFrame('sink')},                        // the visor turns track round the open eyes
      {hold: 300, grid: echoLoadingFrame('track')},                       // the eyes sink in: an empty bar
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(s => ({hold: 240, grid: echoLoadingFrame('bar', s)})),
      {hold: 600, grid: echoLoadingFrame('bar', 10)},                     // full, a beat
      {hold: 120, grid: echoLoadingFrame('flash')},
      {hold: 200, grid: echoLoadingFrame('track')},                       // empty in one frame
      {hold: 300, grid: echoPing(true)},                                  // eyes back, antenna ping
    ],
  };

  // 3x. Kiss, hand to visor: the right hand comes up to the right end of the visor and the right eye winks,
  // a small pink heart leaves the fingertips and floats off the top right while the visor warms, then rest.
  function kissA({arm = 0, wink = 0, kiss = false, at = null, warm = false} = {}) {
    let b = echoPing(false);
    if (arm) {                                                        // right arm up along col 17, as thumbsUp moves it
      for (let r = 7; r <= 10; r++) set(b, r, 17, 0);                // off the side (col 16 stays as the shoulder)
      for (let r = 7 - arm; r <= 9 - arm; r++) set(b, r, 17, 1);     // arm 1 rows 6..8 (on the way), arm 2 rows 5..7
      if (arm === 2) set(b, 6, 16, 1);                                // hand turned in on the visor row, beside its right end
    }
    if (wink) set(b, 6, 13, 3);                                       // right eye half: top cell goes visor, as the echo blink
    if (wink === 2) { set(b, 7, 12, 2); set(b, 7, 14, 2); }           // shut: the closed-eye line '222', as the skinned sleep
    if (kiss) set(b, 5, 16, 7);                                       // the kiss, pink at the fingertips
    if (at) b = heart(b, at[0], at[1], HEART_S, 7);                   // HEART_S top left at (row, col), clipped off the edge
    if (warm) for (const r of [6, 7]) for (let c = 6; c <= 14; c++) if (b[r][c] === 3) b[r][c] = 8;
    return b;
  }
  const echoKissA = {
    name: 'ECHO · kiss', key: 'echo_kiss', fwname: 'echo kiss', category: 'Mode',
    intent: 'Proposal. The right hand comes up to the right end of the visor and the right eye winks, a small pink heart leaves the fingertips and floats off the top right while the visor warms, then the arm drops and the antenna pings; judge whether the hand reads as touching the visor.',
    palette: LOVE_PALETTE,
    frames: [
      {hold: 1000, grid: echoPing(false)},
      {hold: 110, grid: kissA({arm: 1})},                                    // arm on its way up
      {hold: 240, grid: kissA({arm: 2})},                                    // hand at the right end of the visor
      {hold: 70,  grid: kissA({arm: 2, wink: 1})},                           // right eye half shut
      {hold: 360, grid: kissA({arm: 2, wink: 2})},                           // wink
      {hold: 280, grid: kissA({arm: 2, wink: 2, kiss: true})},               // the kiss: pink at the fingertips
      {hold: 200, grid: kissA({arm: 2, wink: 2, at: [3, 17], warm: true})},  // heart leaves the hand, visor warms
      {hold: 180, grid: kissA({arm: 2, wink: 2, at: [2, 17], warm: true})},
      {hold: 180, grid: kissA({arm: 2, wink: 1, at: [1, 17], warm: true})},  // eye opening
      {hold: 180, grid: kissA({arm: 2, at: [0, 18], warm: true})},           // off the top right corner
      {hold: 150, grid: kissA({arm: 2, at: [-1, 19]})},                      // last trace, visor cools
      {hold: 110, grid: kissA({arm: 1})},                                    // arm coming down
      {hold: 600, grid: echoPing(false)},
      {hold: 140, grid: echoPing(true)},
      {hold: 1100, grid: echoPing(false)},
    ],
  };

  // 3m. summon demon, variant A "the circle": the creature raises both arms, a red summoning circle
  // draws itself on the ground one segment at a time and pulses, its eyes flash red, a small horned
  // ember-eyed demon climbs out of the circle's right rim horns first, hovers with a little bob twice,
  // sinks back in, the circle fades segment by segment, arms come down and the antenna pings. A loud,
  // playful ritual whose rest state is plain arms-down idle. Helpers carry an A suffix so sibling
  // summon variants can be pasted into the same scope without a name clash.
  const SUMMON_PALETTE_A = [...echo.palette, '#e0665a', '#ffd166'];   // 7 ritual red, 8 demon ember
  const summonRestA = echoPing(false);                                 // arms-down rest, antenna tip off
  // both arms up, the way thumbsUp lifts the right arm: col 4 and col 16 become the body edge on rows
  // 7..9, the hanging arms (col 3 and col 17, rows 7..10) are cleared and raised up col 3 and col 17
  // from the shoulder row 7, hands turned out at row 2 (cols 2..3 and 17..18). Visor and eyes untouched.
  function summonArmsUpA(g) {
    const b = clone(g);
    for (let r = 7; r <= 9; r++) { set(b, r, 16, 1); set(b, r, 17, 0); set(b, r, 4, 1); set(b, r, 3, 0); }
    set(b, 10, 17, 0); set(b, 10, 3, 0);
    for (let r = 3; r <= 7; r++) { set(b, r, 17, 1); set(b, r, 3, 1); }         // arms up
    set(b, 2, 17, 1); set(b, 2, 18, 1); set(b, 2, 3, 1); set(b, 2, 2, 1);       // hands
    return b;
  }
  // halfway pose for the raise and the lower: arms rooted at the shoulder (row 7) up to row 5 with the
  // hands turned out, so the tween reads as a swing up rather than a jump.
  function summonArmsHalfA(g) {
    const b = clone(g);
    for (let r = 7; r <= 9; r++) { set(b, r, 16, 1); set(b, r, 17, 0); set(b, r, 4, 1); set(b, r, 3, 0); }
    set(b, 10, 17, 0); set(b, 10, 3, 0);
    for (let r = 5; r <= 7; r++) { set(b, r, 17, 1); set(b, r, 3, 1); }   // half raised, rooted at row 7
    set(b, 5, 18, 1); set(b, 5, 2, 1);                                    // hands
    return b;
  }
  // eyes flash: the upper cell of each eye flares ritual red while the lower cell stays dark (index 2),
  // so both eyes stay present and the visor band stays whole.
  function summonEyesRedA(g) { const b = clone(g); set(b, 6, 7, 7); set(b, 6, 13, 7); return b; }
  // summoning circle on rows 17..19, cols 4..16: an oval ring in three segments (front arc, side edges,
  // back arc + two inner marks). Drawn and faded one segment per frame; the colour pulses between 7 and 8.
  const SUMMON_RING_A = [
    [[19, 6], [19, 7], [19, 8], [19, 9], [19, 10], [19, 11], [19, 12], [19, 13], [19, 14]],                    // 0 front arc
    [[18, 4], [18, 5], [18, 15], [18, 16]],                                                                    // 1 side edges
    [[17, 6], [17, 7], [17, 8], [17, 9], [17, 10], [17, 11], [17, 12], [17, 13], [17, 14], [18, 9], [18, 11]], // 2 back arc + marks
  ];
  function summonCircleA(g, n, color) {
    const b = clone(g);
    for (let s = 0; s < n && s < SUMMON_RING_A.length; s++) for (const [r, c] of SUMMON_RING_A[s]) set(b, r, c, color);
    return b;
  }
  // little demon, 3 wide by 4 tall at cols 17..19: one clear column off the body and the right foot
  // (col 15), so it reads as its own creature and not as a red growth on the flank. Rows below the
  // circle's rim (row 18) are not drawn, so it climbs out horns first and sinks back the same way.
  const DEMON_A = [[0, 0, 7], [0, 2, 7], [1, 0, 7], [1, 1, 7], [1, 2, 7], [2, 0, 8], [2, 1, 7], [2, 2, 8], [3, 0, 7], [3, 1, 7], [3, 2, 7]];   // horns, head, ember eyes, lower body
  function summonDemonA(g, top) { const b = clone(g); for (const [dr, dc, v] of DEMON_A) if (top + dr <= 18) set(b, top + dr, 17 + dc, v); return b; }
  const summonUpA = summonArmsUpA(summonRestA);
  const echoSummonA = {
    name: 'ECHO · summon demon', key: 'echo_summon', fwname: 'echo summon', category: 'Mode',
    intent: 'Proposal. Both arms rise, a red circle draws itself on the ground and pulses, the eyes flash red and a small horned demon climbs out of the circle, bobs, and sinks back before the circle fades and the arms come down; judge whether it reads as one playful ritual and still as this creature.',
    palette: SUMMON_PALETTE_A,
    frames: [
      {hold: 800, grid: summonRestA},                                            // rest (loop anchor)
      {hold: 160, grid: summonArmsHalfA(summonRestA)},                           // begin raise
      {hold: 220, grid: summonUpA},                                              // arms up
      {hold: 190, grid: summonCircleA(summonUpA, 1, 7)},                         // circle: front arc
      {hold: 190, grid: summonCircleA(summonUpA, 2, 7)},                         // circle: side edges
      {hold: 200, grid: summonCircleA(summonUpA, 3, 7)},                         // circle full
      {hold: 150, grid: summonCircleA(summonUpA, 3, 8)},                         // circle pulse (bright)
      {hold: 150, grid: summonCircleA(summonUpA, 3, 7)},                         // circle pulse (back)
      {hold: 150, grid: summonEyesRedA(summonCircleA(summonUpA, 3, 8))},         // eyes flash red, circle bright
      {hold: 150, grid: summonEyesRedA(summonCircleA(summonUpA, 3, 7))},         // eyes still red, circle back
      {hold: 150, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 17)},       // horns break the rim
      {hold: 150, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 16)},       // head and ember eyes out
      {hold: 150, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 15)},       // standing on the rim
      {hold: 150, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 14)},       // rise
      {hold: 150, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 13)},       // rise
      {hold: 150, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 12)},       // rise
      {hold: 300, grid: summonDemonA(summonCircleA(summonUpA, 3, 8), 11)},       // hover up (pulse)
      {hold: 220, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 12)},       // bob down 1
      {hold: 300, grid: summonDemonA(summonCircleA(summonUpA, 3, 8), 11)},       // hover up (pulse)
      {hold: 220, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 12)},       // bob down 2
      {hold: 300, grid: summonDemonA(summonCircleA(summonUpA, 3, 8), 11)},       // hover up (pulse, last)
      {hold: 130, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 13)},       // drop
      {hold: 130, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 15)},       // drop onto the rim
      {hold: 130, grid: summonDemonA(summonCircleA(summonUpA, 3, 7), 17)},       // sinking, horns and head left
      {hold: 200, grid: summonCircleA(summonUpA, 3, 7)},                         // demon gone, circle full
      {hold: 160, grid: summonCircleA(summonUpA, 2, 7)},                         // fade back arc + marks
      {hold: 160, grid: summonCircleA(summonUpA, 1, 7)},                         // fade side edges
      {hold: 160, grid: summonUpA},                                              // circle gone, arms up
      {hold: 160, grid: summonArmsHalfA(summonRestA)},                           // arms lowering
      {hold: 200, grid: echoPing(true)},                                         // arms down, antenna pings
      {hold: 600, grid: summonRestA},                                            // rest (loops to frame 0)
    ],
  };
  // Rework (operator, 2026-09-28: "more demon looking with horns, or more demons coming out"): both.
  // The demon grows taller horns (two rows, tips apart, bases on the head) and after the first one is
  // up, two more climb out: one at the circle's left rim, one at the front over the creature's feet.
  // All three hover and bob together before sinking back in the order they came.
  const DEMON_H = [[0, 0, 7], [0, 2, 7], [1, 0, 7], [1, 1, 7], [1, 2, 7], [2, 0, 7], [2, 1, 7], [2, 2, 7],
                   [3, 0, 8], [3, 1, 7], [3, 2, 8], [4, 0, 7], [4, 1, 7], [4, 2, 7]];   // horn tips, horn bases + crown, head, ember eyes, body
  function demonAt(g, top, col, rim) { const b = clone(g); for (const [dr, dc, v] of DEMON_H) if (top + dr <= rim) set(b, top + dr, col + dc, v); return b; }
  const ring = (n, c) => summonCircleA(summonUpA, n, c);
  const trio = (t1, t2, t3, c) => { let g = ring(3, c); if (t1 != null) g = demonAt(g, t1, 17, 18); if (t2 != null) g = demonAt(g, t2, 1, 18); if (t3 != null) g = demonAt(g, t3, 9, 19); return g; };
  echoSummonA.intent = 'Proposal. Both arms rise, a red circle draws itself and pulses, the eyes flash red, a horned demon climbs out of the circle, then two more follow (left rim, front), all three hover and bob, then sink back in turn before the circle fades; judge whether the horns read and whether three demons are too many.';
  echoSummonA.frames = [
    {hold: 800, grid: summonRestA},
    {hold: 160, grid: summonArmsHalfA(summonRestA)},
    {hold: 220, grid: summonUpA},
    {hold: 190, grid: ring(1, 7)}, {hold: 190, grid: ring(2, 7)}, {hold: 200, grid: ring(3, 7)},
    {hold: 150, grid: ring(3, 8)}, {hold: 150, grid: ring(3, 7)},
    {hold: 150, grid: summonEyesRedA(ring(3, 8))}, {hold: 150, grid: summonEyesRedA(ring(3, 7))},
    {hold: 140, grid: trio(17, null, null, 7)}, {hold: 140, grid: trio(15, null, null, 7)}, {hold: 140, grid: trio(13, null, null, 7)}, {hold: 140, grid: trio(11, null, null, 7)},
    {hold: 260, grid: trio(10, null, null, 8)},
    {hold: 140, grid: trio(10, 17, null, 7)}, {hold: 140, grid: trio(11, 15, null, 7)}, {hold: 140, grid: trio(10, 13, null, 7)},
    {hold: 260, grid: summonEyesRedA(trio(10, 12, null, 8))},
    {hold: 140, grid: trio(10, 12, 18, 7)}, {hold: 140, grid: trio(11, 13, 16, 7)}, {hold: 140, grid: trio(10, 12, 14, 7)},
    {hold: 300, grid: summonEyesRedA(trio(10, 12, 13, 8))},
    {hold: 220, grid: trio(11, 13, 14, 7)}, {hold: 300, grid: summonEyesRedA(trio(10, 12, 13, 8))},
    {hold: 220, grid: trio(11, 13, 14, 7)}, {hold: 300, grid: summonEyesRedA(trio(10, 12, 13, 8))},
    {hold: 130, grid: trio(13, 12, 13, 7)}, {hold: 130, grid: trio(16, 14, 13, 7)}, {hold: 130, grid: trio(null, 17, 15, 7)},
    {hold: 130, grid: trio(null, null, 17, 7)}, {hold: 130, grid: trio(null, null, 19, 7)},
    {hold: 200, grid: ring(3, 7)}, {hold: 160, grid: ring(2, 7)}, {hold: 160, grid: ring(1, 7)},
    {hold: 160, grid: summonUpA}, {hold: 160, grid: summonArmsHalfA(summonRestA)},
    {hold: 600, grid: summonRestA},
  ];

  // 3x. kiss (pucker): no arm move. The eyes go soft and a two cell pink pucker holds just under the visor
  // centre; on the mwah the body hops a row, the antenna pings and a heart and two pink sparks stream off up and right.
  const kissBFace = (ping, pucker) => {                                   // soft eyes and warm visor, pucker optional
    const g = softEyes(echoPing(ping));
    if (pucker) { set(g, 9, 10, 7); set(g, 9, 11, 7); }                   // one body row under the band, so it reads as lips
    return g;
  };
  const kissBHearts = (g, list) => list.reduce((b, [r, c, cells]) => heart(b, r, c, cells, 7), g);
  const KISS_B_DOT = [[0, 0]];                                            // a spark is one pink cell
  // Everything moves one cell up and one right per step. The heart pops beside the head on the hop and
  // slides off the right edge, clipped by the lattice (heart() skips cells past the edge); two sparks follow
  // it off the cheek, a step apart, and leave at the same edge, so nothing vanishes mid air.
  const echoKissB = {
    name: 'ECHO · kiss (pucker)', key: 'echo_kiss_b', fwname: 'echo kiss b', category: 'Mode',
    intent: 'Proposal. Face only, no arm: the eyes go soft and a two cell pink pucker holds under the visor, then a hop and an antenna ping send a small heart and two pink sparks off up and to the right; judge whether the two cell pucker reads as a kiss.',
    palette: LOVE_PALETTE,
    frames: [
      {hold: 800, grid: echoPing(false)},
      {hold: 380, grid: kissBFace(false, false)},                                                           // eyes soften
      {hold: 700, grid: kissBFace(false, true)},                                                            // the pucker, a beat
      {hold: 200, grid: kissBHearts(bob(kissBFace(true, true), -1), [[3, 16, HEART_S]])},                   // mwah: hop, ping, a heart pops
      {hold: 200, grid: kissBHearts(kissBFace(false, false), [[2, 17, HEART_S], [5, 16, KISS_B_DOT]])},
      {hold: 200, grid: kissBHearts(kissBFace(false, false), [[1, 18, HEART_S], [4, 17, KISS_B_DOT], [6, 16, KISS_B_DOT]])},   // the heart slides off the edge
      {hold: 200, grid: kissBHearts(kissBFace(false, false), [[0, 19, HEART_S], [3, 18, KISS_B_DOT], [5, 17, KISS_B_DOT]])},   // its last sliver
      {hold: 200, grid: kissBHearts(kissBFace(false, false), [[2, 19, KISS_B_DOT], [4, 18, KISS_B_DOT]])},
      {hold: 200, grid: kissBHearts(kissBFace(false, false), [[3, 19, KISS_B_DOT]])},
      {hold: 500, grid: kissBFace(false, false)},                                                           // afterglow
      {hold: 1400, grid: echoPing(false)},
    ],
  };

  // 3x. Braille eye spin: each eye becomes a 2x3 braille cell (rows 5..7, the visor grown up a row as in
  // happy eyes) and two adjacent dark dots run clockwise round its six dots, both eyes in step on one glyph.
  const EYE_SPIN_DOTS = [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [1, 0]];   // braille dots 1 4 5 6 3 2: clockwise from top left, the turn of ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
  // Grown visor (rows 5..7, cols 6..14), both cells (cols 6..7 and 13..14) on glyph k: dots k and k + 1 of the ring.
  // From the bottom pair the eyes show ⠤ ⠆ ⠃ ⠉ ⠘ ⠰ and round again.
  const eyeSpinFace = (g, k) => {
    const b = clone(g);
    for (let r = 5; r <= 7; r++) for (let c = 6; c <= 14; c++) set(b, r, c, 3);
    for (const c0 of [6, 13]) for (const j of [k, k + 1]) { const [dr, dc] = EYE_SPIN_DOTS[j % 6]; set(b, 5 + dr, c0 + dc, 2); }
    return b;
  };
  // The visor settles back to two rows with the eyes still on the bottom pair.
  const eyeSpinSettle = g => { const b = eyeSpinFace(g, 3); for (let c = 6; c <= 14; c++) set(b, 5, c, g[5][c]); return b; };
  const echoEyeSpin = {
    name: 'ECHO · eye spin', key: 'echo_eye_spin', fwname: 'echo eye spin', category: 'Thinking',
    intent: 'Proposal. Thinking in braille: after a half blink the visor grows up a row and each eye becomes a 2x3 braille cell whose two dark dots, the eyes in every spin frame, run clockwise like the terminal spinner, both eyes in step on the same glyph, 90 ms a step for two full turns, then the visor settles and a second half blink brings the eyes back with an antenna ping; judge whether the spinning pairs still read as eyes at 20 cells.',
    palette: echo.palette,
    frames: [
      {hold: 2300, grid: echoPing(false)},                                  // rest: plain eyes, antenna tip unlit
      {hold: 70, grid: echoBlinkFrame(echoPing(false))},                    // half blink
      {hold: 200, grid: eyeSpinFace(echoPing(false), 3)},                   // visor grows a row, the eyes drop to the bottom pair
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(k => ({hold: 90, grid: eyeSpinFace(echoPing(false), k)})),   // twelve steps: two full turns, back on the bottom pair
      {hold: 200, grid: eyeSpinSettle(echoPing(false))},                    // visor settles
      {hold: 70, grid: echoBlinkFrame(echoPing(false))},                    // second half blink, the eyes opening
      {hold: 240, grid: echoPing(true)},                                    // eyes back, antenna ping
    ],
  };

  // 3x. Using OpenClaw: a small red crab (the operator's multi-agent framework, played as the animal) scuttles
  // in along the ground, climbs the creature's left side, crosses the top of its head, waves its claws up
  // there, comes down the right side and leaves. The creature's eyes follow it. Crab: 5 wide, 3 tall: two
  // raised claws, a body with two ember eyes, three legs; legs and claws alternate to read as scuttling.
  // Crab, 7 wide by 4 tall: eye stalks (ember) on top, a wide body, a pincer either side that opens and
  // closes, four legs that alternate. Painted over whatever it walks on.
  const CRAB_A = [[0, 1, 8], [0, 5, 8], [1, 0, 7], [1, 2, 7], [1, 3, 7], [1, 4, 7], [1, 6, 7],
                  [2, 0, 7], [2, 1, 7], [2, 2, 7], [2, 3, 7], [2, 4, 7], [2, 5, 7], [2, 6, 7],
                  [3, 1, 7], [3, 3, 7], [3, 5, 7]];                                        // pincers open, legs in
  const CRAB_B = [[0, 1, 8], [0, 5, 8], [1, 1, 7], [1, 2, 7], [1, 3, 7], [1, 4, 7], [1, 5, 7],
                  [2, 0, 7], [2, 1, 7], [2, 2, 7], [2, 3, 7], [2, 4, 7], [2, 5, 7], [2, 6, 7],
                  [3, 0, 7], [3, 2, 7], [3, 4, 7], [3, 6, 7]];                              // pincers closed, legs out
  function crabAt(g, r0, c0, phase) {
    const b = clone(g);
    for (const [r, c, v] of (phase ? CRAB_B : CRAB_A)) set(b, r0 + r, c0 + c, v);
    return b;
  }
  // The eyes slide one cell toward the crab (left, centre or right) without leaving the visor.
  function eyesToward(g, dir) {
    const b = clone(g);
    for (const c of [7, 13]) for (const r of [6, 7]) set(b, r, c, 3);
    for (const c of [7 + dir, 13 + dir]) for (const r of [6, 7]) set(b, r, c, 2);
    return b;
  }
  // Path of the crab's top-left corner (7x4): along the ground under the feet, up the left side over
  // the arm, across the top of the head (rows 0..3 sit on the head, the antenna gets walked over),
  // a pause on top, down the right side, off the edge.
  const CRAB_PATH = [
    [16, 15, 0], [16, 13, 0], [16, 11, 0], [16, 9, 0], [16, 7, -1], [16, 5, -1], [16, 3, -1], [16, 1, -1],
    [13, 0, -1], [10, 0, -1], [7, 0, -1], [4, 0, -1], [1, 0, -1],
    [0, 3, -1], [0, 6, 0], [0, 6, 0], [0, 6, 0], [0, 9, 0], [0, 12, 1],
    [2, 13, 1], [5, 13, 1], [8, 13, 1], [11, 13, 1], [14, 13, 1], [16, 13, 1], [16, 15, 1], [16, 17, 0], [16, 19, 0],
  ];
  // Nano claw: a 3x2 crab (two claws over a body with one ember eye) that skitters the same route
  // at twice the pace, steps of three cells, and never pauses. The small fast one.
  const NANO_A = [[0, 0, 7], [0, 2, 7], [1, 0, 7], [1, 1, 8], [1, 2, 7]];
  const NANO_B = [[0, 1, 7], [1, 0, 7], [1, 1, 8], [1, 2, 7]];
  function nanoAt(g, r0, c0, phase) {
    const b = clone(g);
    for (const [r, c, v] of (phase ? NANO_B : NANO_A)) set(b, r0 + r, c0 + c, v);
    return b;
  }
  const NANO_PATH = [
    [17, 17, 0], [17, 14, 0], [17, 11, 0], [17, 8, -1], [17, 5, -1], [17, 2, -1],
    [14, 0, -1], [11, 0, -1], [8, 0, -1], [5, 0, -1], [2, 0, -1],
    [2, 3, -1], [2, 6, 0], [2, 9, 0], [2, 12, 1], [2, 15, 1],
    [5, 17, 1], [8, 17, 1], [11, 17, 1], [14, 17, 1], [17, 17, 1], [17, 19, 0],
  ];
  const echoNanoclaw = {
    name: 'ECHO · nanoclaw', key: 'echo_nanoclaw', fwname: 'echo nanoclaw', category: 'Active',
    intent: 'Proposal. The nano claw: a tiny red crab skitters the crab route at speed, no pauses, the eyes barely keeping up; judge whether three cells still read as a crab.',
    palette: [...echo.palette, '#e5443a', '#ffd166'],
    frames: [
      {hold: 700, grid: echoPing(false)},
      ...NANO_PATH.map(([r, c, dir], i) => ({hold: 80, grid: nanoAt(eyesToward(echoPing(i % 5 === 0), dir), r, c, i % 2)})),
      {hold: 120, grid: echoPing(true)}, {hold: 900, grid: echoPing(false)},
    ],
  };
  // 3x. Pizza: a slice held in front of the chest, tip toward the mouth (crust amber, cheese light,
  // three pepperoni). It lifts to the visor, the eyes squint, a bite takes the tip, two chew bobs,
  // again, again, then the crust goes too and the eyes go > < for a beat. A new slice arrives.
  const PIZZA_FULL = [[8, 16, 9], [8, 17, 7], [9, 14, 9], [9, 15, 8], [9, 16, 9], [9, 17, 7],
                      [10, 13, 9], [10, 14, 8], [10, 15, 9], [10, 16, 9], [10, 17, 7], [11, 15, 9], [11, 16, 8], [11, 17, 7]];
  function pizzaAt(g, bites, lift) {
    const b = clone(g);
    const minCol = 13 + bites * 2;                           // each bite takes two columns off the tip
    for (const [r, c, v] of PIZZA_FULL) if (c >= minCol) set(b, r - lift, c, v);
    if (bites < 3) set(b, 12 - lift, 16, 1);                 // the hand under the slice
    return b;
  }
  const squint = g => { const b = clone(g); set(b, 6, 7, 3); set(b, 6, 13, 3); return b; };
  const chew = (g, k) => bob(g, k % 2 ? -1 : 0);
  const echoPizza = {
    name: 'ECHO · pizza', key: 'echo_pizza', fwname: 'echo pizza', category: 'Idle',
    intent: 'Proposal. Eating a slice: lift to the visor, squint, bite, chew, three times until only the crust is left, then happy eyes and a new slice; judge whether the slice reads as pizza and whether the bites read.',
    palette: [...echo.palette, '#e0b25a', '#e5443a', '#ffd166'],   // 7 crust, 8 pepperoni, 9 cheese
    frames: [
      {hold: 800, grid: echoPing(false)},
      {hold: 600, grid: pizzaAt(echoBase, 0, 0)},
      {hold: 260, grid: pizzaAt(squint(echoBase), 0, 2)},
      {hold: 220, grid: pizzaAt(squint(echoBase), 1, 2)},
      {hold: 150, grid: chew(pizzaAt(echoBase, 1, 0), 1)}, {hold: 150, grid: chew(pizzaAt(echoBase, 1, 0), 0)}, {hold: 150, grid: chew(pizzaAt(echoBase, 1, 0), 1)},
      {hold: 400, grid: pizzaAt(echoPing(true), 1, 0)},
      {hold: 260, grid: pizzaAt(squint(echoBase), 1, 2)},
      {hold: 220, grid: pizzaAt(squint(echoBase), 2, 2)},
      {hold: 150, grid: chew(pizzaAt(echoBase, 2, 0), 1)}, {hold: 150, grid: chew(pizzaAt(echoBase, 2, 0), 0)}, {hold: 150, grid: chew(pizzaAt(echoBase, 2, 0), 1)},
      {hold: 400, grid: pizzaAt(echoBase, 2, 0)},
      {hold: 260, grid: pizzaAt(squint(echoBase), 2, 2)},
      {hold: 220, grid: pizzaAt(squint(echoBase), 3, 2)},
      {hold: 150, grid: chew(echoBase, 1)}, {hold: 150, grid: chew(echoBase, 0)}, {hold: 150, grid: chew(echoBase, 1)},
      {hold: 900, grid: happyEyes(echoPing(true))},
      {hold: 700, grid: echoPing(false)},
    ],
  };
  const echoOpenclaw = {
    name: 'ECHO · openclaw', key: 'echo_openclaw', fwname: 'echo openclaw', category: 'Active',
    intent: 'Proposal. A small red crab scuttles in, climbs the left side, crosses the top of the head waving its claws, comes down the right side and leaves while the eyes follow it; judge whether it reads as a crab at 20 cells and whether the eye tracking sells it.',
    palette: [...echo.palette, '#e5443a', '#ffd166'],   // 7 crab red, 8 crab eyes
    frames: [
      {hold: 900, grid: echoPing(false)},
      ...CRAB_PATH.map(([r, c, dir], i) => ({hold: (r === 0 && c === 6) ? 240 : 170, grid: crabAt(eyesToward(echoPing(i % 6 === 0), dir), r, c, i % 2)})),
      {hold: 140, grid: echoPing(true)}, {hold: 1100, grid: echoPing(false)},
    ],
  };

  // 3x. Headphones: the ECHO edition of the operator's headphones reference. A light band arcs over the head
  // onto two dark cups, the visor goes soft to listen, a glitch lands the drop, then four beats: the body dips a
  // row on each with the antenna pinging, a note rises out of the right cup and off the top. Eyes open, rest.
  const echoHeadphones = {
    name: 'ECHO · headphones', key: 'echo_headphones', fwname: 'echo headphones', category: 'Idle',
    intent: 'Proposal. Headphones on and the visor goes soft to listen (eyes one row, visor warm), a glitch lands the drop, the body dips a row on four beats with the antenna pinging on each while a note rises out of the right cup, then the eyes open between tracks; judge whether band and cups read as headphones at 20 cells.',
    palette: [...echo.palette, '#2f5fd6', '#eafffb'],   // 7 cup (blue, as in the reference: reads apart from the teal body), 8 band (flash, also softEyes' warm visor); the note is visor teal (3)
    frames: [],
  };
  {
    // Band: row 3 over the head (cols 6..14), stepping down at each end on row 4 (cols 4..5 and 15..16) so it lands
    // on the cups; the antenna keeps col 15 above row 4 and stands beside the band. Cups: 2 x 4, rows 5..8, cols 3..4
    // and 16..17, over the top of the arm nubs, which still show below them (rows 9..10) as in the reference.
    const wear = g => {
      const b = clone(g);
      for (let c = 6; c <= 14; c++) set(b, 3, c, 8);
      for (const c of [4, 5, 15, 16]) set(b, 4, c, 8);
      for (let r = 5; r <= 8; r++) for (const c of [3, 4, 16, 17]) set(b, r, c, 7);
      return b;
    };
    // The beat: the body (rows 0..13, headphones included) sinks one row onto its legs; the feet stay planted.
    const dip = g => {
      const b = empty();
      for (let r = 15; r < G; r++) b[r] = g[r].slice();
      for (let r = 0; r <= 13; r++) for (let c = 0; c < G; c++) if (g[r][c]) set(b, r + 1, c, g[r][c]);
      return b;
    };
    // echoGlitch on this pose: rows 6..8 slip right one cell and the visor, teal or warm, paints in ping.
    const glitch = g => {
      const b = clone(g);
      for (const r of [6, 7, 8]) { const row = b[r].slice(); for (let c = G - 1; c > 0; c--) b[r][c] = row[c - 1]; b[r][0] = 0; }
      for (const r of [6, 7]) for (let c = 0; c < G; c++) if (b[r][c] === 3 || b[r][c] === 8) b[r][c] = 6;
      return b;
    };
    // An eighth note (flag, stem, head), 3 x 3 like HEART_S, drawn only on empty cells; top row r0, cols 17..19.
    // Visor teal (3), not the band's flash: its head touches the band's right step on the corner as it leaves the
    // cup, and in the same colour the two read as one shape (the band growing a zigzag instead of a note).
    const NOTE = [[0, 1], [0, 2], [1, 1], [2, 0], [2, 1]];
    const note = (g, r0) => { const b = clone(g); for (const [r, c] of NOTE) if (b[r + r0] && b[r + r0][c + 17] === 0) set(b, r + r0, c + 17, 3); return b; };
    const rest = wear(echoPing(false));
    const up = wear(softEyes(echoPing(false)));
    const down = dip(wear(softEyes(echoPing(true))));
    echoHeadphones.frames.push(
      {hold: 700, grid: up},                                                              // listening, the build
      {hold: 60, grid: glitch(wear(softEyes(echoPing(true)))), glitch: true},            // the drop
      {hold: 200, grid: note(down, 2)}, {hold: 200, grid: note(up, 1)}, {hold: 200, grid: note(up, 0)},   // beat 1: the note leaves the cup
      {hold: 200, grid: note(down, -1)}, {hold: 200, grid: note(up, -2)}, {hold: 200, grid: up},          // beat 2: off the top
      {hold: 200, grid: down}, {hold: 400, grid: up},                                     // beat 3
      {hold: 200, grid: down}, {hold: 1000, grid: up},                                    // beat 4, then the tail
      {hold: 1400, grid: rest},                                                           // eyes open between tracks
    );
  }

  // 3x. Headphones: stock Clawd in big blue over ear cups on a white band (operator reference, cc1), eyes closed
  // and content, nodding on the beat while notes float up off the right side; one held beat, one eye half opens.
  const hpBase = (() => {
    const b = clone(BASE);
    for (let c = 5; c <= 15; c++) set(b, 3, c, 4);                                  // band over the head
    set(b, 4, 4, 4); set(b, 4, 16, 4);                                               // band ends drop to the cups
    // cups on the head's edge columns, as in cc1: the arms keep their outer column (3, 17) and stick out past
    // them, so the stock step from the narrower head to the wider arms stays at row 7
    for (let r = 5; r <= 8; r++) for (const c of [4, 5, 15, 16]) set(b, r, c, 3);
    return b;
  })();
  // Closed and content, as in the reference: a U per eye, ends on row 6 and middle on row 7. peek leaves the
  // col 13 eye (the note side) half open: the one cell the stock blink passes through.
  function hpEyes(g, peek) {
    const b = clone(g);
    for (const c of [7, 13]) { set(b, 6, c - 1, 2); set(b, 6, c, 1); set(b, 6, c + 1, 2); set(b, 7, c, 2); }
    if (peek) { set(b, 6, 12, 1); set(b, 6, 14, 1); }
    return b;
  }
  // The nod: rows 0..13 (band, head, cups, arms) drop one row onto planted legs, which read a row shorter.
  const hpDip = g => { const b = clone(g); for (let r = 14; r >= 1; r--) b[r] = g[r - 1].slice(); b[0] = new Array(G).fill(0); return b; };
  // Quarter note (stem right, head below), 2 wide and 3 tall, in the note colour (6). It starts at cup height off
  // the right side, against the hand, rises up the right edge and drifts a column left once clear of the band, then
  // off the top; painted only on empty cells, and never touching the band, which is nearly the same white.
  const HP_NOTE = [[0, 1], [1, 1], [2, 0], [2, 1]];
  const HP_PATH = [[6, 18], [5, 18], [4, 18], [3, 18], [2, 18], [1, 18], [0, 17], [-1, 17], [-2, 17]];
  function hpNote(g, k) {
    const b = clone(g);
    if (k >= 0 && k < HP_PATH.length) for (const [r, c] of HP_NOTE) {
      const rr = HP_PATH[k][0] + r, cc = HP_PATH[k][1] + c;
      if (b[rr] && b[rr][cc] === 0) set(b, rr, cc, 6);
    }
    return b;
  }
  // Frame i of 16: beats of rest (even, 500 ms) then nod (odd, 260 ms). The cycle is read from two frames in (j), so
  // frame 0, the still, holds one whole note off the right side. Beat 7 of the cycle (j 12, 13) holds instead of nodding
  // while the eye peeks. A note leaves every 8 frames (j 0, 8) on a 9 step path; its last step shares the next one's first.
  function hpFrame(i) {
    const j = (i + 2) % 16, peek = (j >> 1) === 6, nod = j % 2 === 1 && !peek;
    const g = nod ? hpDip(hpEyes(hpBase, false)) : hpEyes(hpBase, peek);
    return hpNote(hpNote(g, j % 8), j % 8 + 8);
  }
  const clawdHeadphones = {
    name: 'Clawd · headphones', key: 'clawd_headphones', fwname: 'headphones', category: 'Idle',
    intent: 'Proposal. Eyes closed and content under big blue cups on a white band, it nods on every beat while notes float up off the right side, and on one held beat the eye on that side half opens and closes again; judge the tempo and whether the cups read as headphones at 20 cells.',
    palette: ['transparent', '#D97757', '#0f0f0f', '#2f5fd6', '#f4f7fb', '#0f0f0f', '#eafffb'],   // 5 is an unused filler, per the brief's index map
    frames: Array.from({length: 16}, (_, i) => ({hold: i % 2 ? 260 : 500, grid: hpFrame(i)})),
  };

  // 3x. summon demon HD: the echo summon ritual on a 60 cell lattice (size 60, 8 px cells on the 480 panel).
  // Every creature pose is a 20 cell summon A pose repeated exactly 3 times across and down, so silhouette,
  // visor and eyes are the family's own and the new detail lives around and in front of it. A double ring on
  // the ground (rows 45 to 59, centred under the body on col 31) draws itself from the front round both
  // sides, a pentagon joins five points inside it, a rune on each point lights one at a time, the ring pulses,
  // flames lick round its sides and back and a red glint sits in each eye while it burns; the eyes flash red.
  // Then a demon (13 wide at the horns, 21 with the wings out, 20 tall from horn tips to feet: curved ember
  // horns, ember eyes under angry brows, a toothy grin, bat wings that flap on alternate frames, a hanging tail
  // whose spade tip sways) rises out of the ring centre in front of the creature, hovers over a glow on the
  // ground while the glints drop to watch it, sinks back, the circle fades and the arms come down. The ground,
  // glow included, is painted only on empty cells, so the back of the ring passes behind the legs; the demon is
  // the one thing drawn over the creature, never above row 25, and the glint only turns an eye cell red, so
  // the visor and both eyes stay whole in every frame.
  const SUMMON_PALETTE_HD = [...echo.palette, '#e5443a', '#ffd166', '#5a0f1a'];   // 7 red, 8 ember, 9 dark red
  const echoSummonHd = {
    name: 'ECHO · summon demon HD', key: 'echo_summon_hd', fwname: 'echo summon hd', category: 'Mode', size: 60,
    intent: 'Proposal, 60 cell lattice. The summon ritual at 8 px cells: the arms rise, a double ring draws itself on the ground from the front round both sides, a pentagon joins five points inside it, a rune on each point lights one at a time, the ring pulses with flames licking round it and the eyes flash red with a red glint, then a horned demon with ember eyes, a grin, flapping bat wings and a swaying spade tail rises out of the ring in front of the creature and hovers over its glow while the glints drop to watch it, and sinks back before the circle fades and the arms come down; judge whether the extra detail reads on the panel and whether it is still this creature.',
    palette: SUMMON_PALETTE_HD,
    frames: [],
  };
  {
    const N = 60, CR = 52, CC = 31, CLIP = 52;                 // lattice, ring centre (row, col), portal line
    const RED = 7, EMBER = 8, DARK = 9;
    // The creature at 3x: each 20 cell repeated 3 times across and down, rows never shared.
    const upscaleHd = (g, k) => {
      const out = [];
      for (const row of g) { const wide = []; for (const v of row) for (let j = 0; j < k; j++) wide.push(v); for (let i = 0; i < k; i++) out.push(wide.slice()); }
      return out;
    };
    const blankHd = () => Array.from({length: N}, () => new Array(N).fill(0));
    const putHd = (g, r, c, v) => { if (r >= 0 && r < g.length && c >= 0 && c < g.length) g[r][c] = v; return g; };
    const lineHd = (g, r0, c0, r1, c1, v) => {
      let dx = Math.abs(c1 - c0), sx = c0 < c1 ? 1 : -1, dy = -Math.abs(r1 - r0), sy = r0 < r1 ? 1 : -1, err = dx + dy;
      for (;;) { putHd(g, r0, c0, v); if (r0 === r1 && c0 === c1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; c0 += sx; } if (e2 <= dx) { err += dx; r0 += sy; } }
    };
    // Midpoint ellipse round the ring centre: a clean one cell outline, each cell tagged with its angular
    // distance from the front centre (0) round either side to the back centre (1), so a ring can draw itself.
    const ellipseHd = (ry, rx) => {
      const q = [], rx2 = rx * rx, ry2 = ry * ry;
      let x = 0, y = ry, px = 0, py = 2 * rx2 * y, p = ry2 - rx2 * ry + 0.25 * rx2;
      q.push([x, y]);
      while (px < py) { x++; px += 2 * ry2; if (p < 0) p += ry2 + px; else { y--; py -= 2 * rx2; p += ry2 + px - py; } q.push([x, y]); }
      p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
      while (y > 0) { y--; py -= 2 * rx2; if (p > 0) p += rx2 - py; else { x++; px += 2 * ry2; p += rx2 - py + px; } q.push([x, y]); }
      const seen = new Set(), out = [];
      for (const [dx, dy] of q) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const r = CR + sy * dy, c = CC + sx * dx;
        if (seen.has(r * N + c)) continue;
        seen.add(r * N + c);
        out.push([r, c, Math.abs(Math.atan2(sx * dx / rx, sy * dy / ry)) / Math.PI]);
      }
      return out;
    };
    const OUTER = ellipseHd(7, 25), INNER = ellipseHd(6, 24);
    // Pentagon inside the ring, one point towards the viewer: (56, 31), (53, 47), (49, 41), (49, 21), (53, 15).
    const POINTS = [0, 1, 2, 3, 4].map(k => { const t = k * 2 * Math.PI / 5; return [Math.round(CR + 4 * Math.cos(t)), Math.round(CC + 17 * Math.sin(t))]; });
    const RUNES = [['x.x', '.x.', 'x.x'], ['xxx', '.x.', '.x.'], ['.x.', 'x.x', '.x.'], ['x..', 'xx.', 'x.x'], ['x.x', 'xxx', 'x.x']];
    // Flames stand on the outer ring round its sides and back (distance from the front, both sides, then the
    // back centre) and step through four shapes a frame, so the ring flickers without any flame jumping.
    const FLAME_AT = [0.42, 0.55, 0.68, 0.8, 0.9];
    const FLAMES = [];
    const nearest = (a, s) => OUTER.filter(([, c]) => Math.sign(c - CC) === s).reduce((b, x) => (Math.abs(x[2] - a) < Math.abs(b[2] - a) ? x : b));
    for (const a of FLAME_AT) for (const s of [-1, 1]) FLAMES.push(nearest(a, s));
    FLAMES.push(OUTER.find(([r, c]) => r === CR - 7 && c === CC));
    // Each shape 3 wide by 6 tall, top row first; its bottom row stands on the ring cell: tall, medium with a
    // spark, low, tall leaning. Ember core, red body, dark red tips. FLAME_OFF staggers the flames so
    // neighbours never share a shape and no wave marches round the ring.
    const FLAME_OFF = [0, 2, 3, 1, 1, 3, 2, 0, 0, 2, 1];
    const FLAME_SHAPES = [
      ['.r.', '.rd', 'rer', 'rer', 'ree', '.e.'],
      ['...', 'd..', '.r.', 'rer', 'rer', '.e.'],
      ['...', '...', '...', '.r.', 'rer', '.e.'],
      ['r..', 'dr.', 're.', 'rer', 'eer', '.e.'],
    ];
    const INK = {e: EMBER, r: RED, d: DARK, k: 2};
    // The ground, on its own layer: ring (trace 0..1 from the front, the newest tenth in ember as the pen),
    // pentagon, runes (0 unseen, 1 dim, 2 lit), flames by phase, the glow under the demon.
    const groundHd = ({trace = 0, pulse = false, faded = false, penta = 0, runes = null, flames = -1, glow = 0, phase = 0}) => {
      const s = blankHd();
      if (trace > 0) {
        const outerV = faded ? DARK : pulse ? EMBER : RED, innerV = faded ? 0 : pulse ? RED : DARK;
        for (const [ring, v] of [[INNER, innerV], [OUTER, outerV]]) if (v) for (const [r, c, a] of ring) {
          if (a > trace) continue;
          putHd(s, r, c, (!faded && trace < 1 && a > trace - 0.1) ? EMBER : v);
        }
      }
      if (penta) {
        const v = faded ? DARK : RED, n = penta >= 1 ? 5 : Math.round(5 * penta);
        for (let k = 0; k < n; k++) { const [r0, c0] = POINTS[k], [r1, c1] = POINTS[(k + 1) % 5]; lineHd(s, r0, c0, r1, c1, v); }
      }
      if (runes) POINTS.forEach(([r, c], k) => {
        if (!runes[k]) return;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -2; dc <= 2; dc++) putHd(s, r + dr, c + dc, 0);
        RUNES[k].forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch === 'x') putHd(s, r - 1 + dr, c - 1 + dc, runes[k] === 2 ? EMBER : DARK); }));
      });
      if (flames >= 0) FLAMES.forEach(([r, c], i) => {
        const shape = FLAME_SHAPES[(flames + FLAME_OFF[i]) % FLAME_SHAPES.length];
        shape.forEach((line, j) => [...line].forEach((ch, dc) => { if (ch !== '.') putHd(s, r - 5 + j, c - 1 + dc, INK[ch]); }));
      });
      if (glow) for (let r = CR - 2; r <= CR + 3; r++) for (let c = CC - 10; c <= CC + 10; c++) {
        const d = ((r - CR - 0.5) / (1.6 * glow)) ** 2 + ((c - CC) / (5 * glow)) ** 2;
        if (d < 0.25) putHd(s, r, c, EMBER);
        else if (d < 0.6) putHd(s, r, c, RED);
        else if (d < 1 && (r + c + phase) % 2 === 0) putHd(s, r, c, DARK);
      }
      return s;
    };
    // The demon, left half of a 21 col canvas (col 10 is its centre, placed on col 31); the right half mirrors.
    // e ember, r red, d dark red, k eye black.
    const DEMON_HALF = [
      '.....e.....', '....e......', '....ee.....', '.....ee....', '......eeddd',
      '.....drrrrr', '.....drdrrr', '.....drrddr', '.....dreerr', '.....dreerr',
      '.....drrrrr', '.....drkrrr', '.....drrkek', '......drrrr', '......drrrr',
      '......drrrr', '.......drrr', '.......drdd', '.......drd.', '.......dd..',
    ];
    // Bat wings, left side (mirrored): red bones round a dark red membrane with a scalloped trailing edge,
    // rooted beside the shoulders (rows 13 and 14). The down stroke is the up stroke flipped about the root.
    const WING_UP = [
      [8, 0, 'r'], [9, 0, 'd'], [9, 1, 'r'], [10, 0, 'd'], [10, 1, 'd'], [10, 2, 'r'], [11, 0, 'd'], [11, 1, 'd'], [11, 2, 'd'], [11, 3, 'r'],
      [12, 0, 'd'], [12, 1, 'd'], [12, 2, 'd'], [12, 3, 'd'], [12, 4, 'r'], [13, 0, 'r'], [13, 1, 'd'], [13, 2, 'd'], [13, 3, 'd'], [13, 4, 'd'], [13, 5, 'r'],
      [14, 1, 'r'], [14, 3, 'r'], [14, 4, 'd'], [14, 5, 'r'], [15, 4, 'r'],
    ];
    const WING_DOWN = WING_UP.map(([r, c, ch]) => [27 - r, c, ch]);
    // Tail hangs from between the feet, a spade tip pointing down: sway 0 left, 1 centre, 2 right.
    const TAIL = [
      [[18, 10, 'r'], [19, 10, 'r'], [20, 9, 'r'], [21, 7, 'r'], [21, 8, 'r'], [21, 9, 'r'], [22, 7, 'r'], [22, 8, 'e'], [22, 9, 'r'], [23, 8, 'r']],
      [[18, 10, 'r'], [19, 10, 'r'], [20, 10, 'r'], [21, 9, 'r'], [21, 10, 'r'], [21, 11, 'r'], [22, 9, 'r'], [22, 10, 'e'], [22, 11, 'r'], [23, 10, 'r']],
      [[18, 10, 'r'], [19, 10, 'r'], [20, 11, 'r'], [21, 11, 'r'], [21, 12, 'r'], [21, 13, 'r'], [22, 11, 'r'], [22, 12, 'e'], [22, 13, 'r'], [23, 12, 'r']],
    ];
    const demonHd = (g, top, wing, sway) => {
      const cells = [];
      DEMON_HALF.forEach((half, r) => [...half].forEach((ch, c) => { if (ch !== '.') { cells.push([r, c, ch]); if (c < 10) cells.push([r, 20 - c, ch]); } }));
      for (const [r, c, ch] of (wing ? WING_DOWN : WING_UP)) cells.push([r, c, ch], [r, 20 - c, ch]);
      cells.push(...TAIL[sway]);
      for (const [r, c, ch] of cells) if (top + r <= CLIP) putHd(g, top + r, CC - 10 + c, INK[ch]);
      return g;
    };
    // Glint: one red cell in each 3 by 6 eye (rows 18 to 23, cols 21 to 23 and 39 to 41), high and centred
    // while the circle burns, low and inner while the demon is out, so the creature watches it. Painted only on
    // eye black, so a red flash is left alone and each eye stays red or black.
    const GLINT = [[[19, 22], [19, 40]], [[21, 23], [21, 39]]];
    const frameHd = (pose, o = {}) => {
      const g = upscaleHd(pose, 3), s = groundHd(o);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c] && s[r][c]) g[r][c] = s[r][c];
      if (o.glint) for (const [r, c] of GLINT[o.demon ? 1 : 0]) if (g[r][c] === 2) g[r][c] = RED;
      if (o.demon) demonHd(g, o.demon[0], o.demon[1], o.demon[2]);
      return g;
    };
    const REST = summonRestA, HALF = summonArmsHalfA(summonRestA), UP = summonUpA, RED_EYES = summonEyesRedA(summonUpA);
    const LIT = n => [0, 1, 2, 3, 4].map(k => (k < n ? 2 : 1));
    const F = (hold, pose, o) => echoSummonHd.frames.push({hold, grid: frameHd(pose, o)});
    const burn = {trace: 1, penta: 1, glint: true, runes: LIT(5)};
    F(260, REST);                                                             // rest (loop anchor)
    F(190, HALF);                                                             // arms rising
    F(240, UP);                                                               // arms up
    F(150, UP, {trace: 0.3});                                                 // the ring draws itself from the front
    F(150, UP, {trace: 0.6});
    F(150, UP, {trace: 0.85});
    F(190, UP, {trace: 1, glint: true});                                      // closed; a red glint in each eye
    F(170, UP, {trace: 1, glint: true, penta: 0.6});                          // pentagon, three sides
    F(190, UP, {trace: 1, glint: true, penta: 1, runes: LIT(0)});             // pentagon closed, runes dim
    for (let n = 1; n <= 5; n++) F(n < 5 ? 150 : 180, UP, {trace: 1, glint: true, penta: 1, runes: LIT(n)});   // runes light one at a time
    F(190, UP, {...burn, pulse: true, flames: 0});                            // pulse, flames catch
    F(190, RED_EYES, {...burn, flames: 1});                                   // eyes flash red
    F(190, RED_EYES, {...burn, pulse: true, flames: 2});
    [48, 43, 38, 33, 30].forEach((top, i) => F(i < 4 ? 160 : 200, UP, {...burn, flames: 3 + i, glow: 1, phase: i, demon: [top, i % 2, 1]}));   // it climbs out, horns first
    [26, 28, 26, 28, 26, 28].forEach((top, i) => F(i % 2 ? 250 : 260, UP, {...burn, flames: 8 + i, glow: 1.2, phase: i, demon: [top, i % 2, [0, 1, 2, 1, 0, 1][i]]}));   // hover, wings flap, tail sways
    [30, 36, 42, 48].forEach((top, i) => F(i ? 150 : 160, UP, {...burn, flames: 14 + i, glow: 1, phase: i, demon: [top, i % 2, 2 - (i % 2)]}));   // sinks back
    F(200, UP, {...burn, flames: 18});                                        // gone, the circle still burns
    F(190, UP, {trace: 1, penta: 1, glint: true, runes: LIT(0)});             // flames out, runes dim
    F(180, UP, {trace: 1, faded: true});                                      // the ring fades
    F(170, UP, {trace: 0.5, faded: true});
    F(190, HALF);                                                             // arms lowering
    F(240, echoPing(true));                                                   // arms down, antenna pings
    F(260, REST);                                                             // rest (loops to frame 0)
  }

  // CTF hoodie, reworked (operator, 2026-09-28: "doing something other than standing there"). Matrix
  // rain falls behind it (only on empty cells, so it passes behind the body), a 404 flashes on the chest
  // like a print on the hoodie, alert boxes pop in the corners, then a purple portal opens on the floor,
  // the hacker sinks into it and is gone (eyes go with it, by design), the portal closes, and it drops
  // back in from the top with a flash.
  const HACK_PALETTE = ['transparent', '#1b2326', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#eafffb',
                        '#39ff6a', '#17836f', '#ff5fd2'];   // 7 rain head, 8 rain trail and the creature's own teal before the hoodie, 9 portal and 404
  const RAIN_COLS = [0, 2, 3, 5, 8, 11, 13, 16, 17, 19];
  function rain(g, k) {
    const b = clone(g);
    RAIN_COLS.forEach((c, i) => {
      const head = (k * (1 + (i % 3)) + i * 5) % (G + 6) - 3;
      for (let t = 0; t < 4; t++) { const r = head - t; if (r >= 0 && r < G && b[r][c] === 0) b[r][c] = t === 0 ? 7 : 8; }
    });
    return b;
  }
  const DIGIT = {4: ['1.1', '1.1', '111', '..1', '..1'], 0: ['111', '1.1', '1.1', '1.1', '111']};
  function print404(g) {
    const b = clone(g);
    [4, 0, 4].forEach((d, i) => DIGIT[d].forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === '1') set(b, 9 + r, 5 + i * 4 + c, 9); })));
    return b;
  }
  function alertBox(g, corner) {   // a 3x3 box with a bang, top left or top right
    const b = clone(g); const c0 = corner ? 17 : 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) set(b, r, c0 + c, (r === 1 && c === 1) ? 9 : 6);
    return b;
  }
  const portalRing = (g, w) => { const b = clone(g); for (let c = 10 - w; c <= 10 + w; c++) { set(b, 19, c, 9); } set(b, 18, 10 - w, 9); set(b, 18, 10 + w, 9); return b; };
  function sink(g, d) {             // the whole creature drops d rows; nothing below row 17 is drawn
    const b = empty();
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g[r][c] && r + d <= 17) set(b, r + d, c, g[r][c]);
    return b;
  }
  const hoodOpen = hoodieFrame(0, true), hoodLeft = hoodieFrame(-1, true), hoodRight = hoodieFrame(1, true), hoodShut = hoodieFrame(0, false);
  ctfHoodie.palette = HACK_PALETTE;
  ctfHoodie.intent = 'Proposal. Working a CTF: matrix rain falls behind the hoodie, a 404 flashes on the chest, alert boxes pop, then a purple portal opens on the floor and the hacker sinks through it and is gone (eyes gone by design while it is under), the portal closes and it drops back in; judge whether the rain reads as behind it.';
  // Suiting up: it starts as itself in ECHO teal (index 8 here), the hood drops in from above, then the
  // black spreads down the body one row per frame and the drawstrings get a tug.
  const tealSelf = echoBase.map(r => r.map(v => v === 1 ? 8 : v));
  function suitUp(thr) {            // rows up to thr are hoodie, rows below are still teal
    const b = clone(tealSelf);
    for (let r = 0; r <= Math.min(thr, G - 1); r++) b[r] = hoodOpen[r].slice();
    return b;
  }
  function hoodAbove(dy) {          // just the hood shape, dy rows above where it will sit, over the teal self
    const b = clone(tealSelf);
    for (let c = 5; c <= 15; c++) set(b, 3 - dy, c, 1);
    for (let r = 4; r <= 6; r++) { set(b, r - dy, 4, 1); set(b, r - dy, 16, 1); }
    return b;
  }
  ctfHoodie.intent = 'Proposal. Working a CTF: it starts as itself in teal, pulls a black hoodie down over its head (the black spreads down row by row, a tug on the drawstrings), then matrix rain falls behind it, a 404 flashes on the chest, alert boxes pop, a purple portal opens on the floor and the hacker sinks through it (eyes gone by design while under), and it drops back in as itself, ready to suit up again; judge the suit up and whether the rain reads as behind it.';
  ctfHoodie.frames = [];
  { const f = ctfHoodie.frames; let k = 0;
    f.push({hold: 700, grid: tealSelf});
    f.push({hold: 160, grid: hoodAbove(3)}); f.push({hold: 140, grid: hoodAbove(2)}); f.push({hold: 120, grid: hoodAbove(1)});
    for (let thr = 7; thr <= 13; thr++) f.push({hold: 90, grid: suitUp(thr)});
    f.push({hold: 120, grid: suitUp(13).map((r, i) => i === 10 ? r.map((v, c) => (c === 9 || c === 11) ? 6 : v) : r)});   // the tug
    for (let i = 0; i < 8; i++) f.push({hold: 140, grid: rain(i === 5 ? hoodShut : hoodOpen, k++)});
    for (let i = 0; i < 4; i++) f.push({hold: 140, grid: rain(i % 2 ? hoodOpen : print404(hoodOpen), k++)});
    for (let i = 0; i < 4; i++) f.push({hold: 140, grid: rain(alertBox(i < 2 ? hoodLeft : hoodRight, i < 2 ? 0 : 1), k++)});
    for (let i = 0; i < 3; i++) f.push({hold: 140, grid: rain(print404(hoodOpen), k++)});
    for (let w = 1; w <= 5; w++) f.push({hold: 100, grid: rain(portalRing(hoodOpen, w), k++)});
    for (const d of [1, 3, 5, 8, 11, 14, 17]) f.push({hold: 90, grid: rain(portalRing(sink(hoodOpen, d), 5), k++)});
    for (let i = 0; i < 3; i++) f.push({hold: 160, grid: rain(portalRing(empty(), i % 2 ? 5 : 4), k++)});
    for (let w = 4; w >= 1; w--) f.push({hold: 90, grid: rain(portalRing(empty(), w), k++)});
    f.push({hold: 400, grid: rain(empty(), k++)});
    for (const d of [-14, -9, -5, -2]) f.push({hold: 80, grid: sink(tealSelf, d)});   // back as itself: the hoodie stayed in the portal
    f.push({hold: 90, grid: tealSelf.map(r => r.map(v => v === 8 ? 6 : v))});
    f.push({hold: 500, grid: tealSelf});
  }

  // 3x. Ultra braille (operator: "a larger braille ascii rotation with rainbow and neon purple colours",
  // a variation of ultracode). 60 cell lattice. The creature is drawn at 3x, dissolves into a sphere of
  // braille dots (about 240 points on a Fibonacci lattice, each dot a 2x2 block) that turns on a tilted
  // axis; front dots are rainbow by longitude band, back dots neon purple and dim; then it reassembles.
  const UB = 60;
  const UB_PALETTE = ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c',
                      '#b44dff', '#ff5fd2', '#ff4b4b', '#ffd166'];   // 6 neon purple, 7 magenta, 8 red, 9 amber
  // rainbow by band: ping cyan (4), visor teal (3), amber (9), red (8), magenta (7); back side purple (6)
  const UB_RAINBOW = [4, 3, 9, 8, 7];
  const ubEmpty = () => Array.from({length: UB}, () => new Array(UB).fill(0));
  const ubSet = (g, r, c, v) => { if (r >= 0 && r < UB && c >= 0 && c < UB) g[r][c] = v; };
  function ubUp(g20) {                                                    // exact 3x of a 20 cell frame
    const b = ubEmpty();
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g20[r][c]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b[r * 3 + i][c * 3 + j] = g20[r][c];
    return b;
  }
  const UB_POINTS = (() => {                                              // Fibonacci sphere, unit radius
    const n = 240, pts = [], phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), t = phi * i; pts.push([Math.cos(t) * rad, y, Math.sin(t) * rad]); }
    return pts;
  })();
  function ubSphere(angle, radius, tilt) {
    const b = ubEmpty();
    const cx = 30, cy = 30, ct = Math.cos(tilt), st = Math.sin(tilt), ca = Math.cos(angle), sa = Math.sin(angle);
    const order = UB_POINTS.map(([x, y, z]) => {
      const x1 = x * ca - z * sa, z1 = x * sa + z * ca;                     // spin about the vertical axis
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;                   // tilt toward the viewer
      const band = Math.floor(((Math.atan2(z1, x1) + Math.PI) / (2 * Math.PI)) * UB_RAINBOW.length) % UB_RAINBOW.length;
      return {x: x1, y: y2, z: z2, band};
    }).sort((p, q) => p.z - q.z);                                          // back first so the front paints last
    for (const p of order) {
      const r = Math.round(cy + p.y * radius), c = Math.round(cx + p.x * radius);
      const v = p.z >= 0 ? UB_RAINBOW[p.band] : 6;
      if (p.z < -0.35 && ((r + c) & 1)) continue;                            // the far back thins out
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) ubSet(b, r + i, c + j, v);
    }
    return b;
  }
  // dissolve: the 3x creature keeps every k-th cell on a checker as it thins toward the sphere
  function ubDissolve(g60, k) { const b = ubEmpty(); for (let r = 0; r < UB; r++) for (let c = 0; c < UB; c++) if (g60[r][c] && ((r * 7 + c * 3) % 5) >= k) b[r][c] = g60[r][c]; return b; }
  const ultraBraille = {
    name: 'ECHO · ultra braille', key: 'ultra_braille', fwname: 'ultra braille', category: 'Mode', size: UB,
    intent: 'Proposal, 60 cells. Ultracode as a large rotating sphere of braille dots: the creature dissolves into it, it turns on a tilted axis in rainbow bands with the back side neon purple, then pulls itself back together; judge the rotation read and whether 60 cells earn their keep.',
    palette: UB_PALETTE,
    frames: [],
  };
  {
    const f = ultraBraille.frames;
    const base = ubUp(echoPing(false)), ping = ubUp(echoPing(true));
    f.push({hold: 900, grid: base});
    f.push({hold: 60, grid: ubUp(echoGlitch()), glitch: true});
    for (let k = 1; k <= 4; k++) f.push({hold: 80, grid: ubDissolve(base, k)});
    for (let k = 0; k < 8; k++) f.push({hold: 70, grid: ubSphere(k * Math.PI / 12, 10 + k * 2, 0.5)});      // the sphere grows in
    for (let k = 0; k < 24; k++) f.push({hold: 90, grid: ubSphere(Math.PI * 2 / 3 + k * Math.PI / 12, 26, 0.5 + Math.sin(k / 4) * 0.25)});   // two full turns, tilt breathing
    for (let k = 7; k >= 0; k--) f.push({hold: 70, grid: ubSphere(Math.PI * 8 / 3 + k * Math.PI / 12, 10 + k * 2, 0.5)});  // shrinks
    for (let k = 4; k >= 1; k--) f.push({hold: 80, grid: ubDissolve(base, k)});
    f.push({hold: 1000, grid: ping});
    f.push({hold: 60, grid: ubUp(echoGlitch()), glitch: true});
    f.push({hold: 700, grid: base});
  }

  // 3x. fable gaze: the quieter Fable, and its eyes are the show. The Fable creature as the model tier draws it
  // (anims_models.js: amber antenna tip, a two cell amber ear on the top left corner, and four sideways eyes, single
  // dark cells on the lower visor row at cols 6, 8, 12 and 14). The pairs close ranks into a line of four that drifts
  // as a group, left, centre, right, one cell a frame; on the third drift the leftmost eye turns amber and the others
  // follow one per drift, left to right toward the antenna, which pings as the fourth turns. The line opens back into
  // its two pairs, each pair meets in the middle as one tall eye (the plain ECHO face, in amber), lies down and splits
  // sideways into two again. Then the four spin once as tiny braille pairs (1x2 on rows 6..7): each lit dot steps up
  // and back down one eye behind the last, so the four read as a wave, and lands dark. Then it settles.
  const fableGaze = {
    name: 'Fable · gaze', key: 'fable_gaze', fwname: 'fable gaze', category: 'Thinking',
    intent: 'Proposal. The quieter Fable, and the eyes are the show: its four sideways eyes close ranks into a line and drift as a group, left, centre, right, one cell a frame at 160 ms; on the third drift the leftmost eye turns amber and the others follow one per drift like a wave, and the antenna pings as the fourth turns; the line opens back into two pairs, each pair meets in the middle as one tall eye, the plain ECHO face in amber, which lies down and splits sideways into four again; then the four spin once as tiny braille pairs, each lit dot stepping up and back down one eye behind the last so the four read as a wave, and each eye lands dark; judge whether amber on the teal visor still reads as eyes at 20 cells.',
    palette: [...echo.palette, '#e0b25a', '#ffd166'],   // 7 Fable amber (ear, antenna tip), 8 eye amber: the eyes' second colour, an eye cell wherever it sits
    frames: [],
  };
  {
    const AMBER = 7, HOT = 8, DARK = 2, VISOR = 3, PING = 4;
    // The Fable body: echoBase plus the three amber cells anims_models.js adds (tip and ear; index 6 in its palette).
    const body = clone(echoBase);
    for (const [r, c] of [[1, 15], [3, 5], [2, 4]]) set(body, r, c, AMBER);
    // Every frame is this one face: the visor band (rows 6..7, cols 6..14) repainted plain, then the eye cells as
    // [row, col, colour], then the antenna tip. Nothing else changes, so the silhouette is the same in every frame.
    const face = (eyes, tip = AMBER) => {
      const b = clone(body);
      for (const r of [6, 7]) for (let c = 6; c <= 14; c++) set(b, r, c, VISOR);
      for (const [r, c, v] of eyes) set(b, r, c, v);
      set(b, 1, 15, tip);
      return b;
    };
    const PAIRS = [6, 8, 12, 14];                                       // Fable at rest: two pairs of sideways eyes
    const LINE = o => [7, 9, 11, 13].map(c => c + o);                   // closed ranks, evenly spaced; o -1 left, 0 centre, 1 right
    const eyesAt = (cols, hot = 0) => cols.map((c, k) => [7, c, k < hot ? HOT : DARK]);   // the first hot eyes from the left are amber
    // The drift. The gather (PAIRS into LINE(0)) is a formation change, not a drift; the drifts are then 1 left,
    // 2 centre, 3 right, 4 centre, 5 left, 6 centre. The third drift turns eye 0 amber and each drift after it one
    // more eye, so the wave completes on the sixth drift (the next third) and the antenna pings there.
    const DRIFT = [-1, 0, 1, 0, -1, 0];
    // The braille spin, steps s 1..5: eye k is a 1x2 pair on rows 6..7 at its PAIRS column. With t = s - k its lit
    // dot is up on row 6 for t 1 and 2 and down on row 7 otherwise, amber until it has turned and dark once it lands
    // (t 3 on). A crest two eyes wide runs left to right, so the spin is also the wave that cools the eyes.
    const spin = s => PAIRS.map((c, k) => { const t = s - k; return [t === 1 || t === 2 ? 6 : 7, c, t >= 3 ? DARK : HOT]; });
    const two = [6, 7].flatMap(r => [[r, 7, HOT], [r, 13, HOT]]);     // each pair met in the middle: the family's two eyes, amber
    const lying = [6, 7, 8, 12, 13, 14].map(c => [7, c, HOT]);        // each tall eye lies down, three wide, before it splits
    fableGaze.frames.push(
      {hold: 1000, grid: face(eyesAt(PAIRS))},                                          // rest: two pairs, dark
      {hold: 160, grid: face(eyesAt(LINE(0)))},                                         // the pairs close ranks into a line
      ...DRIFT.map((o, i) => ({hold: i === 5 ? 300 : 160,                               // drifts 1..6, the sixth lands and holds
        grid: face(eyesAt(LINE(o), Math.max(0, i - 1)), i === 5 ? PING : AMBER)})),     // amber from the third; ping on the fourth eye
      {hold: 160, grid: face(eyesAt(PAIRS, 4))},                                        // the line opens back into two pairs
      {hold: 160, grid: face([[7, 7, HOT], [7, 13, HOT]])},                             // each pair meets in the middle
      {hold: 700, grid: face(two)},                                                     // two eyes: the plain ECHO face, in amber
      {hold: 140, grid: face(lying)},                                                   // each eye lies down and stretches
      {hold: 500, grid: face(eyesAt(PAIRS, 4))},                                        // and pinches in two: four again
      ...[1, 2, 3, 4, 5].map(s => ({hold: 140, grid: face(spin(s))})),                  // one turn of the braille wave
      {hold: 1000, grid: face(eyesAt(PAIRS))},                                          // settled, dark
    );
  }

  // 3x. Fable eyes: the Fable creature (amber antenna tip and two cell amber ear, as model fable in
  // anims_models.js, rebuilt here because that file loads after this one) with the eyes as the show.
  // Every blink swaps in a new set on the visor: the normal pair, the Fable sideways four, six eyes, one
  // big eye, a colour roll, braille cells whose lit dots spin, then the braille cells and the four at
  // once, and the normal pair comes back with an antenna ping. One closure, so fableEyes is the only
  // name added to this scope.
  const fableEyes = (() => {
    const EYE = 2, VISOR = 3, PING = 4, FABLE = 6, MAGENTA = 7, AMBER = 8, RED = 9;   // eye colours: 2, 7, 8, 9
    // The body never changes: echoBase, the tip resting in Fable amber (a ping lights it in index 4) and
    // the ear rooted on the top left corner (4,5), pointing up and out, cell for cell as fableBase.
    const body = tip => { const b = clone(echoBase); set(b, 1, 15, tip); set(b, 3, 5, FABLE); set(b, 2, 4, FABLE); return b; };
    // Repaint the whole band first (rows 6..7, or rows 5..7 when grown a row as happyEyes grows it, cols
    // 6..14; echoBase carries its own eyes at cols 7 and 13), then paint the cells [row, col, index].
    const face = (cells, {grown = false, ping = false} = {}) => {
      const b = body(ping ? PING : FABLE);
      for (let r = grown ? 5 : 6; r <= 7; r++) for (let c = 6; c <= 14; c++) set(b, r, c, VISOR);
      for (const [r, c, v] of cells) set(b, r, c, v);
      return b;
    };
    const dark = cells => cells.map(([r, c]) => [r, c, EYE]);
    const PAIR = (top = EYE, low = EYE) => [[6, 7, top], [6, 13, top], [7, 7, low], [7, 13, low]];   // the family's 1x2 eyes
    const SIDE4 = dark([[7, 6], [7, 8], [7, 12], [7, 14]]);                                        // the Fable four
    const SHUT = dark([[7, 6], [7, 7], [7, 8], [7, 12], [7, 13], [7, 14]]);                        // the blink: closed eye lines '222'
    // Six single eyes cannot all stand apart on the two row band (five fit with a gap between each), so
    // the band grows a row: the four stay on row 7 and two more open above them, three a side.
    const SIX = dark([[5, 7], [5, 13], [7, 6], [7, 8], [7, 12], [7, 14]]);
    // One big eye: a block 3 wide and 2 tall in the middle of the band with a one cell pupil in amber
    // (the eye amber, 8: the Fable amber, 6, marks the tip and ear and stays off the band).
    const BIG = pupil => [...dark([[6, 9], [6, 10], [6, 11], [7, 9], [7, 10], [7, 11]]), [6, pupil, AMBER]];
    // Braille: each eye a dark 2x3 cell on the grown band (cols 7..8 and 12..13, one visor cell outside
    // each) with two adjacent lit dots running round its six dots in EYE_SPIN_DOTS order (clockwise from
    // top left, as echo eye spin); the right cell runs the mirror image, so the two spin opposite ways.
    // Every dot sits on the cell's rim beside the visor, so the dots are lit in magenta: ping cyan melts
    // into the visor teal there and the cell reads as a plain square.
    const braille = (k, lit) => {
      const cells = [];
      for (const c0 of [7, 12]) for (let r = 5; r <= 7; r++) cells.push([r, c0, EYE], [r, c0 + 1, EYE]);
      for (const j of [k, k + 1]) { const [dr, dc] = EYE_SPIN_DOTS[j % 6]; cells.push([5 + dr, 7 + dc, lit], [5 + dr, 13 - dc, lit]); }
      return cells;
    };
    // All at once: the braille cells keep spinning, the dots turn amber and the Fable four come back in
    // magenta on the middle row, each pair a column wider (its inner eye steps in toward the middle, 8 to
    // 9 and 12 to 11) so it flanks its braille cell.
    const ALL = k => [...braille(k, AMBER), ...[6, 9, 11, 14].map(c => [6, c, MAGENTA])];
    // The colour roll, two cells at a time: the top pair leads and the lower pair follows a step behind.
    const ROLL = [[MAGENTA, EYE, 90], [MAGENTA, MAGENTA, 170], [AMBER, MAGENTA, 90], [AMBER, AMBER, 170], [RED, AMBER, 90], [RED, RED, 170], [EYE, RED, 90]];
    const F = (hold, cells, o) => ({hold, grid: face(cells, o)});
    const GROWN = {grown: true};
    return {
      name: 'Fable · eyes', key: 'fable_eyes', fwname: 'fable eyes', category: 'Mode',
      intent: 'Proposal. The eyes are the show on the Fable creature (amber ear and antenna tip): each blink swaps in a new set on the visor, the normal pair, the Fable sideways four, six eyes on a visor grown a row, one big eye whose amber pupil glances left and right, then a colour roll through magenta, amber and red two cells at a time; both eyes then become dark 2x3 braille cells whose two lit magenta dots spin in mirror for two turns, a third turn in amber brings the four back in magenta, and a blink returns the normal pair with an antenna ping; judge whether every set still reads as eyes at 20 cells and whether the parade stays playful rather than broken.',
      // 0 transparent, 1 body, 2 eyes, 3 visor, 4 ping (the antenna ping), 5 feet, 6 Fable amber (tip and
      // ear); eye colours 2 dark, 7 magenta, 8 amber, 9 red (the roll, the pupil, the braille dots, the four)
      palette: ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#e0b25a', '#ff5fd2', '#ffd166', '#ff4b4b'],
      frames: [
        F(1200, PAIR()),                                                                     // rest: the normal pair
        F(80, SHUT), F(900, SIDE4),                                                          // the Fable sideways four
        F(80, SHUT), F(850, SIX, GROWN),                                                     // six eyes
        F(80, SHUT), F(380, BIG(10)), F(240, BIG(9)), F(300, BIG(11)), F(220, BIG(10)),      // one big eye glances left and right
        F(80, SHUT), ...ROLL.map(([top, low, hold]) => F(hold, PAIR(top, low))), F(240, PAIR()),   // the colour roll
        F(80, SHUT), F(200, braille(0, MAGENTA), GROWN),                                     // braille cells, lit dots on top
        ...Array.from({length: 12}, (_, i) => F(90, braille(i + 1, MAGENTA), GROWN)),        // two turns, 90 ms a step
        ...Array.from({length: 6}, (_, i) => F(i < 5 ? 90 : 240, ALL(i + 13), GROWN)),       // all at once, a third turn
        F(80, SHUT), F(260, PAIR(), {ping: true}),                                           // the normal pair, antenna ping
      ],
    };
  })();

  // 3x. Portal: the Island's portal jump (the_island dev/clawd-hatch/hatch.js) done by the ECHO creature,
  // sampled rather than redrawn. hatch.js ran in node (plan(1), 4714 ms) into a context that recorded every
  // fillRect; each rect was divided by the module's 4 px block into claudepix cells and cut to a 20 x 20 window
  // on its 100 x 24 stage: rows 3..22 (a standing sprite lands on echoBase's own rows, the floor is row 17) and
  // one of two fixed shots across, A = stage cols 56..75 (beside the hatch, its right end at the left edge) for
  // the walk, the heave and the stare, B = cols 36..55 (over the pit, its left end in frame) from the hop on.
  // The roster body took the ECHO skin through skinFrame; the hatch, the shaft and the floor keep the Island's
  // colours: 7 #ff5fd2 the shaft by the lip (its three core rows) and the lit lip, 8 #7a2bb0 the rim (the shut
  // panel and its ticks, the end walls), the throat and the upper shaft, 9 #1b3540 the Island's floor; the pit's
  // near black void is 0, panel black. The shaft is the one translucent layer there; a row shows while its alpha
  // is at least 0.12. A sample is kept only while the creature shows both eyes, or has sunk below the lip: the
  // window's edge cuts the Island's first walk samples (cx 76 and 73) and the hop between the shots (2526, cx 57)
  // to one eye, so they are left out and the frame before holds; the creature reappears with the family glitch at
  // its first sample with both eyes and the antenna in frame, 1221 (cx 70). Holds are the Island's own time between
  // samples; the only time added is the 300 ms glitch return (frame 1 and 240 ms of frame 2) that closes the loop.
  const echoPortal = {
    name: 'ECHO · portal', key: 'echo_portal', fwname: 'echo portal', category: 'Mode',
    intent: "Proposal, the Island's portal jump sampled beat for beat from its hatch.js: the creature glitches back in beside a hatch in the floor, steps up to it, crouches and heaves it open wide eyed as a magenta shaft floods up, hops in (the view cuts to over the pit), sinks feet first with the antenna last, and the hatch irises shut to a seam; judge whether the cut between the two shots reads as one jump and whether the shaft reads as light rather than a wall.",
    palette: [...echo.palette, '#ff5fd2', '#7a2bb0', '#1b3540'],   // 7 portal (the Island's own #ff5fd2), 8 rim and upper shaft, 9 the Island floor
    frames: [
      //  0  582 (keyT walkIn), shot A: the loop seam: the floor and the shut hatch end; the Island walker is off to the right until 1221
      {hold: 639, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        88888899999999999999
        99999899999999999999
        99999999999999999999`)},
      //  1  1221, shot A: the family glitch: back in frame with both eyes (cx 70), visor rows slip right, visor in ping
      {hold: 60, grid: rows(`
        00000000000000000001
        00000000000000000004
        00000000000000000001
        00000000000000000001
        00000000011111111111
        00000000011111111111
        00000000001626666626
        00000000111626666626
        00000000111111111111
        00000001111111111111
        00000001011111111111
        00000000011111111111
        00000000011111111111
        00000000011111111111
        00000000050050005005
        00000000050050005005
        00000000050050005005
        88888899999999999999
        99999899999999999999
        99999999999999999999`), glitch: true},
      //  2  1221, shot A: settles beside the hatch (cx 70)
      {hold: 348, grid: rows(`
        00000000000000000001
        00000000000000000004
        00000000000000000001
        00000000000000000001
        00000000011111111111
        00000000011111111111
        00000000013233333231
        00000001113233333231
        00000001111111111111
        00000001111111111111
        00000001011111111111
        00000000011111111111
        00000000011111111111
        00000000011111111111
        00000000050050005005
        00000000050050005005
        00000000050050005005
        88888899999999999999
        99999899999999999999
        99999999999999999999`)},
      //  3  1329, shot A: steps up to the hatch and braces (cx 68, dy 1)
      {hold: 95, grid: rows(`
        00000000000000000000
        00000000000000000100
        00000000000000000410
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001323333323100
        00000111323333323111
        00000111111111111111
        00000111111111111111
        00000101111111111101
        00000001111111111100
        00000001111111111100
        00000001111111111100
        00000005005000500500
        00000005005000500500
        88888899999999999999
        99999899999999999999
        99999999999999999999`)},
      //  4  1424/1553 (keyT crouch), shot A: crouches (dy 2)
      {hold: 130, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000040
        00000000000000000010
        00000000000000000010
        00000000111111111110
        00000000111111111110
        00000000132333332310
        00000011132333332311
        00000011111111111111
        00000011111111111111
        00000010111111111110
        00000000111111111110
        00000000111111111110
        00000000111111111110
        00000000500500050050
        00000000500500050050
        88888899999999999999
        99999899999999999999
        99999999999999999999`)},
      //  5  1554, shot A: wide eyed (hatch.js plays the surprise frame), hands on the shut hatch
      {hold: 73, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000400
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001222333222100
        00000111222333222111
        00000111111111111111
        00000111111111111111
        00000101111111111101
        00000001111111111100
        00000001111111111100
        00000001111111111100
        00000005005000500500
        88888899999999999999
        99999899999999999999
        99999999999999999999`)},
      //  6  1627, shot A: the hatch starts to iris open off to the left: its seam leaves the floor
      {hold: 207, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000400
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001222333222100
        00000111222333222111
        00000111111111111111
        00000111111111111111
        00000101111111111101
        00000001111111111100
        00000001111111111100
        00000001111111111100
        00000005005000500500
        99999999999999999999
        99999999999999999999
        99999999999999999999`)},
      //  7  1834, shot A: light at the edge of the pit
      {hold: 123, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000400
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001222333222100
        00000111222333222111
        00000111111111111111
        00000111111111111111
        88800101111111111101
        88000001111111111100
        77000001111111111100
        77000001111111111100
        70000005005000500500
        89999999999999999999
        89999999999999999999
        89999999999999999999`)},
      //  8  1957 (keyT open), shot A: heaved well open, the light spilling up the left side (gap 9, dy 1)
      {hold: 88, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000400
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001222333222100
        00000111222333222111
        00000111111111111111
        88888111111111111111
        88888101111111111101
        88888801111111111100
        88888001111111111100
        77777001111111111100
        77777005005000500500
        77770005005000500500
        77789999999999999999
        88889999999999999999
        88889999999999999999`)},
      //  9  2045/2264 (keyT stare), shot A: fully open, standing up
      {hold: 403, grid: rows(`
        00000000000000000000
        00000000000000000400
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001222333222100
        00000111222333222111
        00000111111111111111
        88888111111111111111
        88888181111111111101
        88888881111111111100
        88888881111111111100
        88888881111111111100
        77777775005000500500
        77777775005000500500
        77777705005000500500
        77777899999999999999
        88888899999999999999
        88888899999999999999`)},
      // 10  2448, shot A: takes off toward the pit (cx 64, dy -1), held to the cut
      {hold: 176, grid: rows(`
        00000000000004000000
        00000000000001000000
        00000000000001000000
        00011111111111000000
        00011111111111000000
        00013233333231000000
        01113233333231110000
        01111111111111110000
        01111111111111110000
        81811111111111010000
        88811111111111000000
        88811111111111000000
        88811111111111000000
        88858850005005000000
        77757750005005000000
        77757750005005000000
        77777700000000000000
        77777899999999999999
        88888899999999999999
        88888899999999999999`)},
      // 11  2624, shot B: cut to shot B: over the pit (cx 51, dy -4)
      {hold: 94, grid: rows(`
        00000000001111111111
        00000000001111111111
        00000000001323333323
        00000000111323333323
        00000000111111111111
        00000000111111111111
        00000000101111111111
        00000000001111111111
        00000000001111111111
        88888888881111111111
        08888888885885888588
        08888888885885888588
        08888888885885888588
        00888888888888888888
        00777777777777777777
        00777777777777777777
        00077777777777777777
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 12  2718/2764 (keyT apex), shot B: the top of the hop (cx 48, dy -5)
      {hold: 138, grid: rows(`
        00000001111111111100
        00000001323333323100
        00000111323333323111
        00000111111111111111
        00000111111111111111
        00000101111111111101
        00000001111111111100
        00000001111111111100
        00000001111111111100
        88888885885888588588
        08888885885888588588
        08888885885888588588
        08888888888888888888
        00888888888888888888
        00777777777777777777
        00777777777777777777
        00077777777777777777
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 13  2856, shot B: falls (dy -4)
      {hold: 101, grid: rows(`
        00000001111111111100
        00000001111111111100
        00000001323333323100
        00000111323333323111
        00000111111111111111
        00000111111111111111
        00000101111111111101
        00000001111111111100
        00000001111111111100
        88888881111111111188
        08888885885888588588
        08888885885888588588
        08888885885888588588
        00888888888888888888
        00777777777777777777
        00777777777777777777
        00077777777777777777
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 14  2957, shot B: falls (dy -2)
      {hold: 88, grid: rows(`
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001323333323100
        00000111323333323111
        00000111111111111111
        00000111111111111111
        00000101111111111101
        88888881111111111188
        08888881111111111188
        08888881111111111188
        08888885885888588588
        00888885885888588588
        00777775775777577577
        00777777777777777777
        00077777777777777777
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 15  3045, shot B: feet under the lip (dy 1)
      {hold: 120, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000400
        00000000000000000100
        00000000000000000100
        00000001111111111100
        00000001111111111100
        00000001323333323100
        00000111323333323111
        88888111111111111111
        08888111111111111111
        08888181111111111181
        08888881111111111188
        00888881111111111188
        00777771111111111177
        00777775775777577577
        00077775775777577577
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 16  3165/3170 (keyT midDrop), shot B: half gone (dy 7)
      {hold: 63, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000400
        88888888888888888188
        08888888888888888188
        08888881111111111188
        08888881111111111188
        00888881323333323188
        00777111323333323111
        00777111111111111111
        00077111111111111111
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 17  3228, shot B: head and antenna last (dy 11)
      {hold: 68, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        88888888888888888888
        08888888888888888888
        08888888888888888888
        08888888888888888488
        00888888888888888188
        00777777777777777177
        00777771111111111177
        00077771111111111177
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 18  3296/3494 (keyT gone), shot B: under (dy 16)
      {hold: 371, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        88888888888888888888
        08888888888888888888
        08888888888888888888
        08888888888888888888
        00888888888888888888
        00777777777777777777
        00777777777777777777
        00077777777777777777
        99987777777777777777
        99988888888888888888
        99988888888888888888`)},
      // 19  3667, shot B: the hatch irises shut (gap 10)
      {hold: 107, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        08888888888888888888
        00888888888888888888
        00888888888888888888
        00888888888888888888
        00088888888888888888
        00077777777777777777
        00077777777777777777
        00007777777777777777
        99998777777777777777
        99998888888888888888
        99998888888888888888`)},
      // 20  3774, shot B: gap 8
      {hold: 69, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00008888888888888888
        00008888888888888888
        00000888888888888888
        00000777777777777777
        00000777777777777777
        00000077777777777777
        99999987777777777777
        99999988888888888888
        99999988888888888888`)},
      // 21  3843/3874 (keyT closing), shot B: gap 6
      {hold: 142, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000088888888888888
        00000008888888888888
        00000007777777777777
        00000007777777777777
        00000000777777777777
        99999999877777777777
        99999999888888888888
        99999999888888888888`)},
      // 22  3985, shot B: a slit of light (gap 2)
      {hold: 97, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000077777000
        99999999999987778999
        99999999999988888999
        99999999999988888999`)},
      // 23  4082/4434 (keyT closed), shot B: shut: the panel back in the floor
      {hold: 1214, grid: rows(`
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        00000000000000000000
        99988888888888888888
        99989999999999899999
        99999999999999999999`)},
    ],
  };

  // Shared library for the extra creature files (docs/bench/anims_*.js): each of those does
  //   const L = (typeof window !== 'undefined' ? window : globalThis).BENCH_LIB;
  //   L.register([ ...cells ]);
  // and is loaded after this file (bench: script tags; export: tools/bench_to_json.js requires them).
  // A finer cell adds size: 60 (or 40) and builds every frame on that lattice, for example
  //   const big = L.upscale(L.echoBase, 3); L.set(big, 20, 45, 4);
  // is the creature at 3x with one 8 px ping cell just right of the visor.
  const BENCH = {G, anims: [stock, coffee, coffeeMorning, echo, echoCoffee, echoDoubleCoffee, echoFloat, echoWalk, echoTwoAgents, echoSsh, tokenBurner, ultraShift, ultra, jobDone, love, echoHappy, consult, creditsOut, ctfHoodie, echoLoading, echoKissA, echoSummonA, echoKissB, echoEyeSpin, echoOpenclaw, echoNanoclaw, echoPizza, echoHeadphones, clawdHeadphones, echoSummonHd, ultraBraille, fableGaze, fableEyes, echoPortal, ...skinned], spinnerAt, sizeOf};
  const BENCH_LIB = {G, rows, clone, set, upscale, sizeOf, BASE, blink, shut, ECHO_PALETTE, echoBase, echoPing, echoGlitch, bbox, eyeGeom, skinFrame, spinnerAt, STOCK,
    register(cells) { for (const c of cells) BENCH.anims.push(c); }};
  root.BENCH = BENCH; root.BENCH_LIB = BENCH_LIB;
  if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
})(typeof window !== 'undefined' ? window : globalThis);
