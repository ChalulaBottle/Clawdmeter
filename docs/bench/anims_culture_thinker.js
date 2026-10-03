// ECHO · thinker (culture set; operator, 2026-10-02: "famous paintings, memes, pop culture ... get crazy get creative").
// Rodin's The Thinker (the bronze of 1904, public domain): the composition, the setting and the gesture only, with the
// ECHO creature in the role, cast in bronze on its own rock. 60 cell lattice, 8 px cells on the 480 panel. Self
// contained: it reads only ECHO_PALETTE from anims.js. Loaded after anims.js (bench: a script tag; export:
// tools/bench_to_json.js globs anims_*.js).
// The view: the creature in profile facing right at its 3x HD size, moonwalk HD's side view counted in family units (a
// unit is a family cell, 3 cells here): the body 9 deep and 10 tall, the visor band on its front half with the near eye a
// unit wide and the far eye two thirds, the antenna on the back corner. Seated, every row of the body slides forward a
// fifth of a unit for each unit it stands over the seat (a shear, as the moonwalk's lean, so the bottom stays on the
// seat and the band stays a band); the eyes stand upright in the leaning band.
// The pose is Rodin's: the far arm crosses from behind the body to put its elbow on the near knee and its fist under the
// chin (his right elbow on his left knee), its forearm and fist drawn in front of the chest; the near arm hangs at the
// side and rests its hand on the thigh; the near thigh runs out level to a knee two units clear of the body, the shin
// drops to a ledge, and the far leg hides behind the near one. The rock is part of the cast, as Rodin's is: a seat on
// row 49, a front face cut back under the seat so the shin hangs over black, a ledge on rows 58 and 59 for the feet, a
// bump behind the back, three short cracks.
// The bronze: every part rounds over its own edges (its distance to its edge and the slope of its blurred outline give a
// normal, a light from the upper right front gives four tones, dark, mid, light and a gold specular), the lower body
// falls into shade in one clean step, a part in front shades the cell below and left of it, and a black rim keeps every
// limb off the rock and the thigh and the chin forearm off the body. The near arm gets no rim: it lies on the body in a
// crease, bronze dark in the cast and the legs' teal alive (moonwalk HD's crease), and never takes the gold, so after the
// eyes the fist under the chin is the strongest shape. The band of the cast is light bronze, its eyes dark.
//   statue    the loop anchor and the dominant state, 2.2 s: the cast sits still, eyes down.
//   think     three gold thought dots rise off the front of the head toward the upper right, small to big, half a second
//             apart; from the second the eyes are screwed shut, thinking hard.
//   idea      a tiny bulb, 7 across and 10 tall, appears at the end of the dots, dark, flickers on and off twice and
//             comes on with rays; the dots go, the bronze eyes pop open and look up at it, and the antenna tip pings: the
//             first life.
//   wake      a ping scan line runs down the body in two frames with the family's colours behind it; the creature looks
//             up at the bulb a beat.
//   eureka    it springs off the seat reaching for the bulb with both arms, lands standing on the rock with a fist pumped
//             up in front of its face, happy eyes and a ping, hops again while the rays twinkle, then stands, eyes open,
//             and blinks.
//   sit       it sits back down into the pose as the bulb goes dark and then goes, the fist back under the chin; the feet
//             stay planted on the ledge while the hip comes down.
//   cast      the bronze climbs back up from the feet in four frames behind a gold rim, the antenna tip the last thing
//             lit; a glint sweeps across the cast and the loop closes on the statue.
// Constants: 60 cells of 8 px; the creature at 3x (body 27 x 30), lean 0.2 a unit, edges round over 0.75 of a unit;
// seat row 49, ledge row 58; the bulb at rows 3..12, cols 49..55; 31 frames, 9.04 s.
// Palette: 0..5 the ECHO palette unchanged (2 is also the cracks in the rock, 4 the wake's scan line, 5 the legs and the
// far arm while alive and the near arm's shadow and crease on the body); 6 bronze dark (also the near arm's crease in the
// cast), 7 bronze mid, 8 bronze light (also the band of the cast and the dark bulb's glass), 9 gold (the specular, the
// thought dots, the lit bulb and its rays, the rim of the climbing bronze, the glint). Index 6 is not the duplicate ping
// here, so no frame goes through echoGlitch.
// Big tier: 31 frames of 3600 cells are 111600 bytes of firmware table, so it ships only on boards built with SPLASH_BIG.
// One closure, so echoThinker is the only name it adds to this scope.
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {ECHO_PALETTE} = L;

  const echoThinker = (() => {
    const N = 60;
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, FEET = 5, DARK = 6, MID = 7, LIGHT = 8, GOLD = 9;
    const K = 3;                                                   // cells a family unit: the creature at 3x (2x left it too small)
    // The creature in profile facing right, in family units (one unit a family cell): x forward from the bottom centre
    // of the body, h up from its bottom edge. Moonwalk HD's side view: 9 deep, 10 tall.
    const HALF = 4.5, TALL = 10;
    const BAND = [6, 8], BAND_X = -0.5;                            // the visor band: heights, and its back end
    const EYES = [[0.5, 1.5], [3.17, 3.83]];                       // the near eye a unit wide, the far eye two thirds
    const ANT = [-4.5, -3.5], STALK = 12, TIP_TOP = 13;            // the antenna on the back corner: stalk, then the tip
    const LEAN = 0.2;                                              // forward shear of the seated body, a unit per 5 up
    const DROP = 3.0;                                              // seated: the ledge under the feet, below the seat
    const SEAT = Math.floor(58 - DROP * K);                        // the seat row: the seated body's bottom edge
    const HC = 27 - 2.2 * K;                                       // the body's bottom centre col
    const BEVEL = 0.75;                                            // units over which an edge rounds into the face
    const LIT = (() => { const v = [0.45, -0.8, 0.55], l = Math.hypot(...v); return v.map(x => x / l); })();   // upper right front

    const blank = (v = 0) => Array.from({length: N}, () => new Array(N).fill(v));
    const seg = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };
    const inPoly = (y, x, P) => {
      let inside = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [yi, xi] = P[i], [yj, xj] = P[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    // Family units [x, h] about a hip [row, col] to the panel [row, col].
    const at = (hip, [x, h]) => [hip[0] - K * h, hip[1] + K * x];

    // The rock, the bronze casting the figure sits on: the seat, its front face, a ledge for the feet, in units about
    // the seated hip.
    const ROCK_U = [[-7.0, -0.8], [-6.6, 0.6], [-5.9, 1.3], [-5.1, 1.1], [-4.7, 0.4], [-4.5, 0], [4.9, 0], [5.25, -0.4],
                    [5.0, -1.4], [4.6, -2.4], [4.8, -DROP], [10.4, -DROP], [11.0, -DROP - 0.4], [11.6, -DROP - 1.4], [11.6, -30], [-7.2, -30]];
    const ROCK = ROCK_U.map(p => at([SEAT, HC], p));
    // Cracks in the rock, a cell wide in the dark, each with its lit lip on the left (the wall that faces the light).
    // One short break each, off the top edge: run down the whole face as zigzags they read as stitching, not stone.
    const CRACKS = (() => {
      const g = blank(0);
      const LINES = [[[-2.6, -0.3], [-3.2, -1.5]], [[2.2, -0.4], [2.7, -1.5]], [[8.0, -3.1], [8.6, -3.8]]];
      for (const line of LINES) {
        const P = line.map(q => at([SEAT, HC], q));
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          let d = Infinity;
          for (let k = 0; k + 1 < P.length; k++) d = Math.min(d, seg(r + 0.5, c + 0.5, P[k], P[k + 1]));
          if (d <= 0.55) { g[r][c] = EYE; if (c > 0 && !g[r][c - 1]) g[r][c - 1] = MID; }
        }
      }
      return g;
    })();

    // ---- the creature ----
    // p.hip [row, col]: the bottom centre of the body; p.lean: forward shear.
    function eyeAt(p, k, v, u) {
      const mode = p.eyes || 'open', dx = (p.look || 0) / K;
      const [a, b] = EYES[k], cx = (a + b) / 2 + dx;
      if (mode === 'happy') {                                      // a shut happy arch over the eye's place
        const d = Math.hypot(v - cx, (u - 6.55) * 1.15);
        return u > 6.55 && d > 0.62 - 0.12 * k && d < 1.0 - 0.12 * k;
      }
      if (v < a + dx || v >= b + dx) return false;
      if (mode === 'open') return true;
      if (mode === 'down') return u < BAND[0] + 1;
      if (mode === 'up') return u >= BAND[1] - 1;
      if (mode === 'shut') return u >= BAND[0] + 0.67 && u < BAND[0] + 1.0;
      return false;
    }
    // Screwed shut, thinking hard: a flat line a cell wider than the eye each way.
    const squint = (p, v, u) => EYES.some(([a, b]) => v >= a - 0.34 + (p.look || 0) / K && v < b + 0.34 + (p.look || 0) / K) && u >= BAND[0] + 0.67 && u < BAND[0] + 1.0;
    // What the body is at panel point (y, x): 0, or body, band, eye, stalk, tip.
    function bodyAt(p, y, x) {
      const u = (p.hip[0] - y) / K;
      if (u <= 0 || u >= TIP_TOP) return 0;
      const v = (x - p.hip[1]) / K - (p.lean || 0) * u;
      if (u >= TALL) return v > ANT[0] && v < ANT[1] ? (u >= STALK ? 'tip' : 'stalk') : 0;
      if (v <= -HALF || v >= HALF) return 0;
      if (u >= BAND[0] && u < BAND[1] && v >= BAND_X) {
        const e = v + (p.lean || 0) * (u - 7);                     // eyes stand upright in the leaning band
        return (p.eyes === 'squint' ? squint(p, e, u) : eyeAt(p, 0, e, u) || eyeAt(p, 1, e, u)) ? 'eye' : 'band';
      }
      return 'body';
    }
    // A limb: a polyline of unit points about the hip, r units across, and a round hand hr across on its last point.
    const limb = (p, pts, r, hr = 0) => {
      const P = pts.map(q => at(p.hip, q)), R = r * K, HR = hr * K, end = P[P.length - 1];
      return (y, x) => {
        if (HR && Math.hypot(y - end[0], x - end[1]) <= HR) return 'hand';
        for (let k = 0; k + 1 < P.length; k++) if (seg(y, x, P[k], P[k + 1]) <= R) return 'limb';
        return 0;
      };
    };

    // ---- shading ----
    // Per part: the distance to its own edge, and its outward direction from a blurred mask's slope, so every part
    // rounds over its own edges.
    const GAUSS = [-3, -2, -1, 0, 1, 2, 3].map(k => Math.exp(-k * k / 2.6));
    function field(mask) {
      const m = mask.map(row => row.map(v => (v ? 1 : 0)));
      const cl = v => Math.max(0, Math.min(N - 1, v));
      const tmp = blank(0), blur = blank(0);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { let s = 0, w = 0; GAUSS.forEach((g, k) => { s += g * m[r][cl(c + k - 3)]; w += g; }); tmp[r][c] = s / w; }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { let s = 0, w = 0; GAUSS.forEach((g, k) => { s += g * tmp[cl(r + k - 3)][c]; w += g; }); blur[r][c] = s / w; }
      const d = blank(9), ny = blank(0), nx = blank(0), R = 5;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!m[r][c]) continue;
        let best = Infinity;
        for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= N || cc < 0 || cc >= N || m[rr][cc]) continue;
          best = Math.min(best, dr * dr + dc * dc);
        }
        d[r][c] = best === Infinity ? 9 : Math.sqrt(best) - 0.5;
        const gy = (blur[cl(r + 1)][c] - blur[cl(r - 1)][c]) / 2, gx = (blur[r][cl(c + 1)] - blur[r][cl(c - 1)]) / 2;
        const g = Math.hypot(gy, gx);
        if (g > 1e-4) { ny[r][c] = -gy / g; nx[r][c] = -gx / g; }
      }
      return {d, ny, nx};
    }
    const lambert = (f, r, c, bevel) => {
      const s = 1 - Math.min(f.d[r][c] / bevel, 1);
      const n = [f.nx[r][c] * s, f.ny[r][c] * s, Math.sqrt(Math.max(0, 1 - s * s))];
      return n[0] * LIT[0] + n[1] * LIT[1] + n[2] * LIT[2];
    };
    const figureTone = l => (l >= 0.95 ? GOLD : l >= 0.74 ? LIGHT : l >= 0.48 ? MID : DARK);
    const rockTone = l => (l >= 0.88 ? LIGHT : l >= 0.66 ? MID : DARK);
    const deeper = v => (v === GOLD ? LIGHT : v === LIGHT ? MID : DARK);

    // ---- the frame ----
    // p: hip, lean, eyes, look (cells), tip (antenna tip lit), legs {near, far} and arms {near, far} as unit polylines,
    // bronze ('all', 'none', or {row, dir}: life coming down to row, or the bronze climbing back up to it).
    // fx: dots (0..3), bulb ('off', 'on', 'flare', 'flare2'), glint (a sweep position).
    function render(p, fx = {}) {
      const parts = [];
      const add = (name, test) => {
        const mask = blank(0);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) mask[r][c] = test(r + 0.5, c + 0.5) || 0;
        parts.push({name, mask, figure: name !== 'rock'});
      };
      add('rock', (y, x) => (inPoly(y, x, ROCK) ? 'rock' : 0));
      add('farLeg', p.legs.far ? limb(p, p.legs.far, 0.5) : () => 0);
      // the far arm: its upper arm behind the body, its forearm and fist in front of the chest (crossing to the near knee)
      add('farArm', limb(p, p.arms.far.slice(0, 2), 0.62));
      add('ant', (y, x) => { const v = bodyAt(p, y, x); return v === 'stalk' || v === 'tip' ? v : 0; });
      add('body', (y, x) => { const v = bodyAt(p, y, x); return v && v !== 'stalk' && v !== 'tip' ? v : 0; });
      add('farFore', p.arms.far.length > 2 ? limb(p, p.arms.far.slice(1), 0.62, 1.0) : () => 0);   // a fist a unit round
      add('nearLeg', limb(p, p.legs.near, 0.5));
      add('nearArm', limb(p, p.arms.near, 0.62, 0.78));
      const who = blank(-1), sub = blank(0);
      parts.forEach((pt, k) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (pt.mask[r][c]) { who[r][c] = k; sub[r][c] = pt.mask[r][c]; } });
      const fields = parts.map(pt => field(pt.mask));
      const idx = name => parts.findIndex(pt => pt.name === name);
      const BODY_K = idx('body'), NEAR_ARM = idx('nearArm'), NEAR_LEG = idx('nearLeg'), FAR_LEG = idx('farLeg'), FAR_ARM = idx('farArm'), FAR_FORE = idx('farFore');
      const b = p.bronze === undefined ? 'all' : p.bronze;
      const isBronze = r => (b === 'all' ? true : b === 'none' ? false : r >= b.row);
      const g = blank(0);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const k = who[r][c];
        if (k < 0) continue;
        const pt = parts[k], s = sub[r][c];
        // a nearer part just up and right of this cell keeps the light off it
        const shaded = pt.figure && [[-1, 1], [0, 1], [-1, 0]].some(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr >= 0 && cc < N && who[rr][cc] > k; });
        if (!pt.figure) {
          g[r][c] = rockTone(lambert(fields[k], r, c, 1.0 * K));
          if (CRACKS[r][c] && g[r][c] !== LIGHT) g[r][c] = CRACKS[r][c];
          continue;
        }
        if (isBronze(r)) {
          if (s === 'eye') g[r][c] = EYE;
          else if (s === 'band') g[r][c] = shaded ? MID : LIGHT;
          else if (s === 'tip' && p.tip) g[r][c] = PING;
          else {
            let v = figureTone(lambert(fields[k], r, c, BEVEL * K));
            // the near arm never takes the gold: the fist, the elbow and the knee keep the brightest points
            if (k === NEAR_ARM && v === GOLD) v = LIGHT;
            // the lower body falls into shade: one clean step (a checker band here reads as a woven belt)
            if (k === BODY_K && v === MID && (p.hip[0] - r - 0.5) / K < 3.4) v = DARK;
            g[r][c] = shaded ? deeper(v) : v;
          }
          continue;
        }
        // alive: the family's flat colours
        if (s === 'eye') g[r][c] = EYE;
        else if (s === 'band') g[r][c] = VISOR;
        else if (s === 'tip') g[r][c] = p.tip ? PING : BODY;
        else if (k === NEAR_LEG || k === FAR_LEG || k === FAR_ARM || k === FAR_FORE) g[r][c] = FEET;
        else g[r][c] = BODY;
        if (k === BODY_K && shaded && s === 'body') g[r][c] = FEET;                 // the near arm's shadow on the body
        if (k === FAR_LEG && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => who[r + dr] && who[r + dr][c + dc] === NEAR_LEG)) g[r][c] = 0;
      }
      // a dark rim keeps every limb off the rock, and the thigh and the chin forearm off the body behind them; the near
      // arm lies on the body in a crease instead (bronze dark in the cast, the legs' teal alive), the way moonwalk HD
      // creases its near arm, so it stays a quiet arm at the side and never a ringed handle that outshouts the fist
      const LIMBS = [NEAR_ARM, NEAR_LEG, FAR_LEG, FAR_ARM, FAR_FORE], FRONT = [NEAR_LEG, FAR_FORE];
      const rim = blank(false), crease = blank(false);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const k = who[r][c];
        if (k < 0 || (parts[k].figure && k !== BODY_K)) continue;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
          const q = who[rr][cc];
          if (!parts[k].figure && LIMBS.includes(q)) rim[r][c] = true;              // rock beside a limb
          if (k === BODY_K && (dr === 0 || dc === 0)) {
            if (FRONT.includes(q)) rim[r][c] = true;                              // body beside the thigh or the forearm
            else if (q === NEAR_ARM) crease[r][c] = true;                         // body beside the near arm
          }
        }
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (sub[r][c] === 'eye' || sub[r][c] === 'band') continue;               // the band and the eyes stay over it all
        if (rim[r][c]) g[r][c] = 0;
        else if (crease[r][c]) g[r][c] = isBronze(r) ? DARK : FEET;
      }
      // the edge of a sweep: a ping scan line as life comes down, a gold rim as the bronze climbs back
      if (b && typeof b === 'object') {
        const row = b.dir === 'down' ? b.row - 1 : b.row;
        for (let c = 0; c < N; c++) if (row >= 0 && row < N && who[row][c] >= 0 && parts[who[row][c]].figure) g[row][c] = b.dir === 'down' ? PING : GOLD;
      }
      if (fx.glint !== undefined) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const u = c + 0.7 * r - fx.glint;
          if (u >= 0 && u < 2.6 && (g[r][c] === MID || g[r][c] === LIGHT)) g[r][c] = GOLD;
        }
      }
      if (fx.dots) for (const [r0, c0, art] of DOTS.slice(0, fx.dots)) stamp(g, art, r0, c0, {g: GOLD});
      if (fx.bulb) bulb(g, fx.bulb);
      return g;
    }

    // ---- the idea ----
    const stamp = (g, art, r0, c0, ink) => art.forEach((line, dr) => [...line].forEach((ch, dc) => {
      const r = r0 + dr, c = c0 + dc;
      if (ch !== '.' && ink[ch] !== undefined && r >= 0 && r < N && c >= 0 && c < N) g[r][c] = ink[ch];
    }));
    // A tiny bulb, 7 across and 10 tall: g glass, f filament, b and B the screw base.
    const BULB = ['..ggg..', '.g...g.', 'g.....g', 'g..f..g', 'g.f.f.g', '.g...g.', '..ggg..', '..bbb..', '..BBB..', '...b...'];
    const BULB_LIT = ['..ggg..', '.ggggg.', 'ggggggg', 'gggfggg', 'ggfgfgg', '.ggggg.', '..ggg..', '..bbb..', '..BBB..', '...b...'];
    const BULB_AT = [3, 49], BULB_C = [BULB_AT[0] + 3.5, BULB_AT[1] + 3.5];
    // Thought dots, rising off the front of the bowed head toward where the bulb will be, small to big, a gap between.
    const DOTS = [[15, 33, ['gg', 'gg']], [11, 37, ['.g.', 'ggg', '.g.']], [6, 42, ['.gg.', 'gggg', 'gggg', '.gg.']]];
    function bulb(g, state) {
      if (state === 'off') { stamp(g, BULB, ...BULB_AT, {g: LIGHT, f: MID, b: MID, B: DARK}); return; }
      stamp(g, BULB_LIT, ...BULB_AT, {g: GOLD, f: LIGHT, b: MID, B: DARK});
      if (state === 'flare' || state === 'flare2') {
        const long = state === 'flare';
        for (let k = 0; k < 8; k++) {
          if (k === 4) continue;                                   // none down through the base
          const a = k * Math.PI / 4, dy = -Math.cos(a), dx = Math.sin(a);
          for (let s = 5.6; s <= (long ? 7.6 : 6.6); s += 1) {
            const r = Math.floor(BULB_C[0] + dy * s), c = Math.floor(BULB_C[1] + dx * s);
            if (r >= 0 && r < N && c >= 0 && c < N && !g[r][c]) g[r][c] = GOLD;
          }
        }
      }
    }

    // ---- the poses (limb points in family units about the hip, x forward, h up) ----
    // Rodin's pose: the far arm crosses from behind the body to put its elbow on the near knee and its fist under the
    // chin (his right elbow on his left knee); the near arm hangs at the side, its hand down on the thigh (ending on the
    // leg, it closes no loop of rim under the hand); the far leg hides behind the near one.
    // Arms are [shoulder, elbow, fist], legs [hip, knee, ankle, toe].
    const SEATED = {
      hip: [SEAT, HC], lean: LEAN, eyes: 'down', look: 1,
      legs: {near: [[2.0, 0.5], [8.0, 0.5], [8.1, -2.5], [9.1, -2.5]], far: null},
      arms: {far: [[2.46, 4.3], [7.7, 1.75], [6.2, 5.1]], near: [[1.6, 5.0], [2.0, 1.5]]},   // the near hand rests on the thigh
    };
    const STAND_HIP = [SEAT - 3 * K, HC];
    const STAND = {
      hip: STAND_HIP, lean: -0.03, eyes: 'happy', tip: true, bronze: 'none',
      legs: {near: [[1.5, 0.3], [1.5, -2.5], [2.3, -2.5]], far: [[-1.5, 0.3], [-1.5, -2.5], [-0.7, -2.5]]},
      arms: {near: [[2.6, 4.0], [5.8, 5.6], [6.6, 9.3]], far: [[0.8, 4.6], [0.5, 2.4]]},   // the far arm hangs hidden
    };
    const HOP = {...STAND, hip: [STAND_HIP[0] - 1, HC], legs: {near: [[1.5, 0.3], [2.2, -1.3], [1.8, -2.2], [2.6, -2.2]], far: [[-1.5, 0.3], [-0.8, -1.3], [-1.2, -2.2], [-0.4, -2.2]]}};
    const SPRING = {
      hip: [SEAT - 1.6 * K, HC], lean: 0.1, eyes: 'up', look: 1, tip: true, bronze: 'none',
      legs: {near: [[2.0, 0.4], [5.6, 1.0], [4.4, -1.3], [5.3, -1.3]], far: [[1.0, 0.6], [4.8, 1.2], [3.6, -1.1], [4.5, -1.1]]},
      arms: {near: [[2.8, 4.4], [5.9, 5.0], [7.4, 7.8]], far: [[2.0, 4.3], [6.7, 3.9], [8.2, 6.5]]},   // both reach for the bulb
    };
    // Sitting back down, the hip still 0.8 above the seat: the knee, the ankle and the toe stay on the very cells they
    // hold in the pose (pinned from the seated hip to this one), so the feet stay planted on the ledge while the hip
    // comes down and the thigh tips down to the knee.
    const SIT_HIP = [SEAT - 0.8 * K, HC];
    const pin = ([x, h]) => [x + (SEATED.hip[1] - SIT_HIP[1]) / K, h + (SIT_HIP[0] - SEATED.hip[0]) / K];
    const SIT = {
      hip: SIT_HIP, lean: 0.15, eyes: 'open', look: 1, bronze: 'none',
      legs: {near: [[2.0, 0.5], ...SEATED.legs.near.slice(1).map(pin)], far: null},
      arms: {far: [[2.3, 4.3], [7.2, 2.2], [6.5, 5.3]], near: [[1.6, 4.6], [2.0, 1.5]]},
    };

    // ---- the loop ----
    const frames = [], F = (hold, pose, fx) => frames.push({hold, grid: render(pose, fx)});
    const HARD = {...SEATED, eyes: 'squint'};
    F(2200, SEATED);                                                                 // the statue: the loop anchor
    F(500, SEATED, {dots: 1});                                                       // it thinks: the dots rise
    F(500, HARD, {dots: 2});                                                         // and thinks hard
    F(650, HARD, {dots: 3});
    F(350, HARD, {dots: 3, bulb: 'off'});                                            // a tiny bulb, dark
    F(90, HARD, {dots: 3, bulb: 'on'});                                              // it flickers
    F(90, HARD, {dots: 3, bulb: 'off'});
    F(90, HARD, {dots: 3, bulb: 'on'});
    F(140, HARD, {dots: 3, bulb: 'off'});
    F(450, {...SEATED, eyes: 'up', tip: true}, {bulb: 'flare'});                     // on: the eyes pop up to it, a ping
    F(100, {...SEATED, tip: true, eyes: 'up', bronze: {row: SEAT - 20, dir: 'down'}}, {bulb: 'flare2'});   // life runs down
    F(100, {...SEATED, tip: true, eyes: 'up', bronze: {row: SEAT - 6, dir: 'down'}}, {bulb: 'flare'});
    F(350, {...SEATED, tip: true, eyes: 'up', bronze: 'none'}, {bulb: 'flare2'});    // alive, it looks up at it
    F(110, SPRING, {bulb: 'flare'});                                                 // up it springs
    F(160, HOP, {bulb: 'flare2'});
    F(300, STAND, {bulb: 'flare'});
    F(140, HOP, {bulb: 'flare2'});
    F(350, STAND, {bulb: 'flare'});
    F(400, {...STAND, eyes: 'open', tip: false}, {bulb: 'on'});
    F(90, {...STAND, eyes: 'shut', tip: false}, {bulb: 'on'});                       // a blink
    F(250, {...STAND, eyes: 'open', tip: false}, {bulb: 'on'});
    F(130, SIT, {bulb: 'off'});                                                      // it sits back down
    F(400, {...SEATED, bronze: 'none'}, {bulb: 'off'});
    F(250, {...SEATED, bronze: 'none'});
    F(120, {...SEATED, tip: true, bronze: {row: SEAT + 1, dir: 'up'}});              // the bronze climbs back
    F(120, {...SEATED, tip: true, bronze: {row: SEAT - 10, dir: 'up'}});
    F(120, {...SEATED, tip: true, bronze: {row: SEAT - 22, dir: 'up'}});
    F(160, {...SEATED, tip: true, bronze: {row: Math.ceil(SEAT - STALK * K), dir: 'up'}});
    F(110, SEATED, {glint: 30});                                                     // a glint runs over it
    F(110, SEATED, {glint: 48});
    F(110, SEATED, {glint: 66});

    return {
      name: 'ECHO · thinker', key: 'echo_thinker', fwname: 'echo thinker', category: 'Thinking', size: N,
      // Big tier, like the HD cells: 31 frames of 3600 bytes (111600 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, 60 cell lattice (8 px cells, the creature at 3x in profile as in moonwalk HD): Rodin\'s Thinker with the ECHO creature as the statue, cast in dark olive bronze with gold highlights and seated on its own bronze rock, leaning forward with its fist under its chin and that elbow on its knee, the arm crossing from its far side as Rodin\'s does, the other arm hanging at its side with its hand on its thigh and the shin dropping to a ledge; it sits still for 2.2 s, then three gold thought dots rise off its head while its eyes screw shut, a tiny bulb appears at the end of them, flickers twice and comes on with rays, and the bronze eyes pop open and look up at it as the antenna pings; a ping scan line runs down the body with the creature\'s own colours behind it, it springs off the seat reaching for the bulb with both arms, lands standing on the rock with a fist pumped up and happy eyes, hops again, stands, blinks and sits back down into the pose as the bulb goes dark, and the bronze climbs back up from its feet behind a gold rim, the antenna tip the last thing lit, before a glint sweeps across the cast; judge whether the pose reads as the Thinker at a glance with the fist under the chin the strongest shape after the eyes, whether the bronze reads as metal rather than wood and its dark side (half the lit cells of the statue) stays out of the black on the panel, whether the arm crossing to the knee reads as one arm, and whether it is still this creature in profile.',
      // 0 transparent, 1 body, 2 eyes and the rock's cracks, 3 visor, 4 ping (antenna tip, the wake's scan line), 5 legs,
      // the far arm, the shadow and the near arm's crease while alive, 6 bronze dark (also the near arm's crease in the
      // cast), 7 bronze mid, 8 bronze light (the cast's band, the dark bulb), 9 gold (specular, thought dots, the lit bulb
      // and its rays, the climbing rim, the glint)
      palette: [...ECHO_PALETTE.slice(0, 6), '#3b2e1a', '#6e5430', '#b58d4e', '#ffe6a6'],
      frames,
    };
  })();

  L.register([echoThinker]);
})(typeof window !== 'undefined' ? window : globalThis);
