// Culture creature: galaxy brain (operator, 2026-10-02: more animations from famous paintings, memes and pop culture,
// "get crazy get creative"). The expanding brain meme as a format only: four panels, each a head in profile whose brain
// is bigger and brighter than the last, the last one gone cosmic. No captions and nothing traced: the ECHO creature plays
// every panel, drawn from scratch on the 60 cell lattice (8 px cells on the 480 panel), and the four panels become four
// stages of one clip, cut from one to the next by a white flash of the brain, so they count like panels.
// The view: the creature in profile facing left, toward where the meme's captions sit, at 3x. PROFILE is moonwalk HD's
// side view as a 20 cell pose (the body 9 deep and 10 tall, the antenna on the back corner, two legs a quarter and three
// quarters of the way back) repeated 3 times across and down; on top of it at 8 px: the shading row, the visor band on
// the front of the head (10 cells, the far eye 2 wide by the face edge and the near eye 3 wide, so the back of the head is
// free for the brain), the brain, the near arm in its own teal with a crease in the feet teal where it lies on the shell
// (the far arm only shows when it reaches out behind), and everything behind it on the black.
// The brain sits in the back of the head as if the shell were glass, facing the way the creature faces: a domed cerebrum
// with folds, the striped cerebellum under the back, the stem going down. Three sprites, 11 x 7, 13 x 9 and 16 x 12, each
// centred on pose row 18.5 with its back a cell inside the skull's back (pose col 43), so each size grows toward the face
// and the small ones leave the temple free; one ink set a stage. A rim, where a stage has one, never takes the head's own
// top row or back column, so the head's edge stays the body's teal against the dark.
//   dim        stage 1, 2.2 s: the small brain in the arm's teal with body teal folds and its edge in the feet teal (the
//              dark line holds its shape at a glance), a shade off the body and no glow; the eyes half shut (the family's
//              half blink, held), the antenna tip dark, the arm hanging; one slow blink.
//   brighter   a white flash of the next brain with an antenna ping; stage 2, 2.3 s: the medium brain lit in visor teal with
//              feet teal folds, the eyes open, its glow on the top and back of the head; the hand comes up and puts a
//              finger to the temple (the forearm stood up behind the band's end with the upper arm foreshortened behind it,
//              the finger between the band and the brain, all inside the head's outline); one tap, the hand a row up and
//              the glow a step brighter; a blink, and the flash.
//   radiant    stage 3, 1.8 s: the large brain in ping cyan with visor teal folds, a white glint and a visor teal rim inside
//              the shell; its glow three bands deep (visor, arm teal, dithered feet teal); twelve rays of light beams
//              marching out from the brain, white at their leading ends; the finger raised in front of the face, a white
//              spark in each eye, the antenna tip crackling ping and white.
//   burst      the brain whites out and light climbs the antenna (the stalk lit); a jet of light shoots up from the tip and
//              a nebula blooms out of it over four frames, its front a circle round the tip growing 7, 15, 26 and 42 cells,
//              stars lighting inside it, while the creature rises a row a frame with its arms spread forward and back.
//   cosmic     stage 4, 3.6 s, the dominant look: it floats 3 to 5 rows up on a slow bob under a still sky, the visor dark
//              and the eyes glowing white, the brain turned into a galaxy (violet, magenta folds, white stars, a cyan rim);
//              the nebula fills the sky above it, white hot at the tip and violet and magenta wisps further out, drifting
//              outward and swirling round the tip; stars twinkle a frame in four and seven big ones flare in turn.
//   reset      the cloud is drawn back into the tip in two frames, the creature lands as the brain shrinks back through
//              the lit size to the small dim one, a blank stare, a blink, and the loop opens on the half shut eyes.
// The glow is light off the brain, not an outline: bands of distance from the brain's centre, squashed below its row so
// they taper down the back, so it falls on the head's top and back and never in front of the face, where the eureka finger
// needs the black. The nebula is noise in polar coordinates round the antenna tip, so every wisp points back at it; its
// reach is an ellipse wider than tall that keeps it over the head; broad dark lanes cut it and an ordered dither thins its
// fringe; in the cosmic stage it is centred on the tip at the mean lift, so the sky holds still while the creature bobs.
// Every background (the glow, the rays, the nebula, the stars) takes only empty cells and keeps off the cells next to the
// creature (the head, the arms, the antenna), so a dark rim always holds its silhouette and the antenna stays 3 cells
// wide. All noise is a fixed hash: the export is the same every run.
// Constants: 60 cells of 8 px; the creature at 3x, 7 rows lower and a col left of the 20 cell frame (feet on row 57);
// brains 11 x 7, 13 x 9, 16 x 12; arm half width 2, hand 2.6, finger 0.9 (at the temple 1.6, 2.8 and 1); glow bands out
// to 11 and 13.5 cells from the brain (stage 2) and 12, 14.5 and 17 (stage 3), 1.6 times nearer below its row; 12 rays,
// beams 6 on 6 off, 2 cells a frame (6 frames, 6 phases); nebula front 7, 15, 26, 42, then all of it, flowing 0.45 cells
// a frame, two octaves; float 4 rows, bob 1; 39 frames, 11.2 s a loop.
// Palette: 0..5 the ECHO palette unchanged (1 is also the dim brain's folds; 3 the lit brain, the radiant brain's folds
// and rim, the inner glow band and the tap's brighter glow; 4 the radiant brain, the rays, the galaxy brain's rim and the
// big stars' rays; 5 the lit brain's folds, the dim brain's edge, the arm's crease, the outer glow band, the shadow, the
// far arm and the dark visor); 6 white (the flashes, glints, sparks, the jet, the stars, the glowing eyes, the nebula's
// hot core); 7 violet (the nebula, the galaxy brain); 8 magenta (the nebula's hot wisps, the galaxy brain's folds); 9 the
// near arm's teal (moonwalk HD's, also the dim brain and a glow band). Index 6 is not ping here, so nothing in it goes
// through echoGlitch.
// Big tier: 39 frames of 3600 cells are 140400 bytes of firmware table, so it ships only on boards built with SPLASH_BIG.
// One closure, so echoGalaxyBrain is the only name this file makes; L.register hands it to BENCH.anims.
(function (root) {
  const L = root.BENCH_LIB;
  const {rows, upscale, ECHO_PALETTE} = L;

  const echoGalaxyBrain = (() => {
    const N = 60, K = 3;                                           // lattice; the 20 cell pose repeated K times
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, FEET = 5, WHITE = 6, VIOLET = 7, MAGENTA = 8, ARM = 9;
    const OY = 7, OX = -1;                                         // pose space to the panel: rows down, cols across

    // The profile pose, facing left: moonwalk HD's side view on the family's 20 cell lattice.
    const PROFILE = rows(`
00000000000000000000
00000000000000100000
00000000000000100000
00000000000000100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000011111111100000
00000000500050000000
00000000500050000000
00000000500050000000
00000000000000000000
00000000000000000000
00000000000000000000`);
    // Pose space (the pose at 3x): body rows 12..41, cols 18..44; the antenna's tip and stalk; the band; the eyes.
    const TIP = {rows: [3, 5], cols: [42, 44]}, STALK = {rows: [6, 11], cols: [42, 44]};
    const BAND = {rows: [18, 23], cols: [18, 27]};
    const EYES = [[20, 21], [24, 26]];                             // far eye 2 wide by the face edge, near eye 3 wide
    const SHADOW = {row: 58, mid: 30, half: 11};                   // panel: under the feet, between the legs

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    // Distance from (y, x) to the segment p q.
    const seg = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };
    // A fixed hash and the value noise built on it (no Math.random anywhere: every export is the same).
    const hash = (x, y, s = 0) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const sm = t => t * t * (3 - 2 * t);
    const vnoise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y) => 0.65 * vnoise(x, y) + 0.35 * vnoise(2 * x + 17, 2 * y + 9);   // two octaves: a finer one boils
    const BAYER = [[0, 0.5], [0.75, 0.25]];                        // a 2 x 2 ordered dither, on panel cells

    // The brains, facing left: # cerebrum, s a fold, c cerebellum, k its stripes, t stem, h glint (white in stage 3 only).
    const BRAIN = {
      small: [
        '...######..',
        '.####s####.',
        '###s#s##s##',
        '#s##ss##s##',
        '.#ss#####kc',
        '..####t.kck',
        '......t....'],
      medium: [
        '....#####....',
        '..##s####s#..',
        '.#s##s###s##.',
        '#s##s##s##s##',
        '#s#ss###s##s#',
        '##s###ss###s#',
        '.###s####ss#.',
        '..####tt.kck.',
        '.....tt..ckc.'],
      large: [
        '.....######.....',
        '...hh########...',
        '..h#ss##s##s##..',
        '.#s##s###s####s.',
        '##s###ss##s###s#',
        '#s##s###s###s###',
        '##ss####ss###s##',
        '.###sss###ss####',
        '..#####s######s.',
        '...######ttkckc.',
        '.....###tt.ckck.',
        '........tt......'],
    };
    const BRAIN_ROW = 18.5, BRAIN_BACK = 43;                       // pose space: every brain is centred on this row with
    const brainCells = size => {                                   // its back on this col, a cell inside the skull's back
      const art = BRAIN[size], h = art.length, w = art[0].length;
      const top = Math.round(BRAIN_ROW - h / 2), left = BRAIN_BACK + 1 - w, out = [];
      art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') out.push([top + dr, left + dc, ch]); }));
      return out;
    };
    const SIZE = {1: 'small', 2: 'medium', 3: 'large', 4: 'large'};
    const INK = {
      1: {'#': ARM, s: BODY, c: ARM, k: BODY, t: ARM, h: ARM},             // dim: a shade off the body (edge: creature())
      2: {'#': VISOR, s: FEET, c: VISOR, k: FEET, t: VISOR, h: VISOR},     // lit
      3: {'#': PING, s: VISOR, c: PING, k: VISOR, t: PING, h: WHITE},      // radiant
      4: {'#': VIOLET, s: MAGENTA, c: VIOLET, k: MAGENTA, t: VIOLET, h: WHITE},   // galaxy (plus stars, below)
    };
    const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    // The near arm as [shoulder, elbow, hand] in pose space, a raised finger, and the far arm reaching out behind; ar, hr
    // and fr, where a pose sets them, take the place of the arm, hand and finger radii below.
    const SH = [26.5, 33];
    const ARMS = {
      none:   null,
      rest:   {pts: [SH, [31, 32.5], [34.5, 31.5]]},                              // hanging at the side
      lift:   {pts: [SH, [33, 28.5], [28.5, 29]]},                                // the hand coming up at the side
      // The finger to the temple: the forearm stood up behind the band's end with the upper arm foreshortened behind it
      // (its elbow points at the viewer, so in profile only the forearm shows), a fist wider than the forearm, and the
      // finger, 2 cells wide, up between the band and the brain.
      temple: {pts: [[27.5, 30.5], [30.5, 30.5], [24.5, 29.5]], finger: [[21.5, 29], [15.5, 29]], fr: 1, ar: 1.6, hr: 2.8},
      tap:    {pts: [[26.5, 30.5], [29.5, 30.5], [23.5, 29.5]], finger: [[20.5, 29], [14.5, 29]], fr: 1, ar: 1.6, hr: 2.8},   // the tap: a row up
      eureka: {pts: [SH, [27.5, 15], [18.5, 12.5]], finger: [[16, 12.5], [10.5, 12.5]]},   // the finger up
      open:   {pts: [SH, [28, 21], [23.5, 12]], far: [[26.5, 30], [28, 48], [23.5, 56]]},  // spread forward and back
    };
    const ARM_R = 2.0, HAND_R = 2.6, FINGER_R = 0.9;
    const limbDist = (y, x, [s, e, h], ar = ARM_R, hr = HAND_R) => Math.min(seg(y, x, s, e) - ar, seg(y, x, e, h) - ar, Math.hypot(y - h[0], x - h[1]) - hr);
    const onBody = (r, c) => r >= 12 && r <= 41 && c >= 18 && c <= 44;
    const inShell = (r, c) => r >= 13 && r <= 40 && c >= 19 && c <= 43;   // the body less its outermost cells

    // The creature alone, in pose space.
    function creature({stage = 1, eyes = 'open', arm = 'rest', tip = 'off', stalk = false, flash = 0, bare = false}) {
      const g = upscale(PROFILE, K);
      if (bare) for (let r = 0; r < 12; r++) g[r].fill(0);                 // the head without its antenna (for the glow)
      for (let c = 18; c <= 44; c++) g[41][c] = FEET;                     // the shading row
      if (stalk) for (let r = STALK.rows[0]; r <= STALK.rows[1]; r++) for (let c = STALK.cols[0]; c <= STALK.cols[1]; c++) g[r][c] = c === 43 ? WHITE : PING;
      if (!bare) for (let r = TIP.rows[0]; r <= TIP.rows[1]; r++) for (let c = TIP.cols[0]; c <= TIP.cols[1]; c++) g[r][c] = tip === 'ping' ? PING : tip === 'white' ? WHITE : BODY;
      // The brain, seen through the head; a flash paints the next size white.
      const cells = brainCells(SIZE[flash || stage]);
      const S = new Set(cells.map(([r, c]) => r * 100 + c));
      if (flash) for (const [r, c] of cells) g[r][c] = WHITE;
      else {
        // Its rim, a glow on the shell round it in stages 3 and 4, never on the head's own top row or back column.
        const rim = stage === 3 ? VISOR : stage === 4 ? PING : 0;
        if (rim) for (const [r, c] of cells) for (const [a, b] of N4) if (!S.has((r + a) * 100 + c + b) && inShell(r + a, c + b)) g[r + a][c + b] = rim;
        for (const [r, c, ch] of cells) g[r][c] = INK[stage][ch];
        if (stage === 1) for (const [r, c] of cells) if (N4.some(([a, b]) => !S.has((r + a) * 100 + c + b))) g[r][c] = FEET;   // a dark line holds its shape
        if (stage === 4) for (const [r, c] of cells) if (hash(r, c, 7) < 0.07) g[r][c] = WHITE;   // stars in the galaxy
      }
      // The far arm behind the body in the feet teal; the near arm in its own teal, creased where it lies on the body.
      const A = ARMS[arm];
      if (A && A.far) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c] && limbDist(r + 0.5, c + 0.5, A.far) <= 0) g[r][c] = FEET;
      if (A) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        let k = limbDist(r + 0.5, c + 0.5, A.pts, A.ar, A.hr);
        if (A.finger) k = Math.min(k, seg(r + 0.5, c + 0.5, A.finger[0], A.finger[1]) - (A.fr || FINGER_R));
        if (k <= 0) g[r][c] = ARM;
        else if (k <= 1 && onBody(r, c) && g[r][c] === BODY) g[r][c] = FEET;   // the crease, on the shell, not the brain
      }
      // The band and the eyes, over the arm: half shut, open, shut, a spark in each, or glowing in a dark visor.
      for (let r = BAND.rows[0]; r <= BAND.rows[1]; r++) for (let c = BAND.cols[0]; c <= BAND.cols[1]; c++) g[r][c] = eyes === 'glow' ? FEET : VISOR;
      for (const [c0, c1] of EYES) for (let c = c0; c <= c1; c++) for (let r = BAND.rows[0]; r <= BAND.rows[1]; r++) {
        if (eyes === 'open' || eyes === 'spark') g[r][c] = EYE;
        if (eyes === 'half' && r >= 21) g[r][c] = EYE;
        if (eyes === 'glow') g[r][c] = WHITE;
      }
      if (eyes === 'shut') for (const [c0, c1] of EYES) for (let c = c0 - 1; c <= c1 + 1; c++) g[22][c] = EYE;
      if (eyes === 'spark') for (const [c0] of EYES) g[18][c0] = WHITE;
      return g;
    }
    // Pose space to the panel, lifted lift rows.
    function place(p, lift) {
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (p[r][c]) put(g, r + OY - lift, c + OX, p[r][c]);
      return g;
    }
    // Chebyshev distance from the creature, out to 4 (0 on it, 99 beyond).
    function distMap(g) {
      const D = Array.from({length: N}, (_, r) => g[r].map(v => (v ? 0 : 99)));
      for (let k = 1; k <= 4; k++) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (D[r][c] !== 99) continue;
        for (let a = -1; a <= 1 && D[r][c] === 99; a++) for (let b = -1; b <= 1; b++) if (inside(r + a, c + b) && D[r + a][c + b] === k - 1) { D[r][c] = k; break; }
      }
      return D;
    }

    // Backgrounds, on the panel; each takes only empty cells off the rim.
    // A brain's centre on the panel (the large one's unless named), and the antenna tip's.
    const brainAt = (lift, size = 'large') => [BRAIN_ROW + OY - lift, BRAIN_BACK + 1 - BRAIN[size][0].length / 2 + OX];
    const tipAt = lift => [4 + OY - lift, 43 + OX];
    function shadow(g, lift) {                                       // narrows as it lifts, gone past 4 rows
      const w = SHADOW.half - 2 * lift;
      if (w > 2) for (let c = SHADOW.mid - w; c <= SHADOW.mid + w; c++) if (!g[SHADOW.row][c]) g[SHADOW.row][c] = FEET;
    }
    // The glow: light off the brain, bands of distance from its centre (squashed below its row, so it tapers down the
    // back), on the cells off the head (H, the head alone with no arm and no antenna, at 2 or more) and in scene() off the
    // whole creature too, so a dark cell always rims the head, the arm and the 3 cell antenna and nothing merges with them.
    // It falls on the head's top and back, the brain's side; the outer band is dithered, so it reads as light thinning out.
    const GLOW = {2: [[11, ARM], [13.5, FEET, true]], 3: [[12, VISOR], [14.5, ARM], [17, FEET, true]]};   // [reach, ink, dithered]
    const LIT = {[ARM]: VISOR, [FEET]: ARM};                       // the tap's flicker: every band a step brighter
    function glow(g, H, lift, stage, lit) {
      const [cy, cx] = brainAt(lift, SIZE[stage]);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (H[r][c] < 2) continue;
        const dy = r + 0.5 - cy, d = Math.hypot(c + 0.5 - cx, dy > 0 ? 1.6 * dy : dy);
        const band = GLOW[stage].find(([reach]) => d < reach);
        if (!band || (band[2] && BAYER[r % 2][c % 2] >= 0.5)) continue;
        g[r][c] = lit ? LIT[band[1]] : band[1];
      }
    }
    // Twelve rays from the brain, beams 6 on 6 off marching out 2 cells a frame: a period of 12 cells is 6 frames, so the
    // 6 radiant frames are 6 distinct phases, and phase 6 (the white out) is phase 0 again, the march carrying straight on.
    const RAY_ON = 6, RAY_PERIOD = 12, RAY_STEP = 2;
    function rays(g, D, lift, phase) {
      const [cy, cx] = brainAt(lift);
      for (let k = 0; k < 12; k++) {
        const th = (k * 30 + 15) * Math.PI / 180, dy = -Math.cos(th), dx = Math.sin(th);
        for (let t = 12; t < 60; t += 0.5) {
          const r = Math.floor(cy + dy * t), c = Math.floor(cx + dx * t);
          if (!inside(r, c) || D[r][c] < 5) continue;
          const m = ((t - RAY_STEP * phase) % RAY_PERIOD + RAY_PERIOD) % RAY_PERIOD;
          if (m < RAY_ON) g[r][c] = m >= RAY_ON - 0.5 ? WHITE : PING;   // the leading end white
        }
      }
    }
    // The nebula: noise in polar coordinates round the antenna tip, so every wisp points back at it; it spreads wide and
    // up more than down (an elliptical reach), swirls tighter near the tip and flows outward with time t; the burst front
    // (grow) is a circle round the tip.
    const reachOf = (dy, dx) => Math.hypot(dx * 0.5, dy > 0 ? dy * 1.7 : dy * 0.8);
    const FLOW = 0.45;                                                      // cells a frame the cloud flows outward
    function nebula(g, D, at, grow, t) {                                    // at: the lift whose antenna tip is its centre
      const [tr, tc] = tipAt(at);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (D[r][c] < 2) continue;
        const dy = r + 0.5 - tr, dx = c + 0.5 - tc, d = reachOf(dy, dx), e = Math.hypot(dy, dx);
        if (e > grow + 5 * (vnoise(c * 0.3, r * 0.3) - 0.5)) continue;
        const u = e - FLOW * t;                                             // outward flow
        const a = Math.atan2(dy, dx) + 1.5 * Math.exp(-d / 14);             // swirl
        const x = u * Math.cos(a), y = u * Math.sin(a);
        const dens = fbm(x * 0.15 + 40, y * 0.15 + 40) + 0.55 * Math.exp(-d / 11) - d / 78;
        const hot = vnoise(x * 0.11 + 7, y * 0.11 + 3);                    // which wisps burn magenta
        const lane = vnoise(x * 0.2 + 91, y * 0.2 + 57);                   // dark lanes through the cloud, broad ones
        if (dens > 0.92) g[r][c] = WHITE;
        else if (dens > 0.5 && lane < 0.16) continue;
        else if (dens > 0.64 && hot > 0.42) g[r][c] = MAGENTA;
        else if (dens > 0.54) g[r][c] = VIOLET;
        else if (dens > 0.48 + 0.06 * BAYER[r % 2][c % 2]) g[r][c] = VIOLET;   // the fringe thins out in an ordered dither
      }
    }
    // Stars inside the burst front: small ones lit three frames in four, seven big ones flaring in turn.
    const BIG = [[3, 6], [16, 53], [27, 3], [40, 55], [9, 25], [46, 6], [33, 51]];
    function stars(g, D, k, grow, lift) {
      const [tr, tc] = tipAt(lift);
      const ok = (r, c) => inside(r, c) && D[r][c] >= 2 && (!g[r][c] || g[r][c] === FEET);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!ok(r, c) || Math.hypot(r - tr, c - tc) > grow) continue;
        if (hash(c, r, 3) < 0.03 && (Math.floor(hash(c, r, 5) * 4) + k) % 4 !== 0) g[r][c] = hash(c, r, 9) < 0.7 ? WHITE : PING;
      }
      BIG.forEach(([r, c], i) => {
        if (Math.hypot(r - tr, c - tc) > grow || !ok(r, c)) return;
        const ph = (k + i) % 3;
        g[r][c] = WHITE;
        if (ph >= 1) for (const [a, b] of N4) if (ok(r + a, c + b)) g[r + a][c + b] = PING;
        if (ph === 2) for (const [a, b] of N4) if (ok(r + 2 * a, c + 2 * b)) g[r + 2 * a][c + 2 * b] = PING;
      });
    }
    // The jet: a column of light from the tip to the top edge.
    function jet(g, lift) {
      const [tr, tc] = tipAt(lift);
      for (let r = 0; r < tr - 1; r++) { put(g, r, tc, WHITE); put(g, r, tc - 1, PING); put(g, r, tc + 1, PING); }
    }

    // A frame: the creature placed, then the shadow, the glow, the rays, the nebula and stars, the jet.
    function scene(o) {
      const lift = o.lift || 0;
      const g = place(creature(o), lift);
      const D = distMap(g);
      if (!o.grow) shadow(g, lift);
      if (o.glow) {                                                        // measured off the head alone, then kept off all
        const H = distMap(place(creature({...o, arm: 'none', stalk: false, bare: true}), lift));
        const ring = blank();
        glow(ring, H, lift, o.glow, o.lit);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (ring[r][c] && !g[r][c] && D[r][c] >= 2) g[r][c] = ring[r][c];   // the arm keeps its rim too
      }
      if (o.rays !== undefined) rays(g, D, lift, o.rays);
      if (o.grow) { nebula(g, D, o.sky !== undefined ? o.sky : lift, o.grow, o.t || 0); stars(g, D, o.k || 0, o.grow, lift); }
      if (o.jet) jet(g, lift);
      return g;
    }

    const frames = [], F = (hold, o) => frames.push({hold, grid: scene(o)});
    // 1. Dim: half shut eyes, the small dim brain, one slow blink. Frame 0 is the loop anchor.
    F(1300, {stage: 1, eyes: 'half'});
    F(160, {stage: 1, eyes: 'shut'});
    F(700, {stage: 1, eyes: 'half'});
    F(80, {stage: 1, eyes: 'open', flash: 2, tip: 'ping'});                       // flash: the next brain, white
    // 2. Brighter: the brain lit and its glow, the finger to the temple, a tap that lights the glow, a blink into the flash.
    F(320, {stage: 2, eyes: 'open', tip: 'ping', glow: 2});
    F(130, {stage: 2, eyes: 'open', arm: 'lift', glow: 2});
    F(800, {stage: 2, eyes: 'open', arm: 'temple', glow: 2});
    F(120, {stage: 2, eyes: 'open', arm: 'tap', glow: 2, lit: true});
    F(700, {stage: 2, eyes: 'open', arm: 'temple', glow: 2});
    F(120, {stage: 2, eyes: 'shut', arm: 'temple', glow: 2});
    F(80, {stage: 2, eyes: 'open', arm: 'temple', flash: 3, tip: 'ping', glow: 2});   // flash
    // 3. Radiant: the finger up, the cyan brain, its glow three bands deep, the beams marching out, the tip crackling.
    for (let k = 0; k < 6; k++) F(300, {stage: 3, eyes: 'spark', arm: 'eureka', tip: k % 2 ? 'white' : 'ping', glow: 3, rays: k});
    // The burst: the brain whites out, the antenna lights, a jet, and the nebula blooms out of the tip as it rises.
    F(80, {stage: 3, eyes: 'spark', arm: 'eureka', flash: 4, tip: 'white', stalk: true, glow: 3, rays: 6});
    F(90, {stage: 4, eyes: 'glow', arm: 'open', tip: 'white', stalk: true, lift: 1, jet: true, grow: 7});
    F(100, {stage: 4, eyes: 'glow', arm: 'open', tip: 'white', stalk: true, lift: 2, jet: true, grow: 15});
    F(110, {stage: 4, eyes: 'glow', arm: 'open', tip: 'white', lift: 3, grow: 26});
    F(130, {stage: 4, eyes: 'glow', arm: 'open', tip: 'white', lift: 4, grow: 42});
    // 4. Cosmic: floating on a slow bob under a still sky (the nebula centred on the tip at the mean lift, so the cloud
    // does not bob with it), the galaxy brain, the nebula drifting out of the tip, the stars twinkling.
    const BOB = [0, 0, -1, -1, -1, 0, 0, 0, 1, 1, 1, 0];
    for (let k = 0; k < BOB.length; k++) F(300, {stage: 4, eyes: 'glow', arm: 'open', tip: k % 2 ? 'white' : 'ping', lift: 4 + BOB[k], sky: 4, grow: 90, t: k + 1, k});
    // Reset: the cloud drawn back into the tip, landing, the brain shrinking, a blank stare, a blink (loops to frame 0).
    F(90, {stage: 4, eyes: 'glow', arm: 'open', tip: 'white', lift: 3, grow: 26, t: BOB.length + 1, k: BOB.length});
    F(90, {stage: 4, eyes: 'glow', arm: 'open', tip: 'ping', lift: 2, grow: 10, t: BOB.length + 1, k: BOB.length + 1});
    F(100, {stage: 2, eyes: 'open', arm: 'rest', tip: 'ping', lift: 1});
    F(320, {stage: 1, eyes: 'open', arm: 'rest'});
    F(140, {stage: 1, eyes: 'shut', arm: 'rest'});

    return {
      name: 'ECHO · galaxy brain', key: 'echo_galaxy_brain', fwname: 'echo galaxy brain', category: 'Thinking', size: N,
      // Big tier: 39 frames of 3600 bytes (140 KB) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, 60 cell lattice (8 px cells, the creature at 3x in profile facing left, moonwalk HD\'s side view as a 20 cell pose repeated 3 times across and down): the expanding brain meme as a format, four stages cut by white flashes so they count like panels, its brain seen through the back of its head and growing toward its face; dim, a small brain a shade off the body in the arm\'s teal, edged in dark teal so it holds its shape, no glow, behind half shut eyes and one slow blink; then brighter, a white flash and an antenna ping, a bigger brain lit in visor teal, eyes open, a glow of light on the top and back of its head, and it puts a finger to its temple, taps once so the glow flickers a step brighter, and blinks; then radiant, the largest brain in ping cyan with a white glint and a glowing rim, its glow three bands deep with a dark gap that keeps the head\'s outline and the 3 cell antenna crisp, twelve rays of light beams marching out from it, the finger raised in front of the face, a spark in each eye and the antenna crackling; then the brain whites out, light climbs the antenna and a jet and a violet and magenta nebula burst out of its tip over four frames while stars light across the black and it rises four rows, its shadow gone, with its arms spread forward and back, and for 3.6 s it floats on a slow bob under a still sky with its eyes glowing white in a darkened visor and its brain turned into a galaxy (violet, magenta folds, white stars, a cyan rim) while the nebula drifts and swirls outward from the antenna over its head and the stars twinkle; then the cloud is drawn back into the tip, it lands as the brain shrinks back to small and dim, a blank stare and a blink start it over, 11.2 s a loop; judge whether the brain reads as a brain at every size, whether the four steps read as the meme with no captions, whether the finger at the temple reads as thinking, and whether the cosmic stage is still this creature.',
      // 0 transparent, 1 body (and the dim brain's folds), 2 eyes, 3 visor (the lit brain, the inner glow band), 4 ping (the
      // radiant brain, the rays, the galaxy brain's rim), 5 feet (the lit brain's folds, the dim brain's edge, the crease,
      // the outer glow band, the shadow, the far arm, the dark visor), 6 white, 7 violet, 8 magenta, 9 the near arm's teal
      // (and the dim brain and a glow band)
      palette: [...ECHO_PALETTE.slice(0, 6), '#eafffb', '#8a5cff', '#ff5fd2', '#26a98f'],
      frames,
    };
  })();

  L.register([echoGalaxyBrain]);
})(typeof window !== 'undefined' ? window : globalThis);
