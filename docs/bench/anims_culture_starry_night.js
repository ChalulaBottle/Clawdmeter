// Culture creatures (operator, 2026-10-02: "famous paintings, memes, popculture ... get crazy get creative"): the ECHO
// creature plays every role, and a work is homaged by its composition, its setting and its gesture only. This file is
// one painting in the public domain. Drawn from scratch in code on the ECHO base; no traced image, no fetched pixels.
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {upscale, echoPing} = L;

  // ---------- echo starry night ----------
  // Van Gogh, 1889, the view from the window at Saint Remy: the creature sits on the hill beside the dark flame of the
  // cypress under a sky of turning swirls, a crescent moon and haloed stars, looks up, and its antenna answers a star.
  // A 60 cell lattice, 8 px cells on the 480 panel, built the way mushroom HD is built: the creature is the family's 20
  // cell pose repeated exactly 3 times across and down, 20 rows lower and 5 cols right of the family frame, so it sits
  // deep in the grass with its hands on the crest of the hill and the sky keeps the top half of the panel; the face
  // detail is painted at 8 px on the 3x pose, with mushroom HD b's shading rows under the arms and hands. A dark rim of
  // night blue keeps its outline clear of the strokes behind it.
  //   sky      every cell of it is a brush stroke: long strokes of cobalt, a few pale, on a night blue ground, laid along
  //            bands a row thick that wave gently across the panel and flow right a cell a step.
  //   swirl    in the middle, an oval spiral of two arms round a pale eye, each arm a pale stroke shaded cobalt with a
  //            rare break where the brush lifts, turning clockwise half a turn a loop (two arms look the same after half
  //            a turn, so the loop closes on the same picture); the breaks ride with the turn.
  //   moon     top right, a gold crescent in three dashed rings (gold, pale, cobalt) that wheel slowly round it.
  //   stars    six, breathing on their own phases: two big ones, a pale core in gold inside a dashed gold ring and a
  //            dashed outer ring (the big one beside the cypress, where the painting has its morning star, and the one
  //            over the antenna); four small ones, each a twinkle: a pale heart in a gold plus whose arms grow a cell at
  //            the top of its breath, the flare's cross in small (no ring: a ring round a plus reads as a button).
  //   cypress  a dark flame from the bottom edge to the top, near black with dark teal strokes rising up it, its
  //            lobes licking upward and a second tongue on its right; it stands on the hill, in front of the sky.
  //   hill     the foreground, dark teal laid like the sky in bands that follow the crest, with short strokes that stay
  //            still, cobalt and near black a band each (the painting's blue green and its dark contours), and tufts of
  //            grass in dark teal on the crest, painted over the creature's lower body, so it sits in it.
  //   gaze     rest, then the face tips back a row (the visor band rises a row, as mushroom HD's does while it gazes)
  //            and the eyes roll up into the top of it (the family's own look up at 3x); it watches the sky turn; a blink.
  //   answer   its eyes slide toward the star over its antenna; the star flares (a cross of rays, two steps), then
  //            the antenna tip pings inside a ring of ping that travels out to the star on the next step, so for a
  //            moment the creature is one of the stars; happy eyes. Then a glance left at the big star and the swirl, a
  //            blink, a smaller twinkle answered by a second ping and its ring, and the face and eyes come level.
  // Timing: one sky step of 300 ms, 36 sky steps a loop: 38 frames, 10.8 s. Each of the two blinks takes the last
  // 110 ms of its own sky step (the eyes up for 190 ms, then the blink), so every sky step is 300 ms and the turning
  // keeps one even pace. Every cycle in the sky divides 36 steps: the swirl half a turn, the flow bands 9, 12 and 18
  // cell stroke periods at a cell a step, the star breath 9 steps and the stars' rings 4 dash lengths a loop, the
  // moon's rings 3, the cypress strokes 9 rows at half a row a step and its lobes 2 periods; a 37th step is frame 0
  // cell for cell.
  // Palette: 0..5 the ECHO palette unchanged (2 is also the cypress and the hill's dark strokes; 5 also the cypress
  // strokes, the hill's ground, the grass and the shading rows); 6 night blue (the sky's ground and the creature's rim),
  // 7 cobalt (strokes, in the sky and on the hill), 8 pale (strokes, the swirl's arms, star hearts), 9 gold (stars and
  // moon). 4, the ping, stays the antenna's own (its tip and its ring), so the answer reads. Index 6 is not ping here,
  // so nothing goes through echoGlitch. Big tier: 38 frames of 3600 cells are 136800 bytes of firmware table, so it
  // ships only on boards built with SPLASH_BIG.
  // One closure, so echoStarryNight is the only name it adds to this scope.
  const echoStarryNight = (() => {
    const N = 60, K = 3;                                           // lattice; a 20 cell pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, DARK = 5, NIGHT = 6, COBALT = 7, PALE = 8, GOLD = 9;
    // Constants: 60 cells of 8 px; the creature at 3x, 20 rows down and 5 cols right; sky step 300 ms, 36 a loop (10.8 s), a blink the last 110 ms of its step; swirl centre (16.5, 30.5), 13.5 cells across its half width and 0.7 of that tall, two arms 4.6 cells apart, half a turn a loop; moon at (6.5, 51.5), 4.3 across its half; stars breathe in 9 steps, a small one's arms 1 cell long, 2 above breath 0.6; the answer's rings 2.4 to 3.3 and 4.4 to 5.1 cells round the tip; the face 1 row higher while the eyes are not level; hill crest row 53 at the creature, its strokes 2 or 3 cells in 7, 9 and 11.
    const STEP = 300, BLINK = 110, S = 36;                         // ms a sky step; ms a blink; sky steps a loop
    const DY = 20, DX = 5;                                         // where the 3x pose sits in the panel
    const TAU = 2 * Math.PI;
    const frac = x => x - Math.floor(x);
    const mod = (a, n) => ((a % n) + n) % n;
    const hash = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);   // a fixed scatter, the same on every run
    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const put = (g, r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v; return g; };

    // ---- the sky ----
    // The flow: bands a row thick that wave gently across the panel (a sine 1.4 rows high, 30 cols long, the same at
    // every row, so a band never breaks); each band carries long strokes of its own length and period (9, 12 or 18
    // cells, all dividing the loop's 36 steps), moving right a cell a step. One band in four is quiet; the strokes are
    // cobalt, a few pale.
    function flow(r, c, k) {
      const y = r + 0.5, x = c + 0.5;
      const b = Math.floor(y + 1.4 * Math.sin(TAU * x / 30));
      const h = hash(b), m = mod(b, 3), P = [9, 12, 18][m], len = [5, 7, 9][m];
      if (h < 0.25) return NIGHT;                                  // a quiet band
      return mod(c - k + Math.floor(hash(b + 99) * P), P) < len ? (h > 0.88 ? PALE : COBALT) : NIGHT;
    }
    // The great swirl: an oval spiral of two arms, each a pale stroke over a cobalt one (the shade on its outer side),
    // wound round a pale eye and turning clockwise half a turn a loop (two arms look the same after half a turn, so
    // the loop closes on the same picture). rho is in cells across; the oval is SW.ay as tall as it is wide; W is the
    // gap between the arms. A rare short break in the pale stroke, riding the turn, is the brush lifting.
    const SW = {r: 16.5, c: 30.5, ay: 0.7, R: 13.5, arms: 2, W: 4.6};
    function swirl(r, c, k) {
      const x = c + 0.5 - SW.c, y = (r + 0.5 - SW.r) / SW.ay, rho = Math.hypot(x, y);
      if (rho > SW.R) return 0;
      if (rho < 1.9) return PALE;                                  // the bright eye of the swirl
      const phi = Math.atan2(y, x) - (TAU / SW.arms) * k / S;      // the turn
      const s = frac(rho / SW.W + SW.arms * phi / TAU);            // where across the gap between two arms this cell lies
      const n = SW.arms * 3;                                       // breaks a turn, a multiple of the arms
      const lift = frac(phi * n / TAU + 0.13 * Math.floor(rho / SW.W)) < 0.1;
      if (s < 0.34) return lift || rho > SW.R - 1.6 ? COBALT : PALE;
      if (s < 0.56) return COBALT;
      return NIGHT;
    }
    // Dashed rings round a centre: [from, to, ink, dashes a turn, duty]; spin turns the dashes that many dash lengths a
    // step (spin times 36 is whole, so the loop closes). Cells between rings are the night ground.
    function rings(d, ang, list, k, spin, seed) {
      for (const [a, b, ink, n, duty] of list) {
        if (d < a || d >= b) continue;
        return !n || frac(ang * n / TAU + spin * k + hash(seed + a * 7)) < duty ? ink : NIGHT;
      }
      return NIGHT;
    }
    // The moon: a gold crescent (a disc with a disc cut out of its upper right) in three wheeling rings.
    const MOON = {r: 6.5, c: 51.5, R: 4.3, cut: [-1.1, 2.0, 3.7], reach: 9.2};
    const MOON_RINGS = [[5.2, 6.1, GOLD, 12, 0.72], [6.9, 7.7, PALE, 14, 0.55], [8.4, 9.2, COBALT, 16, 0.6]];
    function moon(r, c, k) {
      const y = r + 0.5 - MOON.r, x = c + 0.5 - MOON.c, d = Math.hypot(y, x);
      if (d > MOON.reach) return 0;
      if (d <= MOON.R) return Math.hypot(y - MOON.cut[0], x - MOON.cut[1]) <= MOON.cut[2] ? NIGHT : GOLD;
      return rings(d, Math.atan2(y, x), MOON_RINGS, k, 1 / 12, 3);
    }
    // The stars: [row, col, size 1..3, breath phase in steps]. Star 0 is the one over the antenna, star 1 the big one
    // beside the cypress. A small star's centre sits on a cell's centre, so its plus is whole at every breath.
    const STARS = [[18, 49, 2, 0], [24, 15, 3, 4], [4.5, 17.5, 1, 2], [4.5, 37.5, 1, 7], [27.5, 34.5, 1, 5], [30.5, 57.5, 1, 1]];
    const BREATH = 9;                                              // steps a breath
    const TWINKLE = 0.6;                                           // above this breath a small star's arms are a cell longer
    // A star at breath p (0..1) and flare f (0, 1, 2): its core, its gold ring, its outer ring, and on a flare a cross
    // of rays. A small star is a twinkle instead: a pale heart in a gold plus whose arms grow a cell at the top of its
    // breath, the flare's cross in small (no ring: a ring round a plus reads as a button). Inside its reach the cells a
    // star does not ink are the night ground, so the strokes part round it; returns 0 outside its reach.
    function star([sr, sc, z, ph], r, c, k, f) {
      const y = r + 0.5 - sr, x = c + 0.5 - sc, d = Math.hypot(y, x);
      const p = 0.5 - 0.5 * Math.cos(TAU * (k + ph) / BREATH);
      const core = [0, 1.0, 1.15, 1.5][z] + 0.45 * p + 0.6 * f;
      const reach = [0, 2.7, 4.7, 5.5][z] + 0.4 * p + 1.4 * f;
      if (d > reach) return 0;
      if (f && (Math.abs(y) < 0.6 || Math.abs(x) < 0.6) && d < core + 1.6 + 1.6 * f) return d < core + 1.2 ? GOLD : PALE;
      if (z === 1) return Math.min(Math.abs(y), Math.abs(x)) < 0.5 && d < (p > TWINKLE ? 2.5 : 1.5) ? (d < 0.5 ? PALE : GOLD) : NIGHT;
      if (d <= core) return d <= core - 0.7 ? PALE : GOLD;
      const g0 = core + 0.6, g1 = g0 + 0.9;
      const list = [[g0, g1, GOLD, 8, 0.75], [g1 + 0.7, reach, z > 2 ? PALE : COBALT, 10, 0.6]];
      return rings(d, Math.atan2(y, x), list, k, 1 / 9, sr * 3 + sc);
    }
    // The whole sky at step k; flare [star, size].
    function sky(k, flare) {
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        let v = moon(r, c, k);
        for (let i = 0; !v && i < STARS.length; i++) v = star(STARS[i], r, c, k, flare && flare[0] === i ? flare[1] : 0);
        g[r][c] = v || swirl(r, c, k) || flow(r, c, k);
      }
      return g;
    }

    // ---- the cypress ----
    // A centre line leaning a little right as it climbs, with a soft S, and half widths up its height (h 0 at the bottom
    // row, 1 at the tip); each side lobed like a flame, the right side's lobes a third of a period behind the left's,
    // the lobes 10 rows apart and rising 5/9 of a row a step (two periods a loop); a second, smaller tongue licks up on
    // the right two thirds of the way up. Near black, with three dark teal strokes up its length, dashed 6 on 3 off,
    // rising half a row a step.
    const CYP_TIP = 1;
    const CYP_W = [[0, 4.8], [0.12, 5.5], [0.3, 5.2], [0.5, 4.3], [0.66, 3.1], [0.8, 2.0], [0.92, 1.0], [1, 0.3]];
    const TONGUE = {h0: 0.56, h1: 0.8, off: 2.6, w: 1.5};          // the side tongue: heights, cols right of the centre, half width
    const tab = (T, u) => { for (let i = 1; i < T.length; i++) if (u <= T[i][0]) { const [u0, w0] = T[i - 1], [u1, w1] = T[i]; return w0 + (w1 - w0) * (u - u0) / (u1 - u0); } return T[T.length - 1][1]; };
    function cypress(r, c, k) {
      const y = r + 0.5, x = c + 0.5, h = (N - y) / (N - CYP_TIP);
      if (h < 0 || h > 1) return 0;
      const x0 = 5.4 + 1.2 * Math.sin(h * 3.4) + 1.6 * h, w = tab(CYP_W, h);
      const lobe = ph => 1 + 0.3 * Math.sin(TAU * (y + k * 5 / 9) / 10 + ph);
      const t = (h - TONGUE.h0) / (TONGUE.h1 - TONGUE.h0);           // up the side tongue, 0..1
      const inTongue = t >= 0 && t <= 1 && Math.abs(x - (x0 + TONGUE.off + 2.2 * t)) <= TONGUE.w * (1 - t) * lobe(2);
      if (!inTongue && (x < x0 - w * lobe(0) || x > x0 + w * lobe(TAU / 3))) return 0;
      const s = (x - x0) / Math.max(w, 1);
      const stroke = [-0.5, 0.05, 0.6].some(m => Math.abs(s - m) < 0.16);
      return stroke && mod(r + Math.floor(k / 2) + Math.floor(s * 4), 9) < 6 ? DARK : EYE;
    }

    // ---- the hill ----
    // The crest: row 53 under the creature, rising to about 50 where the cypress stands. Dark teal ground laid in the
    // sky's own way: bands a row thick that follow the crest down the slope, each with short strokes of its own length
    // and period, still (the ground does not flow), cobalt and near black a band each: the cobalt picks up the
    // painting's blue green, the near black its dark contours, and at 2 or 3 cells in 7 to 11 they stay brush work
    // rather than rubble. Tufts of grass in dark teal one or two rows over the crest. Painted last, over the creature,
    // so the creature sits in it with its hands on the crest.
    const crest = c => 53 - 3.4 * Math.exp(-((((c + 0.5) - 4) / 9) ** 2)) + 0.45 * Math.sin((c + 0.5) * 0.9);
    function hill(g) {
      for (let c = 0; c < N; c++) {
        const top = Math.ceil(crest(c) - 0.5);
        for (let r = top; r < N; r++) {
          const b = Math.floor(r + 0.5 - crest(c)), P = [7, 9, 11][mod(b, 3)];
          g[r][c] = b > 0 && mod(c + Math.floor(hash(b + 21) * P), P) < [2, 3, 2][mod(b, 3)] ? (b % 2 ? COBALT : EYE) : DARK;
        }
        const tuft = hash(c + 7);
        if (tuft > 0.4) put(g, top - 1, c, DARK);
        if (tuft > 0.78) put(g, top - 2, c, DARK);
      }
      return g;
    }

    // ---- the creature ----
    // The 3x pose with its face: the family's visor band (rows 18..23, cols 18..44 on the 3x pose) and its eyes, 3
    // across: level (6 tall, the family's own), up (the top 3 rows: the family's look up), up and slid dx cells along
    // the band, a blink (the bottom row of the raised eyes), or happy arches over the raised eyes. Whenever the eyes are
    // not level the face tips back a row, as mushroom HD's does while it gazes: the band rises to rows 17..22 and its
    // old bottom row goes back to body, so the look up reads as the head turning to the sky, not the eyes alone.
    // Then mushroom HD b's shading rows: the underside of each arm and of each hand in the feet teal, only where they are
    // body, so the outline stays (the torso's own last row is under the hill here).
    const ARCH = ['..kkkkk..', '.kk...kk.', 'kk.....kk'];
    const SHADE_ROWS = [[29, 12, 14], [29, 48, 50], [32, 9, 11], [32, 51, 53]];
    function creature(eyes, ping, dx = 0) {
      const p = upscale(echoPing(ping), K);
      for (const [r, c0, c1] of SHADE_ROWS) for (let c = c0; c <= c1; c++) if (p[r][c] === BODY) p[r][c] = DARK;
      const top = eyes === 'level' ? 18 : 17;                      // the band's top row: a row higher while it looks up
      for (let c = 18; c <= 44; c++) { for (let r = top; r <= top + 5; r++) p[r][c] = VISOR; if (top < 18) p[23][c] = BODY; }
      for (const c0 of [21, 39]) {
        if (eyes === 'happy') { ARCH.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch === 'k') p[top + dr][c0 - 3 + dc] = EYE; })); continue; }
        const [r0, r1] = eyes === 'level' ? [18, 23] : eyes === 'blink' ? [top + 2, top + 2] : [top, top + 2];
        for (let r = r0; r <= r1; r++) for (let c = c0 + dx; c < c0 + dx + 3; c++) p[r][c] = EYE;
      }
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (p[r][c]) put(g, r + DY, c + DX, p[r][c]);
      return g;
    }
    const TIP = [24.5, 51.5];                                      // the antenna tip's centre on the panel
    // The answer: a ring of ping round the lit tip, then a wider, thinner one as it travels out toward the star (the
    // wave paints over the sky and the star's rings, never over the creature).
    const WAVES = [[2.4, 3.3, PING, 0, 1], [4.4, 5.1, PING, 0, 1]];

    // ---- a frame ----
    // o: k the sky step; eyes, dx, ping, wave (0 or 1, the answer's ring), flare [star, 1 or 2].
    function frame(o) {
      const g = sky(o.k, o.flare);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = cypress(r, c, o.k); if (v) g[r][c] = v; }
      const me = creature(o.eyes || 'level', !!o.ping, o.dx || 0);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {   // the rim: night blue round the creature, over sky only
        if (me[r][c] || g[r][c] === EYE || g[r][c] === DARK) continue;
        let near = false;
        for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1; b++) if (me[r + a] && me[r + a][c + b]) { near = true; break; }
        if (near) g[r][c] = NIGHT;
      }
      if (o.wave !== undefined) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (me[r][c]) continue;
        const y = r + 0.5 - TIP[0], x = c + 0.5 - TIP[1], d = Math.hypot(y, x);
        if (rings(d, Math.atan2(y, x), [WAVES[o.wave]], o.k, 1 / 9, 1) === PING) g[r][c] = PING;
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (me[r][c]) g[r][c] = me[r][c];
      return hill(g);
    }

    // ---- the loop ----
    const frames = [];
    const F = (hold, o) => frames.push({hold, grid: frame(o)});
    const B = (k, o = {}) => F(STEP, {k, ...o});                   // a sky step
    // A sky step that ends in a blink: the eyes up for the step less the blink, then the blink, both on sky step k, so
    // every sky step is STEP long and the turning keeps one even pace.
    const W = k => { F(STEP - BLINK, {k, eyes: 'up'}); F(BLINK, {k, eyes: 'blink'}); };
    for (let k = 0; k <= 2; k++) B(k);                             // rest, the loop anchor
    B(3, {eyes: 'up'});                                            // it looks up, the face tipped back a row
    for (let k = 4; k <= 9; k++) { if (k === 7) W(k); else B(k, {eyes: 'up'}); }
    B(10, {eyes: 'up', dx: 2});                                    // the eyes slide toward the star over the antenna
    B(11, {eyes: 'up', dx: 2, flare: [0, 1]});                     // the star flares
    B(12, {eyes: 'up', dx: 2, flare: [0, 2]});
    B(13, {eyes: 'up', dx: 2, ping: true, wave: 0, flare: [0, 1]});   // and the antenna answers
    B(14, {eyes: 'up', dx: 2, ping: true, wave: 1});
    for (let k = 15; k <= 17; k++) B(k, {eyes: 'happy'});          // happy
    for (let k = 18; k <= 20; k++) B(k, {eyes: 'up', dx: -2});     // a glance left, at the big star and the swirl
    for (let k = 21; k <= 24; k++) { if (k === 21) W(k); else B(k, {eyes: 'up'}); }
    B(25, {eyes: 'up', dx: 2, flare: [0, 1]});                     // a smaller twinkle
    B(26, {eyes: 'up', dx: 2, ping: true, wave: 0});               // and a second ping
    for (let k = 27; k <= 31; k++) B(k, {eyes: 'up'});
    for (let k = 32; k <= 35; k++) B(k);                           // the face and eyes come level (loops to the rest)

    return {
      name: 'ECHO · starry night', key: 'echo_starry_night', fwname: 'echo starry night', category: 'Idle', size: N,
      // Big tier, like the HD cells: 38 frames of 3600 bytes (136800 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, culture, Van Gogh 1889, 60 cell lattice (8 px cells, the creature at 3x as in mushroom HD): the creature sits deep in the grass of a dark teal hill laid in short cobalt and near black strokes, with its hands on the crest, beside the near black flame of a cypress that rises from the bottom edge to the top with dark teal strokes climbing it, under a night sky painted entirely in brush strokes, cobalt and a little pale blue on night blue, flowing right along gently waving bands, round a great oval swirl of two pale arms shaded cobalt that turns clockwise half a turn a loop, a gold crescent moon in three wheeling dashed rings at the top right and six stars breathing on their own phases, two big ones in dashed gold rings (one beside the cypress, one over the antenna) and four small ones that twinkle, a pale heart in a gold plus whose arms grow a cell at the top of each breath; its face tips back a row and it looks up into the sky, blinks, slides its eyes toward the star over its antenna, the star flares in a cross of rays and the antenna answers with a ping inside a ring of ping that travels out to the star, so for a moment it is one of the stars, happy eyes, a glance left at the big star and the swirl, a blink, a smaller twinkle answered by a second ping, and its face comes level; a 10.8 s loop of 38 frames, 36 sky steps of 300 ms with each blink inside its own step, in which every cycle in the sky closes on the same picture; judge whether the sky reads as the painting from across the room, whether the swirl reads as turning, whether the strokes read as brush work rather than noise, whether the small stars twinkle rather than sit, and whether the creature still reads in front of so busy a sky.',
      // 0 transparent, 1 body, 2 eyes (also the cypress and the hill's dark strokes), 3 visor, 4 ping (the antenna tip
      // and its ring), 5 feet (here the cypress strokes, the hill's ground, the grass and the shading rows), 6 night blue
      // (the sky's ground, the rim), 7 cobalt strokes (sky and hill), 8 pale strokes (the swirl's arms, star hearts),
      // 9 gold (stars, moon)
      palette: [...L.ECHO_PALETTE.slice(0, 6), '#1b2d6b', '#3566c4', '#bcd8f5', '#f5cf45'],
      frames,
    };
  })();

  L.register([echoStarryNight]);
})(typeof window !== 'undefined' ? window : globalThis);
