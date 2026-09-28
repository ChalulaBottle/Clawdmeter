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

  const BENCH = {G, anims: [stock, coffee, echo]};
  if (typeof module !== 'undefined' && module.exports) module.exports = BENCH; else root.BENCH = BENCH;
})(typeof window !== 'undefined' ? window : globalThis);
