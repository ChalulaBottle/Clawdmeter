// Sonnet ultra: the Sonnet tier's own ultra braille (anims.js, the 3x section), one of the ultramodes for
// the tiers that run ultracode (operator, 2026-09-28: fable, opus, sonnet). 60 cell lattice, 8 px cells.
// Sonnet is the calm, precise one, so every step below trades ultra braille's tumble for order.
//
//   creature  the Sonnet tier creature as anims_models.js draws it (antenna tip at rest, a line of ping
//             cells one row under the visor), rebuilt here on echoBase and drawn at exactly 3x.
//   read      a scan line walks down the creature and every row it passes turns to braille: each 3x3
//             block keeps a 2x2 dot. Then every other row drops out (the even rows stay, so the underline
//             visor does), leaving lines of braille.
//   sphere    the lines become a globe of nine latitude rings 20 degrees apart, radius 22 (ultra braille
//             turns at 26), centred on the lattice and tipped 0.4 rad toward the viewer. It opens flat,
//             the lines bend into rings, and the neon purple back arrives once the tilt is full.
//   turn      the dots never move; the light turns. Eight 45 degree bands of cyan, blue, teal and deep
//             blue (bright and dark alternate, so every band edge shows) move 12 degrees a frame: one dot
//             a frame on the 30 dot equator, a full turn in 30 frames. Still dots cannot alias, so the
//             turn reads as a steady chase; rings that moved 12 or 15 degrees a frame would wagon wheel,
//             which ultra braille's Fibonacci scatter hides and clean rings cannot.
//   back      back dots near the edge stay, in neon purple; the far back is left out so the front rings
//             read as clean lines.
//   scan      one ring lights ice white and climbs from the southernmost ring with a front arc (the south
//             cap is all back at this tilt) to the north cap over the turn. It picks up where the read
//             beam stopped (the feet) and hands over to the print beam (the antenna): one beam going down,
//             up, down, never jumping.
//   print     the rings flatten back to lines, the braille creature returns, a scan line walks down it
//             printing it solid, the antenna pings and it rests.
//
// Palette: 0 to 5 are ECHO_PALETTE unchanged (the creature and its underline need them, and #35e0c0 and
// #6fe9ff double as two of the four sphere colours), then 6 neon purple (ultra braille's back side),
// 7 blue, 8 deep blue, 9 ice for whatever the scan touches. All ten stay distinct after RGB565.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {G, clone, set, ECHO_PALETTE, echoBase} = L;

  const N = 60;
  const BODY = 1, VISOR = 3, PING = 4, PURPLE = 6, BLUE = 7, DEEP = 8, ICE = 9;
  const PALETTE = [...ECHO_PALETTE.slice(0, 6), '#b44dff', '#2f5fd6', '#1c3a9c', '#dff8ff'];
  const TAU = Math.PI * 2;
  const empty = () => Array.from({length: N}, () => new Array(N).fill(0));
  const put = (g, r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v; };

  // ---- the creature ----------------------------------------------------------------------------
  // sonnetBase from anims_models.js: echoBase with the antenna tip at rest and the underline visor, ping
  // cells on row 8 from col 7 to col 13 (eye to eye, one row under the visor).
  const TIP = [1, 15], UNDERLINE = {row: 8, from: 7, to: 13};
  const sonnet = (() => {
    const b = clone(echoBase);
    set(b, TIP[0], TIP[1], BODY);
    for (let c = UNDERLINE.from; c <= UNDERLINE.to; c++) set(b, UNDERLINE.row, c, PING);
    return b;
  })();
  const sonnetLit = set(clone(sonnet), TIP[0], TIP[1], PING);   // the antenna pinging
  // Every 20 cell pixel as a k by k block in the top left of its 3x3 home, k from the pixel row: 3 is the
  // creature solid at exactly 3x, 2 its braille (a 2x2 dot, one cell gutter right and below), 0 leaves it out.
  function up(g20, k) {
    const b = empty();
    for (let r = 0; r < G; r++) {
      const s = k(r);
      for (let c = 0; c < G; c++) { const v = g20[r][c]; if (v) for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) b[r * 3 + i][c * 3 + j] = v; }
    }
    return b;
  }
  const solid = g20 => up(g20, () => 3);
  const braille = g20 => up(g20, () => 2);
  const lines = g20 => up(g20, r => (r % 2 ? 0 : 2));
  // The scan line on pixel row p lights that row ice across the silhouette, with a one cell line through
  // its middle over the creature's full width. Reading leaves braille above the beam and solid below it;
  // printing leaves solid above and braille below.
  const BEAM_ROWS = [1, 4, 7, 10, 13, 16];
  const wide = sonnet[0].map((_, c) => sonnet.some(row => row[c]));
  const BEAM_FROM = wide.indexOf(true) * 3, BEAM_TO = wide.lastIndexOf(true) * 3 + 2;   // cols 9 to 53
  function beam(g20, p, reading) {
    const b = up(g20, r => (r !== p && (reading ? r < p : r > p) ? 2 : 3));
    for (let c = 0; c < G; c++) if (g20[p][c]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b[p * 3 + i][c * 3 + j] = ICE;
    for (let c = BEAM_FROM; c <= BEAM_TO; c++) if (!b[p * 3 + 1][c]) b[p * 3 + 1][c] = ICE;
    return b;
  }

  // ---- the globe ---------------------------------------------------------------------------------
  const R = 22, TILT = 0.4, EQ_DOTS = 30, FAR = -0.5;
  const RINGS = [-80, -60, -40, -20, 0, 20, 40, 60, 80].map(d => d * Math.PI / 180);   // south to north
  const BANDS = [PING, BLUE, VISOR, DEEP, PING, BLUE, VISOR, DEEP];                  // 45 degrees each
  // The fixed lattice. Dots per ring follow the ring's circumference (6 16 22 28 30 28 22 16 6), so the
  // pitch along every ring stays between 4 and 5 cells, and every count is even: a ring's dots then mirror
  // about the front centre, so every line of braille sits left and right symmetric on the lattice.
  const DOTS = [];
  RINGS.forEach((phi, ring) => {
    const n = Math.max(4, 2 * Math.round(EQ_DOTS * Math.cos(phi) / 2));
    for (let k = 0; k < n; k++) DOTS.push({ring, phi, th: TAU * k / n});
  });
  // turn: the light's phase in radians. tilt: 0 is flat lines, TILT the globe (top toward the viewer).
  // scan: the ring lit ice, or -1. back: whether the neon purple back side shows.
  function globe(turn, tilt, scan, back) {
    const b = empty(), ct = Math.cos(tilt), st = Math.sin(tilt);
    const order = DOTS.map(({ring, phi, th}) => {
      const x = Math.cos(phi) * Math.cos(th), y = Math.sin(phi), z = Math.cos(phi) * Math.sin(th);   // z toward the viewer
      const lon = (((th + turn) % TAU) + TAU) % TAU;
      return {ring, x, y: y * ct - z * st, z: y * st + z * ct, band: Math.floor(lon / (TAU / BANDS.length)) % BANDS.length};
    }).sort((p, q) => p.z - q.z);                                                     // back first so the front paints last
    for (const p of order) {
      if (p.z < 0 && (!back || p.z < FAR)) continue;
      const v = p.z < 0 ? PURPLE : p.ring === scan ? ICE : BANDS[p.band];
      const r = Math.round(30 - p.y * R - 1), c = Math.round(30 + p.x * R - 1);   // a 2x2 dot centred on the point
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) put(b, r + i, c + j, v);
    }
    return b;
  }
  // The rings the scan visits, south to north: those with a front arc at full tilt.
  const SCAN = RINGS.map((phi, ring) => ({phi, ring})).filter(o => Math.cos(o.phi - TILT) > 0.05).map(o => o.ring);
  const STEPS = 30, STEP = TAU / STEPS;   // one turn: 12 degrees a frame, one equator dot a frame
  const OPEN = [0, 1 / 3, 2 / 3];          // the flat lines bending into rings, as fractions of TILT

  const sonnetUltra = {
    name: 'Sonnet · ultra', key: 'ultra_sonnet', fwname: 'sonnet ultra', category: 'Mode', size: N,
    intent: "Proposal, 60 cells. Sonnet's ultracode, a calm and precise take on ultra braille: a scan line reads the 3x Sonnet creature (underline visor and all) top to bottom and leaves it as braille dots, the dots settle into lines, and the lines bend into a smaller globe of nine clean latitude rings; the dots stay still while cool light (cyan, blue, teal, deep blue) turns round them one dot a frame, the back side shows neon purple round the edge, and one ring lights ice white as the scan climbs from pole to pole over the turn; then the rings flatten, a second scan prints the creature solid again and the antenna pings. Judge whether still dots under moving light read as a steady turn, and whether it says Sonnet next to ultra braille.",
    palette: PALETTE,
    frames: [],
  };
  {
    const f = sonnetUltra.frames;
    let turn = 0;
    const sphere = (tilt, scan, back) => { const g = globe(turn, tilt, scan, back); turn += STEP; return g; };   // the light never stops
    f.push({hold: 800, grid: solid(sonnet)});
    f.push({hold: 140, grid: solid(sonnetLit)});                                        // the antenna pings: ultracode
    for (const p of BEAM_ROWS) f.push({hold: 60, grid: beam(sonnetLit, p, true)});      // read, top to bottom
    f.push({hold: 240, grid: braille(sonnetLit)});
    f.push({hold: 160, grid: lines(sonnetLit)});
    for (const t of OPEN) f.push({hold: 100, grid: sphere(TILT * t, -1, false)});      // the lines bend into rings
    for (let k = 0; k < STEPS; k++) f.push({hold: 100, grid: sphere(TILT, SCAN[Math.floor(k * SCAN.length / STEPS)], true)});   // one turn, the scan climbing
    for (const t of OPEN.slice().reverse()) f.push({hold: 100, grid: sphere(TILT * t, -1, false)});   // and flatten
    f.push({hold: 160, grid: lines(sonnet)});
    f.push({hold: 240, grid: braille(sonnet)});
    for (const p of BEAM_ROWS) f.push({hold: 60, grid: beam(sonnet, p, false)});        // print, top to bottom
    f.push({hold: 140, grid: solid(sonnetLit)});
    f.push({hold: 700, grid: solid(sonnet)});
  }

  L.register([sonnetUltra]);
})(typeof window !== 'undefined' ? window : globalThis);
