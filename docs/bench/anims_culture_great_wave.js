// Culture creatures: famous paintings, memes and pop culture with the ECHO creature in every role (operator, 2026-10-02:
// "famous paintings, memes, popculture to be added to the animation list ... get crazy get creative"). Drawn from scratch
// in code on the ECHO base. Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
//
// ECHO · great wave: an homage to Hokusai's Under the Wave off Kanagawa (about 1831, public domain), on the 60 cell
// lattice, 8 px cells on the 480 panel, as a full bleed scene: a cream paper sky, a Prussian blue wave rearing up from
// the left with its crest near the top of the panel and its lip breaking into white claws of foam that reach out over the
// gap toward a small snow capped mountain on the horizon, and the creature on a teal board in the trough under the claws,
// where the print has its boats. The composition, the setting and the gesture are the print's; every cell is drawn here.
// Keep the whole scene when a sticker or an icon is cut from it: a well known surf brand's logo is a wave over a mountain
// drawn from this same print, so never crop it down to the wave and the mountain with the surfer.
// Why 1x and not 3x: the wave has to dwarf the surfer. The creature is the family's 20 cell pose painted at 1x, one family
// cell to one 8 px cell (15 x 16 cells with the antenna), so the wave stands two and a half times its height; at 2x (30 x
// 32) it filled the barrel and left the curl nowhere to go, and at 3x it would not fit under the crest at all. Squinted
// down to 120 px it still reads as a teal figure with a visor band, an antenna and a board.
// The wave is drawn, not stamped: a pose is two chains of 14 points, the outer one from the left edge over the crest to
// the lip's tip and the inner one back under the lip and down the face to the trough, smoothed (Catmull Rom) and filled at
// cell centres; any two poses blend point by point, so the in betweens come free, and while it rises the face stays behind
// the creature.
// Inside the water the distance to the outer surface draws the print's lighter striations (bands near 3.6, 7.4 and 11.4
// cells in), a light rim lines the face, the crest carries a white band of foam, and a Prussian key line is drawn wherever
// foam meets the sky, as the woodblock's outlines are. The claws are fingers grown from the lip: each a near straight
// shaft out along the surface normal that hooks over its last quarter, three short tufts on the crest and five long
// fingers down the front; the grasp pose curls every hook tighter.
//   barrel   the dominant state, 4.4 s: the claws open and grasp by turns, drops of spray fall from the fingertips toward
//            the mountain like the print's snow, a blink, a glance at the mountain, two antenna pings.
//   throw    the lip throws and closes out in front of it, a tube round the creature, its eyes shut tight.
//   crash    the lip lands, the crest caves in over a growing puff of whitewater and bursts into a cauliflower of foam
//            (puffs painted back to front, a light blue contour wherever one lands on another); the creature is thrown
//            clear on its board, arms flung up in a V, happy eyes and a ping at the top of the air, hangs, and falls.
//   swell    it lands in a splash between flat foam patches on a low swell, bobs, and looks back over its shoulder.
//   rise     the next wave rears up behind it, mound, steep (a ping: here it comes), pitch, and curls over into the barrel,
//            which is frame 0 again.
// The sea: three bands of scallops, the near one white capped, scrolling right at three speeds, 9, 12 and 20 cells a loop;
// each band moves exactly one of its own periods in one loop, so the last frame meets the first without a jump, and the
// near band steps 2 cells (16 px) at most between frames, a calm sea, as the print's is.
// Constants: 60 cells of 8 px; sea from row 47; the family frame at row 28, col 22 (feet on row 44, the board rows 44..46,
// cols 23..40); the mountain 17 x 8 at row 39, col 42; claws 3.5 to 7.5 cells; 30 frames, 8.3 s.
// Palette: 0..5 from the library's ECHO_PALETTE, 0 unused (the scene is full bleed, no cell is panel black) and 1..5 the
// family's (3 is also the board, 5 its underside; 4, the ping, gets a Prussian key line where it meets the sky, which the
// cyan alone would vanish into); 6 foam white (the crest, claws, drops, spray, whitewater, the snow cap); 7 Prussian blue
// (the wave, the sea, the key lines); 8 a lighter blue (the striations, the face's rim, the mountain, the scallops, the
// foam's contours); 9 cream paper (the sky). Index 6 is not ping here, so no frame goes through echoGlitch.
// Big tier: 30 frames of 3600 cells are 108000 bytes of firmware table, so it ships only on boards built with SPLASH_BIG.
(function (root) {
  const L = root.BENCH_LIB;
  const {echoPing, ECHO_PALETTE} = L;

  const echoGreatWave = (() => {
    const N = 60;
    const BODY = 1, EYE = 2, VISOR = 3, FEET = 5, FOAM = 6, DEEP = 7, BLUE = 8, SKY = 9;   // 4, the ping, comes with echoPing
    const SEA = 47;                                                // the first sea row: the horizon and the trough
    const OY = 28, OX = 22;                                        // the family's 20 cell frame on the panel, at 1x
    const BOARD = [44, 23];                                        // the board sprite's top left
    const DRIP_MAX = 36;                                           // drops stop above the mountain's peak (row 39)

    const blank = v => Array.from({length: N}, () => new Array(N).fill(v));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    const rad = d => d * Math.PI / 180;
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    // ---- geometry ----
    // Catmull Rom through pts ([x, y]), k samples a span, the end points kept.
    function spline(pts, k = 8) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let j = 0; j < k; j++) {
          const t = j / k, t2 = t * t, t3 = t2 * t;
          out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
        }
      }
      out.push(pts[pts.length - 1].slice());
      return out;
    }
    // The polygon filled row by row at cell centres, even odd: on row r the edges' crossings are sorted and a cell is
    // inside from an odd crossing (inclusive) to the next (exclusive). Returns a row of booleans for each row up to rows.
    function fill(P, rows) {
      const n = P.length, xs = new Float64Array(n), ys = new Float64Array(n), out = [];
      for (let i = 0; i < n; i++) { xs[i] = P[i][0]; ys[i] = P[i][1]; }
      for (let r = 0; r < rows; r++) {
        const y = r + 0.5, cut = [], row = new Array(N).fill(false);
        for (let i = 0, j = n - 1; i < n; j = i++) if ((ys[i] > y) !== (ys[j] > y)) cut.push((xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i]);
        cut.sort((a, b) => a - b);
        for (let k = 0; k + 1 < cut.length; k += 2) for (let c = Math.max(0, Math.ceil(cut[k] - 0.5)); c < N && c + 0.5 < cut[k + 1]; c++) row[c] = true;
        out.push(row);
      }
      return out;
    }
    // A polyline as flat arrays with its running arc length; the distance from (x, y) to it and the arc length of the
    // nearest point.
    function flat(line) {
      const n = line.length, x = new Float64Array(n), y = new Float64Array(n), acc = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = line[i][0]; y[i] = line[i][1];
        if (i) acc[i] = acc[i - 1] + Math.sqrt((x[i] - x[i - 1]) ** 2 + (y[i] - y[i - 1]) ** 2);
      }
      return {x, y, acc, n};
    }
    function nearest(px, py, L) {
      const {x, y, acc, n} = L;
      let best = Infinity, at = 0;
      for (let i = 0; i + 1 < n; i++) {
        const ax = x[i], ay = y[i], vx = x[i + 1] - ax, vy = y[i + 1] - ay, l = vx * vx + vy * vy;
        const t = l ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l)) : 0;
        const dx = px - ax - t * vx, dy = py - ay - t * vy, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; at = acc[i] + t * (acc[i + 1] - acc[i]); }
      }
      return [Math.sqrt(best), at];
    }
    // The point at arc length s and the unit tangent there: [x, y, tx, ty].
    function pointAt(L, s) {
      const {x, y, acc, n} = L;
      let i = 0;
      while (i + 2 < n && acc[i + 1] < s) i++;
      const t = Math.max(0, Math.min(1, (s - acc[i]) / (acc[i + 1] - acc[i] || 1)));
      const vx = x[i + 1] - x[i], vy = y[i + 1] - y[i], l = Math.sqrt(vx * vx + vy * vy) || 1;
      return [x[i] + vx * t, y[i] + vy * t, vx / l, vy / l];
    }
    // A finger of foam from (x0, y0) at ang degrees (0 right, 90 down): it bends curl degrees a cell, then hook degrees a
    // cell over its last quarter (clockwise, the way the wave itself curls), its half width w0 at the root tapering to a
    // one cell point. Returns the tip.
    function claw(g, x0, y0, ang, curl, len, w0, hook) {
      let x = x0, y = y0, a = ang;
      const step = 0.2;
      for (let s = 0; s <= len; s += step) {
        const w = w0 * (1 - s / len) + 0.5 * (s / len);
        for (let r = Math.floor(y - w - 1); r <= Math.ceil(y + w + 1); r++) for (let c = Math.floor(x - w - 1); c <= Math.ceil(x + w + 1); c++) {
          if (Math.hypot(c + 0.5 - x, r + 0.5 - y) <= w) put(g, r, c, FOAM);
        }
        put(g, Math.floor(y), Math.floor(x), FOAM);
        x += Math.cos(rad(a)) * step; y += Math.sin(rad(a)) * step;
        a += (s > len * 0.72 ? hook : curl) * step;
      }
      return [x, y];
    }

    // ---- the poses: [x, y] = [col, row]. outer: from the left edge over the crest to the lip's tip; inner: from the tip
    // back under the lip and down the face to the trough. Every pose has 14 + 14 points and 8 claws, so any two blend.
    // A claw: [where along the lip from the crest top (0) to the tip (1), degrees forward of the normal, curl, length,
    // root half width, hook]; a length under 1.5 draws nothing.
    const TUFTS = [[0.04, 30, 10, 3.5, 0.8, 70], [0.14, 30, 10, 3.5, 0.8, 70], [0.24, 30, 10, 4, 0.8, 70]];
    const FINGERS = [[0.37, 5, 4, 7, 0.9, 75], [0.53, 5, 4, 7.5, 0.9, 75], [0.69, 5, 4, 7.5, 0.9, 75], [0.85, 5, 4, 7, 0.9, 75], [0.99, 5, 4, 6, 0.9, 75]];
    const CLAWS = [...TUFTS, ...FINGERS];
    const none = CLAWS.map(([u, o, c, , w, h]) => [u, o, c, 0, w, h]);
    const P = {
      swell: {                                                     // low and spent, the foam on it in dashes
        outer: [[-2, 42], [2, 40.5], [5, 39.5], [8, 39], [11, 39.2], [13.5, 40], [15.5, 41.2], [17.5, 42.5], [19, 43.8], [20.3, 44.8], [21.4, 45.6], [22.3, 46.2], [23, 46.6], [23.6, 46.9]],
        inner: [[23.5, 47], [23.6, 47], [23.7, 47], [23.8, 47.05], [23.9, 47.1], [24, 47.1], [24.2, 47.15], [24.5, 47.2], [24.8, 47.25], [25.2, 47.3], [25.7, 47.35], [26.2, 47.4], [26.8, 47.45], [27.5, 47.5]],
        claws: none, foam: 1, dash: 1,
      },
      mound: {
        outer: [[-2, 43], [2, 40.5], [6, 37.5], [9, 35], [12, 33.5], [15, 33], [17.5, 33.5], [19.5, 35], [21, 37], [22, 39.5], [22.7, 42], [23.2, 44], [23.6, 45.5], [24, 46.5]],
        inner: [[23.8, 46.6], [23.7, 46.6], [23.6, 46.6], [23.5, 46.6], [23.4, 46.6], [23.4, 46.7], [23.5, 46.8], [23.7, 46.9], [24, 47], [24.5, 47.1], [25, 47.2], [25.8, 47.3], [26.6, 47.4], [27.5, 47.5]],
        claws: none, foam: 0.8, dash: 0,
      },
      steep: {                                                     // the face a wall just behind the creature
        outer: [[-2, 40], [2, 36], [6, 31], [10, 26], [13, 21], [16, 17.5], [19, 15.5], [21.5, 15], [23.5, 15.8], [24.5, 17], [25, 18.5], [25.2, 20], [25.2, 21.3], [25.1, 22.5]],
        inner: [[24.6, 22.6], [24.5, 22.4], [24.4, 22.2], [24.3, 22.0], [24.2, 21.9], [24.1, 22.0], [24.0, 22.5], [23.8, 24], [23.4, 27], [23, 31], [22.8, 36], [23.2, 41], [25, 45.5], [27.5, 47.5]],
        claws: none, foam: 1, dash: 0,
      },
      pitch: {                                                     // the lip starts to throw, short claws
        outer: [[-2, 35], [3, 31], [7, 26], [11, 21], [15, 16], [19, 12], [23, 9.5], [27, 8.5], [31, 9], [34, 10.5], [36.5, 13], [37.5, 15.5], [37.5, 18], [36.5, 20]],
        inner: [[35.5, 20], [35.2, 18.5], [34.5, 17.2], [33, 16.3], [31, 16], [29, 16.3], [26.5, 17.5], [24.5, 20.5], [23, 25], [22, 31], [22, 37], [23, 42], [25, 45.5], [27.5, 47.5]],
        claws: [...TUFTS.map(k => [k[0], k[1], k[2], 2.5, k[4], k[5]]), ...FINGERS.map(k => [k[0], k[1], k[2], 4, k[4], k[5]])], foam: 1, dash: 0,
      },
      hero: {                                                      // the print: the crest near the top, the claws over the gap
        outer: [[-2, 31], [3, 27], [8, 22], [12, 17], [16, 12], [21, 8], [27, 5.5], [33, 5], [38, 6.5], [42, 9.5], [45.5, 13.5], [47, 18], [46.5, 22], [44.5, 25.5]],
        inner: [[42.5, 25], [42.5, 21], [41, 17], [38, 14], [34, 12.5], [30, 13], [26.5, 15.5], [24, 19.5], [22.5, 25], [21.5, 31], [21.5, 37], [22.5, 42], [24.5, 45.5], [27.5, 47.5]],
        claws: CLAWS, foam: 1, dash: 0,
      },
      throw: {                                                     // the lip reaching down in front of the creature
        outer: [[-2, 32], [3, 28], [8, 23], [12, 18], [16, 13.5], [21, 10], [27, 8], [33, 8], [38.5, 9.5], [43, 13], [46.5, 18], [48, 24], [47.5, 30], [46, 35]],
        inner: [[44, 34.5], [44.5, 29.5], [43.5, 24], [41, 19], [37.5, 16], [33, 15], [28.5, 16], [25.5, 19], [23.5, 24], [22, 30], [21.5, 36], [22.5, 42], [24.5, 45.5], [27.5, 47.5]],
        claws: [...TUFTS, ...FINGERS.map(k => [k[0], k[1] + 10, k[2], k[3] - 1, k[4], k[5] + 10])], foam: 1, dash: 0,
      },
      close: {                                                     // the tip on the water: a tube
        outer: [[-2, 33], [3, 29], [8, 24.5], [12, 20], [16, 16], [21, 12.5], [27, 10.5], [33, 10.5], [38.5, 12], [43, 15.5], [46.5, 21], [48, 28], [47.5, 36], [46.5, 44.5]],
        inner: [[44.5, 44], [45, 37], [44, 29], [42, 22], [38.5, 18], [33.5, 17], [29, 18], [26, 21], [23.8, 26], [22.2, 32], [21.7, 38], [22.5, 43], [24.5, 45.5], [27.5, 47.5]],
        claws: [...TUFTS, ...FINGERS.map(k => [k[0], k[1] + 15, k[2], k[3] - 2, k[4], k[5]])], foam: 1, dash: 0,
      },
      fallen: {                                                    // what is left under the whitewater
        outer: [[-2, 36], [3, 33], [8, 30], [13, 28], [18, 27], [23, 27], [28, 28], [33, 29.5], [37, 31.5], [40.5, 34], [43.5, 37], [46, 40], [47.5, 43], [48.5, 46]],
        inner: [[47.5, 46.8], [46.5, 46.9], [45, 47], [43, 47], [41, 47.05], [39, 47.1], [37, 47.15], [35, 47.2], [33, 47.25], [31, 47.3], [29.5, 47.35], [28.5, 47.4], [28, 47.45], [27.5, 47.5]],
        claws: none, foam: 1, dash: 0,
      },
    };
    P.grasp = {...P.hero, claws: [...TUFTS.map(k => [k[0], k[1] + 8, k[2], k[3], k[4], k[5] + 20]), ...FINGERS.map(k => [k[0], k[1] + 8, k[2] + 4, k[3] - 0.5, k[4], k[5] + 25])]};
    const lerp = (a, b, t) => a + (b - a) * t;
    const blend = (a, b, t) => ({
      outer: a.outer.map((p, i) => [lerp(p[0], b.outer[i][0], t), lerp(p[1], b.outer[i][1], t)]),
      inner: a.inner.map((p, i) => [lerp(p[0], b.inner[i][0], t), lerp(p[1], b.inner[i][1], t)]),
      claws: a.claws.map((k, i) => k.map((v, j) => lerp(v, b.claws[i][j], t))),
      foam: lerp(a.foam, b.foam, t), dash: t < 0.5 ? a.dash : b.dash,
    });

    // ---- sprites ----
    // Letters: W foam, B lighter blue, D Prussian, v the board's teal, f its underside; '.' leaves the cell alone.
    const INK = {W: FOAM, B: BLUE, D: DEEP, v: VISOR, f: FEET};
    const stamp = (g, art, r0, c0) => { art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(g, r0 + dr, c0 + dc, INK[ch]); })); return g; };
    const MOUNTAIN = [                                             // 17 x 8, its foot under the horizon
      '.......WWW.......',
      '......WWWWW......',
      '.....WWWWWWW.....',
      '....WWBWWWBWW....',
      '...BWBBWBWBBWB...',
      '..BBBBBBBBBBBBB..',
      '.BBBBBBBBBBBBBBB.',
      'BBBBBBBBBBBBBBBBB',
    ];
    const MOUNTAIN_AT = [39, 42];
    const BOARD_ART = ['................vv', 'vvvvvvvvvvvvvvvvv.', '.fffffffffffffff..'];   // nose to the right, lifted

    // The sea: three bands of scallops, nearer bands wider; wraps is how many of its own periods a band moves in a loop.
    const BANDS = [{r0: SEA + 2, per: 9, off: 0, wraps: 1, art: ['..BBB....', 'BB...BB..']},
                   {r0: SEA + 6, per: 12, off: 4, wraps: 1, art: ['....BBBB....', '..BB....BB..', 'BB........BB']},
                   {r0: SEA + 10, per: 20, off: 9, wraps: 1, art: ['.......WWW..........', '.....WWBBBB.........', '..BBB......BBB......', 'BB.............BBBBB']}];
    function sea(g, shifts) {
      for (let r = SEA; r < N; r++) for (let c = 0; c < N; c++) g[r][c] = DEEP;
      BANDS.forEach(({r0, per, off, art}, k) => {
        for (let c = 0; c < N; c++) art.forEach((line, dr) => {
          const ch = line[(((c - off - shifts[k]) % per) + per) % per];
          if (ch !== '.' && r0 + dr < N) g[r0 + dr][c] = INK[ch];
        });
      });
    }

    // The creature: the family pose at 1x on its board; eyes open, blink (the family's: the upper eye cells go visor),
    // shut (a line), left or right (a cell along the band), happy (the family's > < in a band grown a row); arms side
    // (the family's) or up (flung up and out in a V); ping, the family's lit tip with a Prussian key line; dy rows down.
    function creature(g, {dy = 0, eyes = 'open', arms = 'side', ping = false}) {
      const p = echoPing(ping);
      if (eyes === 'blink') for (const c of [7, 13]) p[6][c] = VISOR;
      if (eyes === 'shut') { for (const c of [7, 13]) p[6][c] = VISOR; for (const c of [6, 7, 8, 12, 13, 14]) p[7][c] = EYE; }
      if (eyes === 'left' || eyes === 'right') {
        const d = eyes === 'left' ? -1 : 1;
        for (const c of [7, 13]) { p[6][c] = VISOR; p[7][c] = VISOR; }
        for (const c of [7 + d, 13 + d]) { p[6][c] = EYE; p[7][c] = EYE; }
      }
      if (eyes === 'happy') {
        for (let c = 6; c <= 14; c++) p[5][c] = VISOR;
        for (const c of [7, 13]) { p[6][c] = VISOR; p[7][c] = VISOR; }
        for (const [r, c] of [[5, 6], [6, 7], [7, 6], [5, 14], [6, 13], [7, 14]]) p[r][c] = EYE;
      }
      if (arms === 'up') {
        for (let r = 7; r <= 10; r++) for (const c of [3, 4, 16, 17]) p[r][c] = 0;
        for (const [r, c] of [[7, 4], [6, 4], [6, 3], [5, 3], [5, 2], [4, 2], [4, 1], [3, 1]]) { p[r][c] = BODY; p[r][20 - c] = BODY; }
      }
      for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) if (p[r][c]) put(g, OY + dy + r, OX + c, p[r][c]);
      stamp(g, BOARD_ART, BOARD[0] + dy, BOARD[1]);
      // the lit tip key lined in Prussian, a cap over it and a cell each side, wherever it meets the sky: the ping cyan on
      // the cream is 1.13 to 1 and would read as the tip fading, not flashing; on the Prussian it is 7.6 to 1, and the cap
      // itself stands 6.75 to 1 off the sky. It is the scene's own rule, light against the sky gets a key line.
      if (ping) for (const [a, b] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1]]) {
        const r = OY + dy + 1 + a, c = OX + 15 + b;                 // the tip is the family's cell (1, 15)
        if (inside(r, c) && g[r][c] === SKY) g[r][c] = DEEP;
      }
    }
    const nearCreature = (x, y, dy) => x >= OX - 1 && x <= OX + 20 && y >= OY + dy && y <= BOARD[0] + dy + 3;

    // ---- one frame ----
    // o: pose; t and loop (ms) for the sea; drips, the drop phase 0..4 (the barrel only); cloud, whitewater puffs
    // [x, y, rx, ry]; spray, drops [x, y]; splash; who, the creature {dy, eyes, arms, ping}.
    function scene(o) {
      const g = blank(SKY);
      stamp(g, MOUNTAIN, ...MOUNTAIN_AT);
      sea(g, BANDS.map(b => Math.floor(o.t * b.wraps * b.per / o.loop)));
      // the wave: the polygon closed along the bottom, then each cell by its distances to the two chains
      const pose = o.pose;
      const outer = spline(pose.outer), inner = spline(pose.inner);
      const water = fill([...outer, ...inner, [inner[inner.length - 1][0], 61], [outer[0][0], 61]], SEA);
      const O = flat(outer), I = flat(inner);
      const sFoam = O.acc[3 * 8], sLip = O.acc[7 * 8], sEnd = O.acc[O.n - 1];   // foam from the 4th point, the lip from the 8th
      for (let r = 0; r < SEA; r++) for (let c = 0; c < N; c++) {
        if (!water[r][c]) continue;
        const x = c + 0.5, y = r + 0.5;
        const [dO, sO] = nearest(x, y, O), [dI] = nearest(x, y, I);
        let v = DEEP;
        if (dO < pose.foam * (sO >= sLip ? 1.5 : 1.2) && sO >= sFoam && (!pose.dash || Math.floor(sO / 3) % 2 === 0)) v = FOAM;
        else if (dI < 1.1) v = BLUE;                               // the face's rim
        else if (dI > 2 && ((dO > 3.2 && dO < 4.1) || (dO > 7 && dO < 7.9) || (dO > 11 && dO < 11.9))) v = BLUE;   // striations
        g[r][c] = v;
      }
      // the claws, along the lip, leaving the surface out of the foam band
      const tips = [];
      for (const [u, off, curl, len, w0, hook] of pose.claws) {
        if (len < 1.5) continue;
        const [x, y, tx, ty] = pointAt(O, sLip + u * (sEnd - sLip));
        const nx = ty, ny = -tx;                                   // the outward normal: the chain runs clockwise
        tips.push(claw(g, x - nx * 0.6, y - ny * 0.6, Math.atan2(ny, nx) * 180 / Math.PI + off, curl, len, w0, hook));
      }
      // drops falling from the five fingertips, a step of 3 rows a phase, staggered, only on open sky above the mountain
      if (o.drips !== undefined) tips.slice(TUFTS.length).forEach(([x, y], i) => {
        const k = (o.drips + i * 2) % 5, r = Math.floor(y) + 2 + 3 * k, c = Math.floor(x);
        if (k < 4 && r <= DRIP_MAX && inside(r, c) && g[r][c] === SKY) g[r][c] = FOAM;
      });
      // the whitewater: puffs painted back to front; where a puff lands on foam already there its upper rim is drawn in
      // the lighter blue, so the overlaps read as the contours of a cauliflower of foam
      for (const [cx, cy, rx, ry = rx] of o.cloud || []) {
        const was = g.map(row => row.slice());
        for (let r = Math.floor(cy - ry - 1); r <= Math.ceil(cy + ry + 1); r++) for (let c = Math.floor(cx - rx - 1); c <= Math.ceil(cx + rx + 1); c++) {
          if (!inside(r, c)) continue;
          const d = Math.hypot((c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry);
          if (d > 1) continue;
          g[r][c] = d > 1 - 1.1 / Math.min(rx, ry) && was[r][c] === FOAM && r + 0.5 < cy ? BLUE : FOAM;
        }
      }
      for (const [x, y] of o.spray || []) if (!(o.who && nearCreature(x, y, o.who.dy || 0))) put(g, y, x, FOAM);
      // pinholes in the foam close; then the key line: every sky cell beside foam goes Prussian
      {
        const fo = g.map(row => row.slice());
        for (let r = 0; r < SEA; r++) for (let c = 0; c < N; c++) if (fo[r][c] === SKY && N4.every(([a, b]) => !inside(r + a, c + b) || fo[r + a][c + b] === FOAM)) g[r][c] = FOAM;
      }
      const fo = g.map(row => row.slice());
      for (let r = 0; r < SEA; r++) for (let c = 0; c < N; c++) {
        if (g[r][c] === SKY && N4.some(([a, b]) => inside(r + a, c + b) && fo[r + a][c + b] === FOAM)) g[r][c] = DEEP;
      }
      if (o.splash) for (const [r, c] of [[43, 21], [42, 20], [44, 20], [43, 42], [42, 43], [44, 43], [41, 22], [41, 41]]) put(g, r, c, FOAM);
      if (o.who) creature(g, o.who);
      return g;
    }

    // ---- the loop ----
    const specs = [];
    const F = (hold, o) => specs.push({hold, o});
    const me = (eyes = 'open', more = {}) => ({eyes, ...more});
    // 1. The barrel, the dominant state: the claws open and grasp, drops fall, a blink, a glance at the mountain, pings.
    F(900, {pose: P.hero, drips: 0, who: me()});                   // rest, the loop anchor
    F(320, {pose: P.grasp, drips: 1, who: me()});
    F(90, {pose: P.grasp, drips: 1, who: me('blink')});
    F(520, {pose: P.hero, drips: 2, who: me()});
    F(160, {pose: P.grasp, drips: 3, who: me('open', {ping: true})});
    F(420, {pose: P.grasp, drips: 4, who: me()});
    F(520, {pose: P.hero, drips: 0, who: me('right')});            // a glance at the mountain
    F(440, {pose: P.grasp, drips: 1, who: me('right')});
    F(520, {pose: P.hero, drips: 2, who: me()});
    F(380, {pose: P.grasp, drips: 3, who: me()});
    F(160, {pose: P.hero, drips: 4, who: me('open', {ping: true})});
    // 2. The lip throws and closes out in front of it: a tube.
    F(150, {pose: blend(P.hero, P.throw, 0.5), who: me()});
    F(140, {pose: P.throw, who: me('shut')});
    F(140, {pose: P.close, who: me('shut')});
    // 3. The crash: the lip lands, the crest caves in and bursts, and the creature is thrown clear into the air.
    F(110, {pose: P.close, cloud: [[45, 44, 3.5], [49, 43, 2.5], [42, 45, 2.5]], spray: [[47, 37], [51, 38], [43, 38], [53, 41]], who: me('shut')});
    F(110, {pose: blend(P.close, P.fallen, 0.45), cloud: [[47, 38, 4], [40, 37, 5], [33, 39, 5], [26, 42, 4], [51, 42, 4], [44, 43, 5], [36, 44, 4]],
            spray: [[50, 31], [44, 30], [55, 35], [38, 31]], who: me('shut', {dy: -6, arms: 'up'})});
    const CLOUD = [[30, 26, 7], [38, 27, 7], [22, 30, 6], [46, 31, 6], [34, 35, 8], [52, 37, 5], [18, 38, 5], [26, 39, 6], [44, 41, 6], [50, 44, 4]];
    const sink = (dy, dr) => CLOUD.map(([x, y, r]) => [x, y + dy, Math.max(1, r - dr)]);
    F(110, {pose: P.fallen, cloud: CLOUD, spray: [[20, 22], [28, 18], [44, 19], [54, 27], [58, 33]], who: me('shut', {dy: -14, arms: 'up'})});
    F(480, {pose: P.fallen, cloud: sink(3, 0.5), spray: [[19, 20], [21, 14], [45, 16], [55, 24], [58, 30], [12, 30]], who: me('happy', {dy: -24, arms: 'up', ping: true})});
    F(320, {pose: blend(P.fallen, P.swell, 0.3), cloud: sink(6, 1), spray: [[19, 23], [21, 17], [45, 20], [55, 28], [12, 34]], who: me('happy', {dy: -23, arms: 'up'})});
    F(110, {pose: blend(P.fallen, P.swell, 0.6), cloud: sink(9, 1.5), who: me('open', {dy: -12, arms: 'up'})});
    // 4. It lands in a splash between foam patches on the swell, bobs, and looks back.
    const PATCH = [[19, 46.5, 4, 1.4], [44, 46.5, 4, 1.4], [52, 47, 3, 1.2], [12, 46, 3, 1.2]];
    F(200, {pose: P.swell, cloud: PATCH, splash: true, who: me('open', {dy: 1})});
    F(320, {pose: P.swell, cloud: PATCH.map(([x, y, rx, ry]) => [x + 1, y + 0.3, rx - 1, ry - 0.3]), who: me()});
    F(360, {pose: P.swell, who: me('left')});
    // 5. The next wave rears up behind it and pitches over into the barrel (frame 0).
    F(220, {pose: blend(P.swell, P.mound, 0.5), who: me('left')});
    F(220, {pose: P.mound, who: me('left')});
    F(200, {pose: blend(P.mound, P.steep, 0.5), who: me('left')});
    F(200, {pose: P.steep, who: me('left', {ping: true})});         // here it comes
    F(170, {pose: blend(P.steep, P.pitch, 0.5), who: me()});
    F(170, {pose: P.pitch, who: me()});
    F(170, {pose: blend(P.pitch, P.hero, 0.5), who: me()});
    const loop = specs.reduce((s, f) => s + f.hold, 0);
    const frames = [];
    let t = 0;
    for (const {hold, o} of specs) { frames.push({hold, grid: scene({...o, t, loop})}); t += hold; }

    return {
      name: 'ECHO · great wave', key: 'echo_great_wave', fwname: 'echo great wave', category: 'Active', size: N,
      // Big tier: 30 frames of 3600 bytes (108000 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, culture, 60 cell lattice (8 px cells, a full bleed scene, the creature at 1x so the wave can dwarf it): an homage to Hokusai\'s Under the Wave off Kanagawa (about 1831, public domain), a cream paper sky, a Prussian blue wave rearing up from the left with lighter striations and a white crest whose lip breaks into hooked claws of foam outlined in Prussian like the woodblock, reaching out over the gap toward a small snow capped mountain on the horizon, and the creature on a teal surfboard in the trough under the claws where the print has its boats; for 4.4 s it rides the barrel while the claws open and grasp, drops of spray fall from the fingertips toward the mountain, it blinks, glances at the mountain and pings (the lit tip key lined in Prussian so it flashes on the cream), then the lip throws and closes out into a tube round it, eyes shut, lands, caves in and bursts into a cauliflower of whitewater, and the creature is thrown clear into the air on its board, arms flung up in a V with happy eyes and a ping, hangs and falls back into a splash between foam patches on a spent swell, looks back over its shoulder as the next wave rears up behind it (a ping when it stands steep) and pitches over into the barrel again, the sea scrolling under it in three bands that close the 8.3 s loop without a seam; judge whether it reads as the print from across the room, whether the claws read as claws and not noise, and whether the creature at 1x still reads as this creature.',
      // 0 unused (full bleed), 1 body, 2 eyes, 3 visor and the board, 4 ping (antenna tip), 5 feet and the board's
      // underside, 6 foam white, 7 Prussian blue (wave, sea, key line), 8 lighter blue (striations, rim, mountain,
      // scallops, foam contours), 9 cream paper sky
      palette: [...ECHO_PALETTE.slice(0, 6), '#f7f3e6', '#1d3d6e', '#4f7fbf', '#dfcb98'],
      frames,
    };
  })();

  L.register([echoGreatWave]);
})(typeof window !== 'undefined' ? window : globalThis);
