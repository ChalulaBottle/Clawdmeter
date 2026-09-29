// Movement creatures: the ECHO creature going places (operator, 2026-09-28). Drawn from scratch on the
// ECHO base. Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {G, clone, set, ECHO_PALETTE, echoBase, echoPing, echoGlitch} = L;
  const ECHO7 = ECHO_PALETTE.slice(0, 7);
  const empty = () => Array.from({length: G}, () => new Array(G).fill(0));

  // The 10 x 10 mini, 2x2 majority with eyes winning ties (same rule as the rest of the family).
  const MINI = (() => {
    const m = [];
    for (let r = 0; r < G; r += 2) {
      const row = [];
      for (let c = 0; c < G; c += 2) {
        const v = [echoBase[r][c], echoBase[r][c + 1], echoBase[r + 1][c], echoBase[r + 1][c + 1]].filter(Boolean);
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
  const MINI_EYES = [];
  MINI.forEach((row, r) => row.forEach((v, c) => { if (v === 2) MINI_EYES.push([r, c]); }));

  // Paint the mini rotated by deg (clockwise) about its own centre, the centre landing on (cr, cc).
  // Inverse mapping with nearest sampling; the eye cells are then placed forward so a 45 degree step
  // never drops them.
  // Screen coordinates, rows down: a clockwise turn by t takes an offset (dr, dc) to
  // (dr cos + dc sin, dc cos - dr sin). Every target cell samples the source at its own centre turned
  // back, so the body has no holes; eyes are carried forward the same way and painted last.
  const MC = 5;                                          // source centre: cell i spans [i, i + 1)
  function miniAt(g, cr, cc, deg) {
    const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
    for (let y = Math.floor(cr - 8); y <= Math.ceil(cr + 8); y++) for (let x = Math.floor(cc - 8); x <= Math.ceil(cc + 8); x++) {
      const dr = y + 0.5 - cr, dc = x + 0.5 - cc;
      const sr = Math.floor(MC + dr * cs - dc * sn), sc = Math.floor(MC + dc * cs + dr * sn);
      if (sr < 0 || sr > 9 || sc < 0 || sc > 9) continue;
      const v = MINI[sr][sc];
      if (v) set(g, y, x, v === 2 ? 3 : v);             // eye cells sample as visor; the eyes go on below
    }
    for (const [er, ec] of MINI_EYES) {
      const dr = er + 0.5 - MC, dc = ec + 0.5 - MC;
      set(g, Math.floor(cr + dr * cs + dc * sn), Math.floor(cc + dc * cs - dr * sn), 2);
    }
    return g;
  }

  // ---------- echo cartwheel ----------
  // The creature glitches down to its mini, cartwheels across the screen left to right (45 degrees a
  // frame, two full turns, hands and feet touching the floor line in turn), rolls off the right edge,
  // and the full creature glitches back in the middle with happy eyes and a ping.
  const echoCartwheel = {
    name: 'ECHO · cartwheel', key: 'echo_cartwheel', fwname: 'echo cartwheel', category: 'Active',
    intent: 'Proposal. The creature shrinks to its mini and cartwheels across the screen, 45 degrees a frame, two full turns from the left edge off the right, then glitches back in the middle, happy; judge whether the rotation reads as a cartwheel and not a spin in place.',
    palette: [...ECHO7, '#eafffb'],   // 7 flash, the dust puff where it lands
    frames: [],
  };
  {
    const f = echoCartwheel.frames;
    f.push({hold: 900, grid: echoPing(false)});
    f.push({hold: 140, grid: echoPing(true)});
    f.push({hold: 60, grid: echoGlitch(), glitch: true});
    const FLOOR = 18, CR = 12;
    for (let k = 0; k <= 16; k++) {                      // 17 steps: centre from col -3 to col 23
      const g = empty();
      const cc = -3 + k * 26 / 16;
      miniAt(g, CR, cc, k * 45);
      for (let c = 0; c < G; c++) set(g, FLOOR, c, 5);    // the floor line
      if (k % 2 === 0 && k > 0 && k < 16) { set(g, FLOOR - 1, Math.round(cc) - 5, 7); set(g, FLOOR - 1, Math.round(cc) + 5, 7); }   // dust on the plant
      f.push({hold: 95, grid: g});
    }
    f.push({hold: 300, grid: (() => { const g = empty(); for (let c = 0; c < G; c++) set(g, FLOOR, c, 5); return g; })()});
    f.push({hold: 60, grid: echoGlitch(), glitch: true});
    const happy = clone(echoBase);
    for (const c of [7, 13]) { set(happy, 6, c, 3); set(happy, 7, c, 3); }
    for (let c = 6; c <= 14; c++) set(happy, 5, c, 3);
    for (const [r, c] of [[5, 6], [6, 7], [7, 6], [5, 14], [6, 13], [7, 14]]) set(happy, r, c, 2);
    f.push({hold: 700, grid: happy});
    f.push({hold: 140, grid: (() => { const g = clone(echoBase); set(g, 1, 15, 4); return g; })()});
    f.push({hold: 700, grid: echoPing(false)});
  }

  L.register([echoCartwheel]);
})(typeof window !== 'undefined' ? window : globalThis);
