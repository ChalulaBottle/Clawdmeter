// Culture creatures: the slow dodge (operator, 2026-10-03: more animations from famous paintings, memes and pop culture,
// "get crazy get creative"). A film moment homage with no characters in it: the ECHO creature plays the part, and only the
// setting, the composition and the gesture are borrowed (green glyph rain, a long dark coat, a lean back further than any
// body could hold while bullets crawl over it trailing rings of rippled air, the camera circling, then the shades pushed up
// with one finger). Drawn from scratch in code; the glyphs are this file's own marks, not any script. Loaded after anims.js
// (bench: script tag; export: tools/bench_to_json.js globs anims_*.js); registers one cell.
//
// The view: the creature in profile at 2x, facing right, the side view moonwalk HD b set up (the torso 18 deep and 20 tall,
// the visor band on the front half in rows 4..7 with the near eye 2 wide and the far eye 1 wide in it, the antenna on the
// back corner, 2 wide and 6 tall with a 2 x 2 tip that pings). Why 2x and not 3x: lying back, the torso's depth becomes its
// height, and at 3x that is 27 rows of torso with the legs under it, more than the panel has below the bullets' paths.
// The coat: a long coat worn open, in near black, with a deep teal rim light on every edge that meets the night and a crease
// wherever coat lies on coat (a sleeve on the coat, the torso's edge on the hanging skirt). It covers the back of the torso,
// from a collar turned up behind the head to the lapel at u 10; the chest in front of the lapel stays the family's teal, so
// the creature is still itself, and lying back its teal front faces up while the coat hangs underneath. Below the torso the
// skirt hangs 10 rows: a strand from every point of the back face (up to v 12) and of the base (as far as the knees) hangs as
// long as the coat below that point, swung by the coat angle (negative: flared back) and lying along the floor where it
// reaches it; in the lean the skirt rides up a third and parts into three tails, notched at 0.36 and 0.68 of the way along,
// so the air under the body shows between them.
// The lean: the torso turns back about a hip joint in the back third of its base, so it tips back over its own legs and hangs
// in the air behind them with ten rows of black under it; the joint sinks from row 39 to 41.5 as it goes. The legs are longer
// than the family's (a thigh of 7.5 and a shin of 8, so a knee can drive forward; standing, the coat hides the length), the
// knees bent toward the shooter, the soles planted on row 55 in dark boots; the far leg in the coat's near black.
// The bullets: three brass slugs, 4 long and 3 tall, nose first from off the right edge, on the rows where the standing
// creature's antenna tip (13), antenna (17) and crown (21) were, crawling 5 cells a slow frame. Behind each, rings of
// rippled air stand where it passed, edge on (3 wide), one every 4 cells, growing from 3 to 6 rows tall as they age,
// thinning to alternate cells past 10 cells behind the nose and gone at 15. Bullets and rings are never painted on the
// creature or on the dark cell round it; the cell keeps an audit (a hidden audit property) of any cell that would have
// been, and there are none: the arm flinches out of their way.
// The rain: twelve streams of 3 x 3 glyphs on a pitch of 4 rows, at uneven columns, the head glyph pale and the rest green,
// the last two glyphs of a stream and all of the four dim streams on alternate cells. It takes only cells off the creature
// and the dark cell round it. It falls on a clock that runs with the holds in normal time and at 0.08 of that in slow time,
// scaled so a loop is exactly 96 rows (every stream back where it began, so the seam closes); the head glyphs change with
// the clock, every 4 rows, so they freeze when it does. Over the held lean the camera circles: the rain sweeps right, 36
// cells eased in and out, and cuts back on the snap back.
// The beats:
//   stand   normal time in the rain, the coat's back flared a little: an antenna ping, a blink, the eyes go forward to
//           something off the right edge (1.3 s, the loop anchor).
//   slow    shots: the family's glitch split (every row holding the visor two cells right, the visor in ping) and time
//           slows; the first bullet comes in at the right edge.
//   lean    six slow frames from 8 to 74 degrees back, the arm flung up as it goes, the coat lagging forward, and a
//           dithered deep teal echo of the frame before trailing it: the dodger is fast, the world is slow.
//   hold    twelve slow frames at 76 to 80 degrees, the dominant state (3.1 s): the bullets cross over it one after
//           another, the nearest two rows over the head end, where the antenna pings; the arm is up as they come,
//           flinches forward and low while they pass and is flung up again once they are gone; the coat swings out
//           behind as three tails and round again while the rain sweeps sideways behind it, the camera circling.
//   snap    time snaps back on a second glitch split; the bullets are gone and the rain cuts back.
//   up      it springs upright in four normal frames, an echo trailing the first three, the coat lagging back.
//   shades  the hand comes up to the face and one finger pushes the visor up a row like shades, a pale glint runs across
//           the band from back to front, the eyes narrow to a cool squint, an antenna ping, the arm comes down; the visor
//           settles and it stands in the rain again.
// Constants: 60 cells of 8 px; 42 frames, 7.76 s; normal frames 160 ms standing and 100 to 160 ms springing up and at the
// shades; slow frames 230 ms leaning and 260 ms holding; glitch frames 70 ms; the lean 80 degrees at most; the hip joint
// row 39 to 41.5 on col 30; bullets 5 cells a slow frame, a ring every 4 cells; rain 96 rows a loop, 0.08 as fast in slow
// time; the camera's sweep 36 cells.
// Palette: 0..5 the ECHO palette unchanged (4, the ping, is also the rings of rippled air; 5 is also the coat's rim light and
// creases, the near leg, the echo and the floor line); 6 brass (the bullets) in the slot that is the duplicate ping
// elsewhere (this cell has its own glitch split and never sends slot 6 through echoGlitch); 7 the pale rain head and the
// visor's glint; 8 rain green; 9 the coat's near black (also the sleeve, the boots and the far leg).
// Big tier: 42 frames of 3600 cells are 151200 bytes of firmware table, so it ships only on boards built with SPLASH_BIG.
(function (root) {
  const L = root.BENCH_LIB;
  const {ECHO_PALETTE} = L;

  const echoSlowDodge = (() => {
    const N = 60;
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, DEEP = 5, BRASS = 6, HEAD = 7, RAIN = 8, COAT = 9;

    // The stage.
    const FLOOR = 56;                                              // the roof line, seen edge on; soles stand on row 55
    // The creature in torso cells: u from the back (0) to the face (17), v from the top (0) to the bottom (19).
    const TW = 18, TH = 20;
    const BAND_V = 4, BAND_U = 9;                                  // the visor band: rows v 4..7, from u 9 to the face
    const NEAR_EYE = 11, FAR_EYE = 16;                             // the near eye u 11..12, the far eye u 16
    const COLLAR = [4, 4, 5, 6, 8];                                // the coat's top edge on u 0..4: the collar turned up
    const COAT_V = 9;                                              // and on the rest, a row under the visor
    const LAPEL = 11;                                              // worn open: the coat covers u below 11, the chest shows teal
    // Body space: x forward from the torso's bottom centre, y up (negative). The lean turns the torso about the hip joint,
    // in the back third of its base, so the torso tips back over its own legs and hangs in the air behind them.
    const HIP = [-5, -1];                                          // the hip joint in body space: the pivot
    const PIVOT_UP = [39, 30], PIVOT_LOW = [41.5, 30];             // the hip joint on the panel [row, col], standing and deepest
    const LEAN_MAX = 80;
    const SHOULDER = [5, -10];                                     // the near arm's root, in the front third (the far arm stays hidden)
    const UPPER = 5.5, FORE = 5.5, SLEEVE_R = 1.25, HAND_R = 1.5;
    const HIPS = {near: [HIP[0] + 1.5, HIP[1]], far: [HIP[0] - 1.5, HIP[1]]};
    const ANKLES = {near: [52.5, 36], far: [52.5, 31]};
    const THIGH = 7.5, SHIN = 8, LEG_R = 1.3;
    const SKIRT = 10;                                              // rows of coat below the torso, standing
    const FRONT_UP = 2, FRONT_LOW = -4;                            // the coat hangs from the base up to this x: it parts at the knees
    const RIDE = 0.35;                                             // and rides up by this much of its length in the deepest lean
    // The air.
    const BULLET = ['.bbb', 'bbbb', '.bbb'];                       // nose on the left: they fly right to left
    const BULLET_V = 5;                                            // cells a slow frame
    const RING_GAP = 4, RING_AGE = [3, 15];                        // a ring every 4 cells; seen from 3 to 15 cells behind the nose
    const RING_GROW = 0.12;                                        // rows of half height a ring gains a cell of age: 1.5 to 2.9
    // The rain.
    const RAIN_W = 96;                                             // rows a stream falls before it comes round again
    const SLOW = 0.08;                                             // how fast the rain falls in slow time, against normal time

    const rad = d => d * Math.PI / 180;
    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const lerp = (a, b, f) => a + (b - a) * f;
    const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    // Body space to the panel, the torso leaning th degrees back about the hip joint, which stands at piv.
    const toPanel = (piv, th, [x, y]) => {
      const cs = Math.cos(rad(th)), sn = Math.sin(rad(th)), dx = x - HIP[0], dy = y - HIP[1];
      return [piv[0] - dx * sn + dy * cs, piv[1] + dx * cs + dy * sn];
    };
    const segDist = (y, x, [ay, ax], [by, bx]) => {
      const vy = by - ay, vx = bx - ax, wy = y - ay, wx = x - ax, l = vy * vy + vx * vx;
      const t = l ? Math.max(0, Math.min(1, (wy * vy + wx * vx) / l)) : 0;
      return Math.hypot(wy - t * vy, wx - t * vx);
    };

    // A layer: colours g and parts p (0 none, 1 torso, 2 the torso's coat, 3 the sleeve, 4 legs, hands and the finger,
    // 6 boots, 7 the hanging skirt).
    const layer = () => ({g: blank(), p: blank()});
    const put = (Lr, r, c, v, part) => { if (inside(r, c)) { Lr.g[r][c] = v; Lr.p[r][c] = part; } };
    function capsule(Lr, pts, rr, v, part) {
      const ys = pts.map(q => q[0]), xs = pts.map(q => q[1]);
      for (let r = Math.floor(Math.min(...ys) - rr - 1); r <= Math.ceil(Math.max(...ys) + rr + 1); r++)
        for (let c = Math.floor(Math.min(...xs) - rr - 1); c <= Math.ceil(Math.max(...xs) + rr + 1); c++) {
          let d = Infinity;
          for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(r + 0.5, c + 0.5, pts[i], pts[i + 1]));
          if (d <= rr) put(Lr, r, c, v, part);
        }
    }
    const disc = (Lr, [cy, cx], rr, v, part) => {
      for (let r = Math.floor(cy - rr - 1); r <= Math.ceil(cy + rr + 1); r++) for (let c = Math.floor(cx - rr - 1); c <= Math.ceil(cx + rr + 1); c++)
        if (Math.hypot(r + 0.5 - cy, c + 0.5 - cx) <= rr) put(Lr, r, c, v, part);
    };
    function fillPoly(Lr, P, v, part) {
      const ys = P.map(q => q[0]), xs = P.map(q => q[1]);
      for (let r = Math.max(0, Math.floor(Math.min(...ys))); r <= Math.min(N - 1, Math.ceil(Math.max(...ys))); r++)
        for (let c = Math.max(0, Math.floor(Math.min(...xs))); c <= Math.min(N - 1, Math.ceil(Math.max(...xs))); c++) {
          const y = r + 0.5, x = c + 0.5;
          let inPoly = false;
          for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const [yi, xi] = P[i], [yj, xj] = P[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inPoly = !inPoly;
          }
          if (inPoly) put(Lr, r, c, v, part);
        }
    }
    // Two bones from a to b: [a, joint, b], the joint bent toward the front (the larger column), or downward when low.
    function bend(a, b, l1, l2, low = false) {
      const dy = b[0] - a[0], dx = b[1] - a[1], d = Math.min(Math.hypot(dy, dx), l1 + l2 - 1e-6);
      const k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))), base = Math.atan2(dy, dx);
      const js = [base + k, base - k].map(t => [a[0] + l1 * Math.sin(t), a[1] + l1 * Math.cos(t)]);
      const j = low ? (js[0][0] > js[1][0] ? js[0] : js[1]) : (js[0][1] > js[1][1] ? js[0] : js[1]);
      return [a, j, b];
    }

    // The torso and the antenna at torso cell (u, v), fractional; a colour, plus 16 when the cell is the coat, or 0.
    const COATED = 16;
    function torsoAt(u, v, o) {
      if (u >= 0 && u < 2 && v >= -6 && v < 0) return v < -4 && o.ping ? PING : BODY;     // the antenna on the back corner
      if (u >= -1 && u < 0 && v >= COLLAR[0] && v < TH) return COAT + COATED;              // the coat stands a cell proud of the back
      if (u < 0 || u >= TW || v < 0 || v >= TH) return 0;
      const b0 = BAND_V - (o.push ? 1 : 0), look = o.look || 0;
      if (v >= b0 && v < b0 + 4 && u >= BAND_U) {
        let c = VISOR;
        const eye = (u >= NEAR_EYE + look && u < NEAR_EYE + 2 + look) || (u >= FAR_EYE && u < FAR_EYE + 1);
        if (eye && !o.blink && (!o.squint || (v >= b0 + 1 && v < b0 + 3))) c = EYE;
        if (o.glint !== undefined) { const d = u + (v - b0) - o.glint; if (d >= 0 && d < 2.4) c = HEAD; }   // a slanted streak
        return c;
      }
      if (u >= LAPEL || v < (u < COLLAR.length ? COLLAR[Math.floor(u)] : COAT_V)) return BODY;
      return u >= LAPEL - 1 ? DEEP + COATED : COAT + COATED;                                // the lapel edge, then the coat
    }
    function paintTorso(Lr, piv, th, o) {
      const cs = Math.cos(rad(th)), sn = Math.sin(rad(th));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const dr = r + 0.5 - piv[0], dc = c + 0.5 - piv[1];
        if (dr * dr + dc * dc > 1200) continue;
        const t = torsoAt(dc * cs - dr * sn + HIP[0] + TW / 2, dc * sn + dr * cs + HIP[1] + TH, o);
        if (t) put(Lr, r, c, t & 15, t & COATED ? 2 : 1);
      }
    }
    // The skirt: cloth hangs from the back face (up to v 12) and from the base (as far as x front); a strand hangs as long as
    // the coat below the point it hangs from, swung phi degrees off straight down (negative: back), and lies along the floor
    // where it reaches it. part (0 standing, 1 deepest) rides it up and parts it into tails at TAILS.
    const TAILS = [0.36, 0.68], TAIL_W = 0.07, TAIL_DEPTH = 0.75;
    function paintCoat(Lr, piv, th, phiBack, phiFront, front, part) {
      const att = [], n = 32, back = 8, run = back + front + 10;      // the back face up to y -8, then the base to x front
      for (let i = 0; i <= n; i++) {
        const s = run * i / n, f = i / n;
        const p = s < back ? [-10, -back + s] : [-10 + (s - back), 0];
        const dip = Math.max(0, ...TAILS.map(fc => 1 - Math.abs(f - fc) / TAIL_W));
        att.push([p, (SKIRT + Math.max(0, -p[1])) * (1 - RIDE * part) * (1 - TAIL_DEPTH * part * dip), f]);
      }
      const top = [], hem = [];
      for (const [p, len, f] of att) {
        const w = toPanel(piv, th, p), phi = rad(lerp(phiBack, phiFront, f));
        top.push(w);
        hem.push([Math.min(FLOOR - 0.4, w[0] + len * Math.cos(phi)), w[1] + len * Math.sin(phi)]);
      }
      fillPoly(Lr, [...top, ...hem.reverse()], COAT, 7);
    }
    const BOOT = ['.xx...', 'xxxxx.', 'xxxxxx'];
    const paintBoot = (Lr, ankle) => BOOT.forEach((line, i) => [...line].forEach((ch, j) => {
      if (ch === 'x') put(Lr, FLOOR - 3 + i, Math.round(ankle[1] - 1.5) + j, COAT, 6);
    }));
    // The near arm from the shoulder: the upper arm and the forearm [a1, a2] degrees off straight down on the panel
    // (positive: forward), or bent to reach a hand point {to}; a sleeve of coat and a round hand.
    function paintArm(Lr, sh, arm) {
      let pts;
      if (arm.to) pts = bend(sh, arm.to, UPPER, FORE, true);
      else {
        const el = [sh[0] + UPPER * Math.cos(rad(arm[0])), sh[1] + UPPER * Math.sin(rad(arm[0]))];
        pts = [sh, el, [el[0] + FORE * Math.cos(rad(arm[1])), el[1] + FORE * Math.sin(rad(arm[1]))]];
      }
      capsule(Lr, pts, SLEEVE_R, COAT, 3);
      disc(Lr, pts[2], HAND_R, BODY, 4);
      return pts[2];
    }

    // The rain: streams of glyphs 3 x 3 on a pitch of 4 rows. Glyphs are this file's own marks, not any script.
    const GLYPHS = [
      ['xxx', '..x', '.x.'], ['x.x', 'xxx', '..x'], ['.x.', 'xxx', 'x.x'], ['xx.', '.x.', '.xx'], ['x..', 'xxx', 'x..'], ['..x', '.x.', 'xxx'],
      ['xxx', 'x..', 'xx.'], ['.xx', 'x.x', '.x.'], ['x.x', '.x.', 'x.x'], ['xxx', '.x.', '.x.'], ['x..', 'x.x', 'xxx'], ['.x.', '.xx', '.x.'],
    ];
    // [left col, speed (rows a row of the clock), glyphs in the stream, phase (rows), dim]
    const RAIN_COLS = [
      [1, 1, 5, 10, 0], [6, 2, 3, 60, 1], [10, 1, 6, 38, 0], [16, 2, 4, 80, 0], [21, 1, 3, 20, 1], [25, 1, 5, 71, 0],
      [31, 2, 5, 47, 0], [36, 1, 4, 5, 1], [40, 1, 6, 88, 0], [46, 2, 4, 30, 0], [51, 1, 3, 64, 1], [55, 1, 5, 52, 0],
    ];
    function paintRain(g, block, t, shift) {
      const tick = Math.floor(t / 4 + 1e-6);                       // the head glyphs change every 4 rows of fall: 24 a loop
      RAIN_COLS.forEach(([x0, v, len, ph, dim], i) => {
        const head = Math.floor((((ph + v * t) % RAIN_W) + RAIN_W) % RAIN_W + 1e-6) - 8;
        for (let j = 0; j < len; j++) {
          const gl = GLYPHS[j === 0 ? (i * 5 + tick) % GLYPHS.length : (i * 7 + j * 3) % GLYPHS.length];
          const ink = !dim && j === 0 ? HEAD : RAIN, sparse = dim || j >= len - 2;
          gl.forEach((line, dr) => [...line].forEach((ch, dc) => {
            if (ch !== 'x') return;
            const r = head - 4 * j + dr, c = (((x0 + dc + Math.round(shift)) % N) + N) % N;
            if (r < 0 || r >= FLOOR || block[r][c] || (sparse && (r + c) % 2)) return;
            g[r][c] = ink;
          }));
        }
      });
    }

    // The bullets: [row of the middle, slow frame it comes in at the right edge].
    const SHOTS = [[21, 1], [17, 3], [13, 5]];
    // A ring of rippled air, edge on: the outline of an ellipse 3 wide and 2 hh + 1 tall round (cy, cx).
    function ring(cy, cx, hh) {
      const out = [], inE = (r, c) => ((c + 0.5 - cx) / 1.5) ** 2 + ((r + 0.5 - cy) / hh) ** 2 <= 1;
      for (let r = Math.floor(cy - hh - 1); r <= Math.ceil(cy + hh + 1); r++) for (let c = Math.floor(cx - 2); c <= Math.ceil(cx + 2); c++)
        if (inE(r, c) && !(inE(r - 1, c) && inE(r + 1, c) && inE(r, c - 1) && inE(r, c + 1))) out.push([r, c]);
      return out;
    }

    // A frame. o: th the lean (degrees back), arm ([upper, fore] degrees, or {to: hand}), coat (degrees the skirt swings,
    // negative back), ping, look, blink, squint, push, glint, finger [row, col it reaches], glitch, echo, and from the
    // clocks the rain clock t, the camera's sweep shift, the slow frame count sk (the bullets) and the frame index k.
    const AUDIT = [], MASKS = [];
    function frame(o) {
      const Lr = layer(), th = o.th || 0, e = ease(th / LEAN_MAX);
      const piv = [lerp(PIVOT_UP[0], PIVOT_LOW[0], e), lerp(PIVOT_UP[1], PIVOT_LOW[1], e)];
      // Back to front: the far leg, the skirt, the near leg, the torso, the near arm.
      const leg = side => {
        capsule(Lr, bend(toPanel(piv, th, HIPS[side]), ANKLES[side], THIGH, SHIN), LEG_R, side === 'near' ? DEEP : COAT, 4);
        paintBoot(Lr, ANKLES[side]);
      };
      leg('far');
      paintCoat(Lr, piv, th, o.coat || 0, (o.coat || 0) * 0.35, lerp(FRONT_UP, FRONT_LOW, e), e);
      leg('near');
      paintTorso(Lr, piv, th, o);
      const hand = paintArm(Lr, toPanel(piv, th, SHOULDER), o.arm || [4, 12]);
      if (o.finger) for (let c = Math.round(o.finger[1]); c < Math.round(hand[1] - 1); c++) put(Lr, Math.round(o.finger[0]), c, BODY, 4);
      // Rim light on every coat edge against the night, and a crease wherever one piece of coat lies on another: the sleeve
      // on the coat or the skirt, the torso's edge on the skirt.
      const {g, p} = Lr;
      const nb = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => inside(a, b));
      const CREASE = {2: [3, 7], 7: [3]};
      const lit = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const q = p[r][c];
        if (q === 2 || q === 3 || q === 6 || q === 7) {
          if (nb(r, c).some(([a, b]) => !p[a][b])) lit.push([r, c]);
          else if (CREASE[q] && nb(r, c).some(([a, b]) => CREASE[q].includes(p[a][b]))) lit.push([r, c]);
        }
      }
      for (const [r, c] of lit) g[r][c] = DEEP;
      // The glitch split: every row holding the visor slides two cells right and the visor goes to ping.
      if (o.glitch) for (let r = 0; r < N; r++) {
        if (!g[r].some(v => v === VISOR || v === EYE)) continue;
        const row = g[r].slice(), prow = p[r].slice();
        for (let c = 0; c < N; c++) { g[r][c] = c >= 2 ? row[c - 2] : 0; p[r][c] = c >= 2 ? prow[c - 2] : 0; if (g[r][c] === VISOR) g[r][c] = PING; }
      }
      // The creature is everything so far; the cells round it stay dark (block 1), so nothing else touches its outline.
      const out = g.map(row => row.slice());
      const block = p.map((row, r) => row.map((v, c) => {
        if (v) return 2;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (inside(r + a, c + b) && p[r + a][c + b]) return 1;
        return 0;
      }));
      // The echo: in the lean and the spring up, the pose of the frame before stays behind as a dithered deep teal
      // afterimage, on cells clear of the creature and its outline.
      MASKS.push(block.map(row => row.map(v => v === 2)));
      if (o.echo) {
        const was = MASKS[MASKS.length - 2];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (was[r][c] && !block[r][c]) {
          if ((r + c) % 2 === 0) out[r][c] = DEEP;
          block[r][c] = 3;
        }
      }
      // The bullets and their rings, in slow time only, never on the creature or its outline: any cell that would have been
      // goes in the audit instead (bullet, ring, and bullet cells that would have touched the outline as near).
      const audit = {k: o.k, bullet: 0, ring: 0, near: 0, at: []};
      if (o.sk !== undefined && !o.glitch) for (const [row, s0] of SHOTS) {
        if (o.sk < s0) continue;
        const nose = 61 - BULLET_V * (o.sk - s0);
        for (let x = 59; x >= nose + RING_AGE[0]; x -= RING_GAP) {
          const age = x - nose;
          if (age > RING_AGE[1]) continue;
          for (const [r, c] of ring(row + 0.5, x + 0.5, 1.5 + (age - RING_AGE[0]) * RING_GROW)) {
            if (!inside(r, c)) continue;
            if (block[r][c] === 2) { audit.ring++; audit.at.push([r, c, g[r][c]]); continue; }
            if (block[r][c] || (age > 10 && (r + c) % 2)) continue;
            out[r][c] = PING; block[r][c] = 3;
          }
        }
        BULLET.forEach((line, dr) => [...line].forEach((ch, dc) => {
          const r = row - 1 + dr, c = nose + dc;
          if (ch !== 'b' || !inside(r, c)) return;
          if (block[r][c] === 2) { audit.bullet++; audit.at.push([r, c, g[r][c]]); return; }
          if (block[r][c] === 1) { audit.near++; return; }
          out[r][c] = BRASS; block[r][c] = 3;
        }));
      }
      AUDIT.push(audit);
      paintRain(out, block, o.t, o.shift || 0);
      for (let c = 0; c < N; c++) out[FLOOR][c] = DEEP;
      return out;
    }

    // The timeline.
    const SEQ = [];
    const S = (hold, o = {}) => SEQ.push({hold, ...o});
    // 1. Standing in the rain, normal time (the loop anchor).
    const REST = -14;                                              // the skirt's back, flared a little at rest
    S(160, {coat: REST}); S(160, {ping: true, coat: REST}); S(160, {coat: REST}); S(160, {coat: REST});
    S(160, {blink: true, coat: REST}); S(160, {coat: REST}); S(160, {look: 1, coat: REST}); S(160, {look: 1, coat: REST});
    // 2. Shots from off the right edge: time slows, the glitch split.
    S(70, {look: 1, glitch: true, slow: true, coat: REST});
    // 3. The lean, in slow time; the arm is flung up as it goes, the coat lags forward, an echo trails it.
    const LEAN = [8, 20, 34, 50, 64, 74];
    const ARM_L = [[20, 35], [50, 70], [85, 105], [125, 145], [160, 180], [180, 200]];
    const COAT_L = [-8, 2, 10, 14, 10, 2];
    LEAN.forEach((th, i) => S(230, {th, slow: true, look: 1, arm: ARM_L[i], coat: COAT_L[i], echo: i > 0}));
    // 4. The deepest lean, held while the bullets pass and the camera circles. The arm is up as they come, flinches forward
    // and low while they pass over (clear of their rings), and is flung up again once they are gone; the coat swings out
    // and round; the antenna pings at the closest pass.
    const HOLD_TH = [78, 79, 80, 80, 80, 80, 79, 79, 78, 78, 77, 76];
    const ARM_H = [[165, 185], [100, 85], [95, 80], [95, 80], [97, 82], [100, 90], [105, 100], [115, 120], [130, 145], [150, 170], [170, 190], [175, 195]];
    const COAT_H = [-12, -30, -48, -62, -70, -66, -52, -32, -10, 8, 16, 10];
    HOLD_TH.forEach((th, i) => S(260, {th, slow: true, look: 1, arm: ARM_H[i], coat: COAT_H[i], ping: i === 2}));
    // 5. Time snaps back.
    S(70, {th: 76, glitch: true, arm: [175, 195], coat: 6});
    // 6. Up in a spring, an echo trailing it, the coat lagging back.
    [[46, [120, 140], -24], [18, [50, 70], -30], [2, [14, 26], -22], [-3, [6, 14], -16]].forEach(([th, arm, coat], i) => S([110, 110, 130, 150][i], {th, arm, coat, echo: i < 3}));
    // 7. The shades: the hand to the face, one finger pushes the visor up a row, a glint runs across it, a cool squint.
    S(140, {arm: {to: [32, 45]}, coat: REST});
    S(160, {arm: {to: [25.5, 47]}, finger: [25.5, 44], coat: REST});
    S(110, {arm: {to: [24.5, 47]}, finger: [24.5, 44], push: true, glint: 9.5, coat: REST});
    S(100, {arm: {to: [24.5, 47]}, finger: [24.5, 44], push: true, glint: 12.5, squint: true, coat: REST});
    S(100, {arm: {to: [24.5, 47]}, finger: [24.5, 44], push: true, glint: 15.5, squint: true, coat: REST});
    S(130, {arm: {to: [35, 43]}, push: true, squint: true, coat: REST});
    S(150, {push: true, squint: true, ping: true, coat: REST}); S(150, {push: true, squint: true, coat: REST});
    S(150, {coat: REST}); S(150, {coat: REST});

    // The clocks: the rain falls with the holds in normal time and SLOW as fast in slow time (not at all on a glitch),
    // scaled so a loop is RAIN_W rows exactly; the camera's sweep runs from the third slow frame and resets on the snap back.
    const w = SEQ.map(f => (f.glitch ? 0 : f.slow ? f.hold * SLOW : f.hold));
    const per = RAIN_W / w.reduce((a, b) => a + b, 0);
    const ORBIT = [1, 1.5, 2, 2.5, 3, 3, 3, 3, 3, 3, 3, 2.5, 2, 1.5, 1, 1];   // cells a frame, 36 in all
    const frames = [];
    let t = 0, shift = 0, sk = -1, orbit = 0;
    SEQ.forEach((f, k) => {
      if (f.slow) sk++;
      if (f.slow && sk >= 3 && orbit < ORBIT.length) shift += ORBIT[orbit++];
      if (!f.slow) shift = 0;
      frames.push({hold: f.hold, grid: frame({...f, k, t, shift, sk: f.slow ? sk : undefined})});
      t += w[k] * per;
    });

    const anim = {
      name: 'ECHO · slow dodge', key: 'echo_slow_dodge', fwname: 'echo slow dodge', category: 'Active', size: N,
      // Big tier, like the HD cells: 42 frames of 3600 bytes (151200 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, a film moment homage with no characters in it, 60 cell lattice (8 px cells, the creature at 2x in profile as moonwalk HD b draws it): it stands facing right in falling green glyph rain wearing a long dark coat open over its teal chest with the collar turned up, pings, blinks and looks off the right edge; shots: a glitch split and time slows, the rain hanging in the air, and over six slow frames it leans back about its hips further than any body could hold, 80 degrees, a dithered echo of itself trailing it, until its teal front faces up and it hangs over ten rows of black on its bent legs while three brass bullets crawl over it trailing rings of rippled air, the nearest two rows over its head, where its antenna pings; its arm is flung up as they come, flinches low while they pass and goes up again once they are gone, and its coat swings out behind as three tails and round again while the rain sweeps sideways behind it as if the camera circled; time snaps back on a second glitch, it springs upright and pushes its visor up its face with one finger like shades, a pale glint running across the band, and squints, cool; judge whether the lean reads as a dodge rather than a fall, whether the rings read as rippled air behind slow bullets, whether the sweeping rain and the swinging coat read as a camera circling, and whether it is still this creature in a coat.',
      // 0 transparent, 1 body, 2 eyes, 3 visor, 4 ping (the antenna tip, the rings of rippled air), 5 deep teal (the coat's
      // rim light and creases, the near leg, the echo, the floor line), 6 brass (the bullets), 7 the pale rain head and the
      // visor's glint, 8 rain green, 9 the coat's near black (the sleeve, the boots, the far leg)
      palette: [...ECHO_PALETTE.slice(0, 6), '#e2b34c', '#c8ffd4', '#1f9a48', '#1e2a2e'],
      frames,
    };
    // The collision audit, one entry a frame; not enumerable, so the bench and the export never see it.
    Object.defineProperty(anim, 'audit', {value: AUDIT, enumerable: false});
    return anim;
  })();

  L.register([echoSlowDodge]);
})(typeof window !== 'undefined' ? window : globalThis);
