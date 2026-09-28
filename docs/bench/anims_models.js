// Model tier creatures for the bench (docs/bench/animations.html): one idle per Claude model tier,
// each built from the ECHO creature (BENCH_LIB.echoBase in anims.js) so the four read as one family.
// Loaded after anims.js; registers into BENCH.anims (script tag in the bench, require() in
// tools/bench_to_json.js). Category 'Model' exports as "ECHO Model", which sits in no firmware
// rotation group on purpose: the host picks the tier by fwname.
//
//   model haiku   one size down (nearest neighbour rescale), light teal visor, quick double blink, 3 s
//   model sonnet  standard creature, thinner second visor line in ping, steady breathe, 2.5 s a breath
//   model opus    body one step brighter, flash visor, antenna tip held lit, slow visor pulse, 4 s
//   model fable   amber antenna tip and amber ear, a ping glint sweeps the visor every 4 s
//
// These are what the desk shows for hours while a model is in use, so each cycle is dominated by
// still holds and the signature motion is either short (haiku, fable) or slow (sonnet, opus).
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {G, rows, clone, set, BASE, blink, shut, ECHO_PALETTE, echoBase, echoPing, echoGlitch, bbox, eyeGeom, skinFrame, spinnerAt, STOCK} = L;

  // echoBase indices: 1 body, 2 dark (eyes), 3 visor, 4 ping (antenna tip, lit), 5 feet.
  // Geometry: body rows 4..13 x cols 5..15; visor rows 6..7, cols 6..14, eyes at cols 7 and 13;
  // arms cols 3..4 and 16..17 over rows 7..10; feet rows 14..16 at cols 5, 8, 12, 15;
  // antenna col 15, stalk rows 2..3, tip row 1.
  const BODY = 1, EYE = 2, VISOR = 3, PING = 4;
  const TIP = [1, 15];

  const blank = () => Array.from({length: G}, () => new Array(G).fill(0));
  const recolor = (g, from, to) => g.map(r => r.map(v => (v === from ? to : v)));
  const tipped = (g, [r, c], v) => set(clone(g), r, c, v);

  // The family blink (as in echo wink): eyes close into the visor. 1 = upper eye cells, 2 = both.
  function lids(g, level) {
    const b = clone(g), e = eyeGeom(g);
    for (const r of (level >= 2 ? e.rows : e.rows.slice(0, 1))) for (let c = 0; c < G; c++) if (b[r][c] === EYE) b[r][c] = VISOR;
    return b;
  }

  // ---- Haiku: one size down ---------------------------------------------------------------------
  // Nearest neighbour index maps: dest i samples src floor(i * n / m). nnMirror runs that sampling
  // in from both edges and keeps the centre, so the dropped lines fall symmetrically (plain nn over
  // 11 to 9 columns drops one body edge; centre sampling drops both eyes).
  const nn = (n, m) => Array.from({length: m}, (_, i) => Math.floor(i * n / m));
  function nnMirror(n, m) { // n and m odd
    const hn = (n - 1) / 2, hm = (m - 1) / 2, half = nn(hn, hm), out = new Array(m);
    for (let i = 0; i < hm; i++) { out[i] = half[i]; out[m - 1 - i] = n - 1 - half[i]; }
    out[hm] = hn;
    return out;
  }
  function resample(src, rowMap, colMap, top, left) {
    const b = blank();
    rowMap.forEach((sr, i) => colMap.forEach((sc, j) => set(b, top + i, left + j, src[sr][sc])));
    return b;
  }
  // Body 11 x 10 (rows 4..13, cols 5..15) to 9 x 8: rows by nn (drops arm row 8 and belly row 13),
  // columns by nnMirror (drops visor cols 9 and 11, so both eyes, both visor pads and all four feet
  // survive). Antenna, arms and feet ride along unscaled, so the whole silhouette loses one row top
  // and bottom (rows 1..16 to 2..15) and one column each side (cols 3..17 to 4..16).
  const H_ROWS = [1, 2, 3, ...nn(10, 8).map(i => 4 + i), 14, 15, 16];
  const H_COLS = [3, 4, ...nnMirror(11, 9).map(i => 5 + i), 16, 17];
  const H_TOP = 2, H_LEFT = 4;
  const haikuBase = resample(echoBase, H_ROWS, H_COLS, H_TOP, H_LEFT);
  const haiku = (() => {
    const tip = [H_TOP + H_ROWS.indexOf(TIP[0]), H_LEFT + H_COLS.indexOf(TIP[1])];
    const rest = tipped(haikuBase, tip, BODY);  // antenna dark while it rests
    const lit = haikuBase;                      // tip pings through the blink burst
    return {
      name: 'Model · Haiku', key: 'model_haiku', fwname: 'model haiku', category: 'Model',
      intent: 'Haiku tier: the ECHO creature one size down (body rescaled nearest neighbour from 11 by 10 to 9 by 8, both eyes and all four feet kept) with a light teal visor and a quick double blink every 3 s; judge whether it still reads as Clawd at the smaller size.',
      palette: ['transparent', '#17836f', '#06090b', '#6fe9ff', '#6fe9ff', '#0f5a4c'],
      frames: [
        {hold: 2560, grid: rest},
        {hold: 50, grid: lids(lit, 1)}, {hold: 70, grid: lids(lit, 2)}, {hold: 50, grid: lids(lit, 1)},
        {hold: 100, grid: lit},
        {hold: 50, grid: lids(lit, 1)}, {hold: 70, grid: lids(lit, 2)}, {hold: 50, grid: lids(lit, 1)},
      ],
    };
  })();

  // ---- Sonnet: second visor line, steady breathe -------------------------------------------------
  // Breathe with the feet planted. lift1 is the family's own breathe (echoBreathe in anims.js): drop
  // a forehead row and repeat the last belly row, so visor, line and arms rise one row. lift2 then
  // raises the crown and antenna as well: the body stands one row taller. Both need row 0 empty.
  const BELLY = 13;
  const lift1 = g => { const b = clone(g); b.splice(4, 1); b.splice(BELLY, 0, g[BELLY].slice()); return b; };
  const lift2 = g => { const b = clone(g); b.splice(0, 1); b.splice(BELLY, 0, g[BELLY].slice()); return b; };
  const S_LINE = {row: 8, from: 7, to: 13};  // one row under the visor, eye to eye (7 wide under 9)
  const sonnetBase = (() => {
    const b = tipped(echoBase, TIP, BODY);
    for (let c = S_LINE.from; c <= S_LINE.to; c++) set(b, S_LINE.row, c, PING);
    return b;
  })();
  const sonnet = (() => {
    const out = sonnetBase, mid = lift1(sonnetBase), full = lift2(sonnetBase), ping = lift2(tipped(sonnetBase, TIP, PING));
    return {
      name: 'Model · Sonnet', key: 'model_sonnet', fwname: 'model sonnet', category: 'Model',
      intent: 'Sonnet tier: the standard ECHO creature with a thinner second visor line of ping cells one row under the visor, breathing steadily every 2.5 s with the feet planted and the antenna pinging every other breath; judge whether the breath stays calm over hours.',
      palette: ECHO_PALETTE.slice(),
      frames: [
        {hold: 1000, grid: out}, {hold: 250, grid: mid}, {hold: 1000, grid: full}, {hold: 250, grid: mid},
        {hold: 1000, grid: out}, {hold: 250, grid: mid}, {hold: 140, grid: ping}, {hold: 860, grid: full}, {hold: 250, grid: mid},
      ],
    };
  })();

  // ---- Opus: brighter, flash visor, slow pulse ---------------------------------------------------
  // Same Opus ramp as the mode cells in anims_modes.js (opus enter, opus work), so tier and mode read
  // as one Opus: the whole ramp one step up (body #1fa88c, feet #17836f) and #90f0dd, halfway from
  // the visor teal to flash, as the shared middle tone. Here the visor rests on flash and eases down
  // through a quarter step #bdf7ec to #90f0dd and back. All three stay distinct after RGB565
  // (R 29 23 18, G 63 61 60, B 31 29 27), so the panel shows every step the bench shows. Frame 0 is
  // the flash state; the antenna tip is echoBase's lit tip, never switched off.
  const O_LEVELS = [VISOR, 6, 7];
  const opusAt = (k, tipOn = true) => tipped(recolor(echoBase, VISOR, O_LEVELS[k]), TIP, tipOn ? PING : BODY);
  // Operator 2026-09-28: "make opus antenna blink more". The tip now beats on/off through the whole
  // pulse (roughly 2 beats a second) instead of resting lit.
  const opus = {
    name: 'Model · Opus', key: 'model_opus', fwname: 'model opus', category: 'Model',
    intent: 'Opus tier: the full creature one step brighter (body #1fa88c, feet #17836f, visor flash #eafffb), antenna tip beating on and off through a slow 4 s visor pulse; judge whether the beat reads as busy without pulling the eye.',
    palette: ['transparent', '#1fa88c', '#06090b', '#eafffb', '#6fe9ff', '#17836f', '#bdf7ec', '#90f0dd'],
    frames: [
      {hold: 320, grid: opusAt(0, true)}, {hold: 220, grid: opusAt(0, false)}, {hold: 320, grid: opusAt(0, true)}, {hold: 220, grid: opusAt(0, false)},
      {hold: 320, grid: opusAt(0, true)}, {hold: 220, grid: opusAt(1, false)}, {hold: 320, grid: opusAt(1, true)},
      {hold: 220, grid: opusAt(2, false)}, {hold: 320, grid: opusAt(2, true)}, {hold: 220, grid: opusAt(2, false)}, {hold: 320, grid: opusAt(2, true)},
      {hold: 220, grid: opusAt(1, false)}, {hold: 320, grid: opusAt(1, true)},
    ],
  };

  // ---- Fable: amber marks, visor sweep ------------------------------------------------------------
  // Amber tip and a two cell ear rooted on the top left body corner (4,5), pointing up and out.
  // Every 4 s a single ping cell glides along the upper visor row, left to right, then right to left
  // on the next pass; over an eye it is hidden, as if passing behind it.
  const AMBER = 6;
  const EAR = [[3, 5], [2, 4]];
  const GLINT_ROW = 6, STEP = 140, PASS = 4000;
  const fableBase = (() => {
    const b = tipped(echoBase, TIP, AMBER);
    for (const [r, c] of EAR) set(b, r, c, AMBER);
    // Operator 2026-09-28: "make fable's eyes sideways". The family's eyes stand 1 wide by 2 tall;
    // Fable's lie 2 wide by 1 tall on the lower visor row, so the upper row is a clean glint track.
    for (const [r, c] of [[6, 7], [7, 7], [6, 13], [7, 13]]) set(b, r, c, VISOR);
    for (const c of [7, 8, 12, 13]) set(b, 7, c, EYE);
    return b;
  })();
  const glintAt = c => { const b = clone(fableBase); if (b[GLINT_ROW][c] === VISOR) b[GLINT_ROW][c] = PING; return b; };
  const fable = (() => {
    const cols = []; for (let c = 0; c < G; c++) if (echoBase[GLINT_ROW][c] === VISOR || echoBase[GLINT_ROW][c] === EYE) cols.push(c);
    const sweep = cs => cs.map(c => ({hold: STEP, grid: glintAt(c)}));
    const rest = PASS - cols.length * STEP;
    return {
      name: 'Model · Fable', key: 'model_fable', fwname: 'model fable', category: 'Model',
      intent: 'Fable tier: the ECHO creature with an amber antenna tip and a two cell amber ear on the top left corner, and a ping glint sweeping the visor every 4 s, alternating direction; judge whether the amber alone marks the newest tier.',
      palette: ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#e0b25a'],
      frames: [
        {hold: rest, grid: fableBase}, ...sweep(cols),
        {hold: rest, grid: fableBase}, ...sweep(cols.slice().reverse()),
      ],
    };
  })();

  L.register([haiku, sonnet, opus, fable]);
})(typeof window !== 'undefined' ? window : globalThis);
