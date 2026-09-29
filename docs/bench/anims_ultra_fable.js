// Ultracode for the Fable tier (operator, 2026-09-28: "thats such a sick braille", an ultramode like ultra
// braille for each model tier that runs ultracode). ultra braille (anims.js) retold in Fable's marks, 60 cells.
//
// The creature is model fable (anims_models.js) drawn at exactly 3x: the amber antenna tip, the two cell amber
// ear on the top left corner and the four sideways eyes on the lower visor row. A glitch split lights the four
// eyes in the sphere's colours and the body dissolves, the ear, tip and eyes last. A braille sphere grows out of
// the visor: the Fibonacci lattice of ultra braille, each dot a 2x2 block, cut into four longitude quarters, one
// per eye. Each quarter keeps its own colour as it turns (amber, magenta, amber, red on the front, neon purple
// on the back) and turns at a slightly different speed, so the four fan apart along their seams and close up
// again. Midway the axis lies down sideways, a quarter roll in the screen plane, so the quarters roll over the
// sphere as four sideways eyes; they fan apart once more, the sphere shrinks back into the visor and the
// creature reassembles around its four lit eyes, which the closing glitch turns dark again.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {G, clone, set, echoBase} = L;

  const N = 60;                                   // lattice: 8 px cells on the 480 px panel
  // 0..3 and 5 as ECHO_PALETTE. 4 is the tip index in echoBase and here it holds the Fable amber of model
  // fable, so the tip is Fable amber without a repaint (the cyan ping has no job in this cell, and the cap is
  // 10 colours). 6 neon purple sits where ultra braille keeps it, so the glitch visor paints purple as there.
  const PALETTE = ['transparent', '#17836f', '#06090b', '#35e0c0', '#e0b25a', '#0f5a4c',
                   '#b44dff', '#ff5fd2', '#ff4b4b', '#ffd166'];
  const EYE = 2, VISOR = 3, FABLE = 4, PURPLE = 6, MAGENTA = 7, RED = 8, AMBER = 9;

  // ---- the Fable creature, 20 cells, then exactly 3x ------------------------------------------------------
  // Cell for cell as fableBase in anims_models.js: echoBase with the tip (1,15) and the ear (3,5), (2,4) in
  // Fable amber, the visor band (rows 6..7, cols 6..14) repainted plain, and four single eyes on row 7.
  const EYE_ROW = 7, EYE_COLS = [6, 8, 12, 14];
  const QUARTER = [AMBER, MAGENTA, AMBER, RED];   // each quarter's front colour; eye k lights in quarter k's
  const DARK4 = [EYE, EYE, EYE, EYE];
  function fable20(eyes, tip = FABLE) {
    const b = clone(echoBase);
    for (const [r, c] of [[3, 5], [2, 4]]) set(b, r, c, FABLE);
    set(b, 1, 15, tip);
    for (const r of [6, 7]) for (let c = 6; c <= 14; c++) set(b, r, c, VISOR);
    EYE_COLS.forEach((c, k) => set(b, EYE_ROW, c, eyes[k]));
    return b;
  }
  // The family glitch split on the Fable face: rows 6..8 one cell right, the visor in neon purple.
  function glitch20() {
    const b = fable20(DARK4);
    for (const r of [6, 7, 8]) { const row = b[r].slice(); for (let c = G - 1; c > 0; c--) b[r][c] = row[c - 1]; b[r][0] = 0; }
    for (const r of [6, 7]) for (let c = 0; c < G; c++) if (b[r][c] === VISOR) b[r][c] = PURPLE;
    return b;
  }
  const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
  function up3(g20) {                                                    // exact 3x of a 20 cell frame
    const b = blank();
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g20[r][c]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b[r * 3 + i][c * 3 + j] = g20[r][c];
    return b;
  }
  const rest = () => up3(fable20(DARK4));
  const lit = (tip = FABLE) => up3(fable20(QUARTER, tip));
  const glitch = () => up3(glitch20());

  // The dissolve of ultra braille (a cell stays while (7r + 3c) mod 5 >= k), except that the Fable marks stay
  // whole: the amber ear and tip and the four lit eyes are the last cells to go and the first back.
  const MARKS = new Set([FABLE, AMBER, MAGENTA, RED]);
  function dissolve(g60, k) {
    const b = blank();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = g60[r][c]; if (v && (MARKS.has(v) || ((r * 7 + c * 3) % 5) >= k)) b[r][c] = v; }
    return b;
  }

  // ---- the sphere: four quarters ---------------------------------------------------------------------------
  // ultra braille's 240 point Fibonacci sphere. Each point's quarter is its longitude around the body's pole,
  // taken once on the body, so a quarter is the same dots and the same colour however far it has turned.
  const PTS = (() => {
    const n = 240, out = [], phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), t = phi * i;
      const x = Math.cos(t) * rad, z = Math.sin(t) * rad;
      out.push({x, y, z, q: Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * 4) % 4});
    }
    return out;
  })();
  // Each quarter's share of the drift: four speeds a step apart, so every seam but one opens by the same
  // amount while the fastest quarter runs into the slowest, and all four close up again as the drift eases.
  const SPEED = [-1.5, -0.5, 0.5, 1.5];
  // ultra braille thins the far back; here it is dropped (depth under BACK), so the quarters read clean on the
  // face and their seams open onto black, while the back that turns toward the limb shows as a neon purple rim.
  const BACK = -0.35;
  // angle: the turn about the body's pole; drift: radians a speed step, added per quarter; tilt: the pole
  // tipped toward the viewer (negative shows the top); roll: the axis turned in the screen plane (a quarter
  // roll lays it sideways); radius and centre in cells.
  function sphere({angle, drift = 0, radius, tilt, roll = 0, cy = 30, cx = 30}) {
    const b = blank();
    const ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
    const order = PTS.map(p => {
      const a = angle + drift * SPEED[p.q], ca = Math.cos(a), sa = Math.sin(a);
      const x1 = p.x * ca - p.z * sa, z1 = p.x * sa + p.z * ca;          // turn about the pole
      const y2 = p.y * ct - z1 * st, z2 = p.y * st + z1 * ct;            // tip the pole toward the viewer
      const x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;              // roll the axis in the screen plane
      return {x: x3, y: y3, z: z2, q: p.q};
    }).sort((u, w) => u.z - w.z);                                       // back first, so the front paints last
    for (const p of order) {
      if (p.z < BACK) continue;
      const r = Math.round(cy + p.y * radius), c = Math.round(cx + p.x * radius);
      const v = p.z >= 0 ? QUARTER[p.q] : PURPLE;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) set(b, r + i, c + j, v);
    }
    return b;
  }

  // ---- the cycle -------------------------------------------------------------------------------------------
  const STEP = Math.PI / 12;                      // the turn per sphere frame, 15 degrees, as ultra braille
  const TILT = -0.45;                             // the top pole in view, where the four quarters meet
  const DRIFT = 0.3;                              // the widest drift per speed step, radians
  const SIDEWAYS = Math.PI / 2;
  const EYE_CY = 21, EYE_CX = 30.5;               // the lower visor row, where the sphere comes out and goes back
  const smooth = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fableUltra = {
    name: 'Fable · ultra', key: 'ultra_fable', fwname: 'fable ultra', category: 'Mode', size: N,
    intent: 'Proposal, 60 cells. Ultracode for the Fable tier, ultra braille in Fable\'s marks: the Fable creature (amber ear and antenna tip, four sideways eyes) glitches, its four eyes light amber, magenta, amber and red, and it dissolves into a braille sphere cut into four quarters, one per eye, each keeping its colour on the front and neon purple on the back and turning at a slightly different speed, so the four fan apart along their seams and close up again; midway the axis lies down sideways and the quarters roll over the sphere as four sideways eyes, fan apart once more, and the sphere shrinks back into the visor as the creature reassembles around its lit eyes; judge whether the fanning quarters read as the four eyes and the sideways axis as Fable, not as ultra braille recoloured.',
    palette: PALETTE,
    frames: [],
  };
  {
    const f = fableUltra.frames;
    let a = 0;
    const drifting = (i, n) => DRIFT * Math.sin(Math.PI * (i + 1) / (n + 1));   // eases out and back inside the run
    f.push({hold: 900, grid: rest()});
    f.push({hold: 60, grid: glitch(), glitch: true});
    for (let k = 1; k <= 4; k++) f.push({hold: 80, grid: dissolve(lit(), k)});        // the body thins, the marks stay
    for (let k = 0; k < 6; k++, a += STEP) {                                          // the sphere grows out of the visor
      const t = smooth(k / 5);
      f.push({hold: 70, grid: sphere({angle: a, radius: 10 + k * 3, tilt: TILT, cy: lerp(EYE_CY, 30, t), cx: lerp(EYE_CX, 30, t)})});
    }
    for (let i = 0; i < 12; i++, a += STEP) f.push({hold: 90, grid: sphere({angle: a, drift: drifting(i, 12), radius: 26, tilt: TILT})});   // the quarters fan apart and close
    for (let i = 0; i < 6; i++, a += STEP) f.push({hold: 90, grid: sphere({angle: a, radius: 26, tilt: TILT, roll: SIDEWAYS * smooth((i + 1) / 7)})});   // the axis lies down sideways
    for (let i = 0; i < 12; i++, a += STEP) f.push({hold: 90, grid: sphere({angle: a, drift: drifting(i, 12), radius: 26, tilt: TILT, roll: SIDEWAYS})});   // four sideways eyes, fanning again
    for (let k = 5; k >= 0; k--, a += STEP) {                                         // shrinks back into the visor
      const t = smooth(k / 5);
      f.push({hold: 70, grid: sphere({angle: a, radius: 10 + k * 3, tilt: TILT, roll: SIDEWAYS, cy: lerp(EYE_CY, 30, t), cx: lerp(EYE_CX, 30, t)})});
    }
    for (let k = 4; k >= 1; k--) f.push({hold: 80, grid: dissolve(lit(), k)});       // reassembles around the lit eyes
    f.push({hold: 1000, grid: lit(AMBER)});                                           // the tip pings bright amber
    f.push({hold: 60, grid: glitch(), glitch: true});                                 // and the glitch turns the eyes dark
    f.push({hold: 700, grid: rest()});
  }

  L.register([fableUltra]);
})(typeof window !== 'undefined' ? window : globalThis);
