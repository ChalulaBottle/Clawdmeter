// Culture creature: the Vitruvian figure (operator, 2026-10-02: "famous paintings, memes, pop culture ... get crazy, get
// creative"). Leonardo's pen and ink study of the proportions Vitruvius gave for a well made figure (c. 1490, public
// domain): one figure drawn twice over, arms level and feet together inside a square, arms raised and legs spread inside a
// circle, the two positions sharing one body, with notes in his mirror writing above. The ECHO creature takes the figure's
// place: the composition, the setting and the gesture are the homage, drawn from scratch in code. Loaded after anims.js
// (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
// 60 cell lattice, 8 px cells on the 480 panel, built the way mushroom HD is built: the body is the family's 20 cell pose
// repeated exactly 3 times across and down, so the silhouette, the visor, the eyes and the antenna are the family's own;
// the arm stubs and the legs are lifted out and drawn again as posed limbs on the fine lattice, from roots hidden inside
// the body, so they can reach for the lines.
//   sheet     the whole panel is parchment, its edge a shade darker. A circle of dark sepia ink a cell thick rings the
//             panel (rows and cols 1..58, centred on the panel's middle: the hub); a square 50 on a side shares the
//             circle's bottom (lines on rows 9 and 58, cols 5 and 54), so its top cuts across the circle 8 rows under the
//             circle's top and its top corners poke out of it, as on the sheet. Notes in faded ink fill the two top
//             corners outside the circle, written the way Leonardo wrote, right to left, so every line runs flush to its
//             right margin and frays on the left; a scale of 8 ticks hangs under the bottom line.
//   square    the dominant state and the loop anchor: the creature stands in the square, which is exactly its own box at
//             3x (48 tall from the antenna tip to the feet, 48 across from hand to hand): the antenna tip under the top
//             line, the feet on the bottom one, the arms level and each hand at a side. The other position's raised arms
//             are drawn in ink beside it, the double drawing: a dark sepia outline a cell thick, hatched inside in faded
//             ink on every third diagonal, sloping from upper left to lower right the way Leonardo's left hand hatched.
//   circle    a jumping jack: the creature hops up 5 rows, its body's centre a row over the hub (the proportions put the
//             navel at the circle's centre), raises its arms 38 degrees over level until the hands rest on the ring and
//             spreads its legs, the outer pair 24 degrees out until the feet rest on the ring, the inner pair 14 and as
//             long; now the level arms are the ink ones.
//   swap      square, circle, square, circle, with a half way frame between each (the hop half done, the arms 19 degrees
//             over level, the legs half spread, both ink pairs showing): the two exposures of the drawing taking turns.
//   wheel     from the circle it winds back 10 degrees and turns once clockwise about the hub, the hands, the outer feet
//             and the antenna tip riding round the ring like the rim of a wheel, dotted arcs in the legs' teal behind
//             them; it overshoots 12 degrees, rocks back 4 with its eyes crossed, settles with happy eyes and a ping and
//             drops back into the square. The ink arms leave the drawing while it turns. Every cell samples the figure at
//             its centre turned back about the hub, so 0 degrees is the circle position cell for cell; in the circle
//             nothing of the creature is painted past the ring band, which trims the odd cell a limb's end or the antenna
//             tip's corner would show past the line mid turn.
//   life      a blink in the anchor; the eyes go to the left hand and then the right on the square's sides, measuring;
//             the antenna pings when its tip meets the top line, on landing in the circle and after the wheel.
// Touching is measured on the lattice, not assumed: every limb grows 0.05 of a cell at a time until the next step would
// cover a cell of the line it reaches for (the square's side, its bottom, or past the ring band), so the outermost limb
// cell always sits next to the square's ink or on the ring.
// Constants: 60 cells of 8 px; 28 frames, 7.75 s; hub (30, 30), ring radius 28.5; square lines rows 9 and 58, cols 5 and
// 54; the family 3x frame 2 cols left and 7 rows down standing, 2 down in the circle; arms 6 rows thick with a round hand
// of radius 3.2, raised 38 degrees; legs 3 cols (half width 1.7), spread 24 and 14 degrees; the wheel 10 degrees back, then
// round in nine frames of 25 to 50 degrees at 75 to 130 ms to 12 over, 4 back for 240 ms, home.
// Palette: 0..5 the ECHO palette unchanged (5 is the legs and the wheel's arcs); 6 parchment, 7 dark sepia (the circle,
// the square, the ticks, the ink arms' outlines), 8 faded sepia (the hatching, the notes), 9 the paper's darker edge.
// Index 6 is not ping here, so no frame goes through echoGlitch. Big tier: 28 frames of 3600 bytes (100800 bytes), so it
// ships only on boards built with SPLASH_BIG. One closure, so echoVitruvian is the only name it adds; L.register hands it
// to the bench and the export.
(function (root) {
  const L = root.BENCH_LIB;
  const {G, clone, upscale, ECHO_PALETTE, echoPing} = L;

  const echoVitruvian = (() => {
    const N = 60, K = 3;                                           // lattice; the 20 cell pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, LEG = 5, PAPER = 6, INK = 7, FADED = 8, EDGE = 9;
    const ARM_INK = INK, ARC_INK = LEG;                            // the other position's arms; the wheel's arcs
    // Hatching inside an ink arm, every third diagonal, sloping from upper left to lower right the way a left hand
    // hatches, as Leonardo's does.
    const HATCH = (r, c) => ((r - c) % 3 + 3) % 3 === 0;
    // Constants the cell is judged on.
    const HUB = [30, 30];                                          // the circle's centre [row, col], the panel's middle
    const R = 28.5;                                                // the ring: cells whose centres lie 28 to 29 from the hub
    const SQ = {top: 9, bottom: 58, left: 5, right: 54};           // the square's lines: 50 x 50, its bottom on the circle's
    const DX = -2;                                                 // the family 3x frame two cols left: body cols 13..45
    const DY_SQUARE = 7, DY_CIRCLE = 2;                            // and rows lower: standing in the square; hopped into the circle
    const SHOULDER = [25, [16.5, 46.5]];                           // family 3x frame: 1.5 inside the body's sides
    const HIP = [40.5, [16.5, 25.5, 37.5, 46.5]];                  // 1.5 inside the body's bottom, the family's leg centres
    const ARM_W = 2.9, HAND_R = 3.2;                               // a posed arm's half width (6 rows), its round hand
    const LEG_W = 1.7;                                             // a leg's half width: 3 cols straight (the family's), fuller angled
    const RAISE = 38, SPREAD = [24, 14];                           // degrees: the arms over level; the outer and inner legs out
    const WIND = -10, OVER = 12, BACK = -4;                        // the wheel: wind up, overshoot, rock back

    const blank = v => Array.from({length: N}, () => new Array(N).fill(v));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const rad = d => d * Math.PI / 180;
    // cos and sin, exact at the quarter turns so those frames sample cell centres cleanly
    const cs = d => { const k = ((d % 360) + 360) % 360; if (k === 0) return [1, 0]; if (k === 90) return [0, 1]; if (k === 180) return [-1, 0]; if (k === 270) return [0, -1]; return [Math.cos(rad(d)), Math.sin(rad(d))]; };
    const dir = a => [-Math.cos(rad(a)), Math.sin(rad(a))];       // a unit step a degrees clockwise from up: [down, right]
    const seg = (y, x, p, q) => {                                  // distance from (y, x) to the segment p q
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };
    const hubDist = (r, c) => Math.hypot(r + 0.5 - HUB[0], c + 0.5 - HUB[1]);

    // The sheet.
    const ringCell = (r, c) => { const d = hubDist(r, c); return d >= R - 0.5 && d < R + 0.5; };
    const squareCell = (r, c) => ((r === SQ.top || r === SQ.bottom) && c >= SQ.left && c <= SQ.right) || ((c === SQ.left || c === SQ.right) && r >= SQ.top && r <= SQ.bottom);
    // Notes: [baseline row, first col, last col]. Each word a squiggle on the baseline and the row over it, by a fixed
    // pattern; a tall stroke now and then; the words run from the right margin leftward, so the left end frays.
    const NOTES = [[3, 3, 15], [6, 1, 9], [3, 44, 57], [6, 49, 57]];
    const WORDS = [4, 2, 5, 3, 6, 2, 4, 3, 5, 2, 3, 4];             // word lengths, read from the right margin
    function notes(g) {
      let w = 0;
      NOTES.forEach(([row, c0, c1], line) => {
        let c = c1;
        while (c >= c0) {
          const n = WORDS[(w++ + line * 5) % WORDS.length];
          if (c - n + 1 < c0 - 1) break;                          // a word that does not fit ends the line: the fray
          for (let i = 0; i < n; i++) {
            const x = c - i, k = (x * 7 + row * 3) % 5;
            g[row - (k < 2 ? 1 : 0)][x] = FADED;                   // the squiggle: on the line or the row over it
            if (k === 4 && i > 0 && i < n - 1) g[row - 2][x] = FADED;   // a tall stroke
          }
          c -= n + 1;                                              // a cell between words
        }
      });
    }
    const SHEET = (() => {
      const g = blank(PAPER);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const e = Math.min(r, c, N - 1 - r, N - 1 - c);
        if (e === 0 || (e === 1 && (r + c) % 2 === 0)) g[r][c] = EDGE;   // the paper's edge, darker, a dithered cell in
      }
      notes(g);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (ringCell(r, c) || squareCell(r, c)) g[r][c] = INK;
      for (let c = SQ.left; c <= SQ.right; c += (SQ.right - SQ.left) / 7) g[SQ.bottom + 1][c] = INK;   // the scale: 8 ticks
      return g;
    })();

    // The creature.
    // The family 3x frame's face: the band repainted, then the eyes, 3 x 6 each: look slides both a family cell along the
    // band, blink keeps the lower half, cross slides each toward the middle, happy draws mushroom HD's arches.
    const EYE_COLS = [21, 39];                                     // the eyes' left cols; the band is rows 18..23, cols 18..44
    const ARCH = ['..kkkkk..', '.kk...kk.', 'kk.....kk'];
    function face(g, {look = 0, blink = false, cross = false, happy = false} = {}) {
      for (let r = 18; r <= 23; r++) for (let c = 18; c <= 44; c++) g[r][c] = VISOR;
      if (happy) {
        for (const c0 of [18, 36]) ARCH.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch === 'k') g[19 + dr][c0 + dc] = EYE; }));
        return g;
      }
      EYE_COLS.forEach((c0, k) => {
        const dc = cross ? (k ? -3 : 3) : 3 * look;
        for (let r = blink ? 21 : 18; r <= 23; r++) for (let c = c0 + dc; c < c0 + dc + 3; c++) g[r][c] = EYE;
      });
      return g;
    }
    // The body sprite on the family 3x frame: the family pose at 3x without its arm stubs and legs, with a face.
    const sprite = (ping, eyes) => {
      const g = clone(echoPing(ping));
      for (let r = 7; r <= 10; r++) for (const c of [3, 4, 16, 17]) g[r][c] = 0;
      for (let r = 14; r < G; r++) g[r].fill(0);
      return face(upscale(g, K), eyes);
    };
    // Limb tests, on the panel. An arm: a bar ARM_W from the shoulder to the hand and a round hand HAND_R. A leg: a bar 3
    // across from the hip, flat ended, like the family's legs.
    const armIn = (s, h) => (y, x) => seg(y, x, s, h) <= ARM_W || Math.hypot(y - h[0], x - h[1]) <= HAND_R;
    const armRim = (s, h) => (y, x) => {                           // the outline a cell thick: the ink arm
      const d = Math.min(seg(y, x, s, h) - ARM_W, Math.hypot(y - h[0], x - h[1]) - HAND_R);
      return d <= 0 && d > -1;
    };
    const legIn = (hip, a, len) => { const [uy, ux] = dir(a); return (y, x) => { const dy = y - hip[0], dx = x - hip[1], t = dy * uy + dx * ux; return t >= 0 && t <= len && Math.abs(dy * ux - dx * uy) <= LEG_W; }; };
    const along = (p, a, len) => { const [uy, ux] = dir(a); return [p[0] + uy * len, p[1] + ux * len]; };
    // The longest length, in steps of 0.05, at which the limb from p along a covers no stop cell. Each step scans only the
    // box round the limb, 4 cells wider than its bone (the hand's radius and the leg's half width fit inside that).
    function reach(p, a, make, stop) {
      const hits = l => {
        const t = make(l), e = along(p, a, l);
        const r0 = Math.max(0, Math.floor(Math.min(p[0], e[0]) - 4)), r1 = Math.min(N - 1, Math.ceil(Math.max(p[0], e[0]) + 4));
        const c0 = Math.max(0, Math.floor(Math.min(p[1], e[1]) - 4)), c1 = Math.min(N - 1, Math.ceil(Math.max(p[1], e[1]) + 4));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (stop(r, c) && t(r + 0.5, c + 0.5)) return true;
        return false;
      };
      let len = 0.5;
      while (len < 40 && !hits(len + 0.05)) len += 0.05;
      return len;
    }
    const RIM = R + 0.5;                                           // the ring band's outer edge: hands and feet may rest on the band
    const offRing = (r, c) => hubDist(r, c) >= RIM;
    const onSide = (r, c) => c <= SQ.left || c >= SQ.right;
    const onFloor = r => r >= SQ.bottom;

    // The two positions, and the limbs measured for each: u 0 the square, 1 the circle.
    const DY = u => Math.round(DY_SQUARE + (DY_CIRCLE - DY_SQUARE) * u);   // whole rows, so the body stays on the lattice
    const shoulders = u => SHOULDER[1].map(x => [SHOULDER[0] + DY(u), x + DX]);
    const hips = u => HIP[1].map(x => [HIP[0] + DY(u), x + DX]);
    const armAng = (u, k) => (k ? 1 : -1) * (90 - RAISE * u);      // degrees clockwise from up
    const legAng = (u, k) => 180 + (k < 2 ? 1 : -1) * SPREAD[k === 0 || k === 3 ? 0 : 1] * u;
    const ARM_LEN = [0, 1].map(u => [0, 1].map(k => {
      const s = shoulders(u)[k], a = armAng(u, k);
      return reach(s, a, l => armIn(s, along(s, a, l)), u ? offRing : onSide);   // level: to the square's side; raised: onto the ring
    }));
    const LEG_LEN = (() => {
      const floor = [0, 1, 2, 3].map(k => reach(hips(0)[k], 180, l => legIn(hips(0)[k], 180, l), onFloor));   // standing: to the bottom line
      const ring = [0, 3].map(k => reach(hips(1)[k], legAng(1, k), l => legIn(hips(1)[k], legAng(1, k), l), offRing));   // spread: the outer pair onto the ring
      return floor.map((f, k) => [f, ring[k < 2 ? 0 : 1]]);       // and each inner leg as long as its outer neighbour
    })();
    const lerp = (a, b, u) => a + (b - a) * u;
    const arms = u => shoulders(u).map((s, k) => { const h = along(s, armAng(u, k), lerp(ARM_LEN[0][k], ARM_LEN[1][k], u)); return {s, h}; });
    // The figure at position u as a function of a panel point: legs, then arms, then the body over their roots.
    function figure(u, {ping = false, eyes} = {}) {
      const spr = sprite(ping, eyes), dy = DY(u);
      const ls = hips(u).map((hip, k) => legIn(hip, legAng(u, k), lerp(LEG_LEN[k][0], LEG_LEN[k][1], u)));
      const as = arms(u).map(({s, h}) => armIn(s, h));
      return (y, x) => {
        const fr = Math.floor(y) - dy, fc = Math.floor(x) - DX;
        if (fr >= 0 && fr < N && fc >= 0 && fc < N && spr[fr][fc]) return spr[fr][fc];
        if (as.some(t => t(y, x))) return BODY;
        if (ls.some(t => t(y, x))) return LEG;
        return 0;
      };
    }
    const INK_ARMS = [arms(0), arms(1)];                           // the drawing's two pairs, where they lie in each position

    // A frame: the sheet, the ink arms of the positions in `ghosts`, the wheel's arcs, then the figure turned th degrees
    // clockwise about the hub (every cell samples the figure at its centre turned back). In the circle the creature is
    // inside the wheel, so nothing of it is painted past the ring band: at 0 degrees the limbs already stop there, and in
    // the turn this trims the odd cell a limb's end or the antenna tip's corner would show past the line.
    function frame(u, {th = 0, ghosts = [], arcs = null, ...o} = {}) {
      const g = SHEET.map(row => row.slice());
      for (const p of ghosts) for (const {s, h} of INK_ARMS[p]) {
        const rim = armRim(s, h), fill = armIn(s, h);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (g[r][c] !== PAPER && g[r][c] !== EDGE) continue;
          if (rim(r + 0.5, c + 0.5)) g[r][c] = ARM_INK;
          else if (fill(r + 0.5, c + 0.5) && HATCH(r, c)) g[r][c] = FADED;
        }
      }
      if (arcs) arcs(g);
      const fig = figure(u, o), [co, si] = cs(th);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (u === 1 && offRing(r, c)) continue;
        const sy = r + 0.5 - HUB[0], sx = c + 0.5 - HUB[1];
        const v = fig(HUB[0] + sy * co - sx * si, HUB[1] + sx * co + sy * si);
        if (v) g[r][c] = v;
      }
      return g;
    }
    // The wheel's arcs: for every tip (the hands, the outer feet, the antenna tip) a dot every 1.6 cells along the path it
    // swept from turn a0 to a1, stopping short of where it is now; parchment cells only.
    const TIPS = (() => {
      const [l, r] = arms(1), hp = hips(1);
      return [l.h, r.h, along(hp[0], legAng(1, 0), LEG_LEN[0][1] - 1), along(hp[3], legAng(1, 3), LEG_LEN[3][1] - 1), [4 + DY_CIRCLE + 0.5, 46.5 + DX]];
    })();
    const arcsFor = (a0, a1) => g => {
      for (const [ty, tx] of TIPS) {
        const rho = Math.hypot(ty - HUB[0], tx - HUB[1]), phi = Math.atan2(tx - HUB[1], -(ty - HUB[0])) * 180 / Math.PI;
        const span = a1 - a0 - 14, n = Math.floor(Math.abs(span) * Math.PI * rho / 180 / 1.6);
        for (let i = 0; i <= n; i++) {
          const a = phi + a0 + span * i / Math.max(1, n), [dy, dx] = dir(a);
          const r = Math.floor(HUB[0] + dy * rho), c = Math.floor(HUB[1] + dx * rho);
          if (inside(r, c) && g[r][c] === PAPER) g[r][c] = ARC_INK;
        }
      }
    };

    // The frames.
    const frames = [], F = (hold, grid) => frames.push({hold, grid});
    const SQUARE = (o = {}) => frame(0, {ghosts: [1], ...o});
    const HALF = (o = {}) => frame(0.5, {ghosts: [0, 1], ...o});
    const CIRCLE = (o = {}) => frame(1, {ghosts: [0], ...o});
    // 1. The drawing: standing in the square, the raised arms in ink. A blink; it measures, a look at each hand on the
    // square's sides; the antenna pings where its tip meets the top line.
    F(1500, SQUARE());                                             // rest, the loop anchor
    F(80, SQUARE({eyes: {blink: true}}));
    F(560, SQUARE());
    F(420, SQUARE({eyes: {look: -1}}));
    F(420, SQUARE({eyes: {look: 1}}));
    F(170, SQUARE({ping: true}));
    F(300, SQUARE());
    // 2. The swap, twice: a hop to half way, into the circle with a ping, back down, and up again.
    F(90, HALF());
    F(170, CIRCLE({ping: true}));
    F(650, CIRCLE());
    F(90, HALF());
    F(420, SQUARE());
    F(90, HALF());
    F(500, CIRCLE());
    // 3. The wheel: wind back, once round clockwise with the arcs behind the tips, overshoot, rock back cross eyed, settle.
    const TURN = [[WIND, 150], [15, 110], [50, 90], [95, 80], [145, 75], [195, 75], [245, 75], [290, 80], [330, 95], [360 + OVER, 130]];
    let prev = 0;
    for (const [th, hold] of TURN) {
      F(hold, frame(1, {th, arcs: th - prev >= 30 ? arcsFor(prev, th) : null}));
      prev = th;
    }
    F(240, frame(1, {th: 360 + BACK, eyes: {cross: true}}));
    F(650, CIRCLE({ping: true, eyes: {happy: true}}));             // settled: happy eyes, a ping, the ink arms back
    F(350, CIRCLE());
    F(90, HALF());                                                 // and down into the square (it loops to the rest)

    return {
      name: 'ECHO · vitruvian', key: 'echo_vitruvian', fwname: 'echo vitruvian', category: 'Idle', size: N,
      // Big tier, like the HD cells: the firmware table keeps size x size bytes a frame, so this is 28 frames of 3600
      // bytes (100800 bytes), and it ships only on boards built with SPLASH_BIG (the 4 inch board, 16 MB layout).
      tier: 'big',
      intent: 'Proposal, 60 cell lattice (8 px cells, the creature at 3x as in mushroom HD), after Leonardo\'s Vitruvian figure (public domain): on a parchment sheet ringed by a sepia ink circle with a square sharing its bottom, notes in faded mirror writing in the top corners and a scale of ticks under the square, the creature stands in the square as its own exact box, the antenna tip under the top line, the feet on the bottom line and each level arm\'s hand at a side, while the other position\'s raised arms are drawn beside it in ink, outlined and hatched the way a left hand hatches, the double drawing; it blinks, looks at its left hand and then its right as if measuring, and pings where the antenna meets the top line; then it swaps positions twice like the two exposures of the drawing, a jumping jack that hops its body up to within a row of the circle\'s centre, raises its arms until the hands rest on the ring and spreads its legs until the outer feet do, with a ping on landing, the level arms now the ink ones; then it winds back and turns once clockwise about the circle\'s centre like a wheel, the hands, the outer feet and the antenna tip riding round the ring with dotted teal arcs behind them, overshoots, rocks back cross eyed, settles with happy eyes and a ping and drops back into the square; judge whether it reads as the Vitruvian figure at a glance, whether the hatched ink arms read as the second drawing rather than as extra arms, and whether the turn reads as a wheel rather than a wobble.',
      // 0 transparent, 1 body and arms, 2 eyes, 3 visor, 4 ping (antenna tip), 5 legs and the wheel's arcs, 6 parchment,
      // 7 dark sepia (the circle, the square, the ticks, the ink arms' outlines), 8 faded sepia (the hatching, the
      // notes), 9 the paper's darker edge
      palette: [...ECHO_PALETTE.slice(0, 6), '#dcc595', '#4a2c17', '#9a7449', '#c3a46c'],
      frames,
    };
  })();

  L.register([echoVitruvian]);
})(typeof window !== 'undefined' ? window : globalThis);
