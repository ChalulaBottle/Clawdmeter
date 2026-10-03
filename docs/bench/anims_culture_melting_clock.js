// Culture creatures: the ECHO creature plays the set pieces everyone knows (operator, 2026-10-02: famous paintings,
// memes and pop culture for the animation list, "get crazy get creative"). Drawn from scratch in code on the ECHO
// base; the creature plays every role, and a meme lends its format only: the setting, the composition and the
// gesture, never its characters, its words or its art.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {upscale, echoPing, ECHO_PALETTE} = L;

  // ECHO · melting clock, a surrealist idea in our own drawing. The motif only, a soft watch on
  // a dead branch in a desert: the layout, the tree, the watch and the desert are drawn here from scratch, the creature
  // is the only figure, and from the painting the motif calls up only two more nods come along, the ants (kept on the
  // sand, never swarming the watch) and the amber light; nothing else. 60 cell lattice, 8 px cells on the 480 panel.
  // Why 2x and not 3x: the scene is the point. At 3x the creature is 48 rows tall and 45 cols wide with its arms, so
  // a tree and a watch big enough to read as a clock (17 cols across) have nowhere to hang, and a melt has no ground
  // to pool on; at 2x (upscale(echoPing(ping), 2): 32 rows, 30 cols) it stands on the left with its feet on row 52 and
  // the right half of the panel holds the tree and the watch. Every rest frame, and the frame after the pop, is that
  // pose cell for cell.
  //   scene     an amber sky, deep at the top and paler down to the horizon in three dithered tone bands; sand from row
  //             44 with a few light ripples; a dead tree in silhouette on the right, its trunk on its roots, a crooked
  //             twig, a broken stub and one long branch reaching left over the sand.
  //   watch     a pocket watch folded over the branch: a sliver of its bronze bezel bends back over it with the crown
  //             and the bow on top; under the fold the dial hangs round, then droops below its middle, narrowing and
  //             drifting toward the creature into a drip. The bezel melts off the lower half, so the drip is all face.
  //             Twelve ticks, the quarters two cells long (the six three, from the sag); the hour hand at three and the minute hand hanging at six,
  //             an L that reads as clock hands from across the room, both drawn along their own path through the drape,
  //             so the one in the droop bends with it. The bezel is bronze, not amber, so the round of the dial holds
  //             against the amber sky at a distance.
  //   drip      a drop swells on the tip all through the loop, the watch stretching a row with it; it stretches on a
  //             neck, lets go, falls, splats on the sand (a splash for a frame) and the watch springs back a row.
  //   ants      four ants, two cells each, walk a closed trail between the splat and the roots, a cell a frame.
  //   glance    the creature looks across at the splat with an antenna ping.
  //   melt      nine steps: the head and the arms slide down whole (the visor straight, the shoulders and the arms
  //             further), the rows below squeeze into what is left, the body runs down between the legs in lobes and
  //             off each hand in a drop on a neck, a puddle spreads round the feet, the antenna wilts over toward the
  //             watch and the eyes go sleepy over a smile; the hour hand sags with it, from three round toward five, so
  //             at full melt both hands hang.
  //   melted    it settles with a squash, lies there content, glances at the watch.
  //   pop       it squeezes its eyes shut, springs up through half height, stretches tall with a ping as the hour hand
  //             springs back past three, squashes, lands as itself with a ping and blinks; the loop opens on the rest.
  // Loop: 28 frames, 9.9 s; the drop's swell spans the whole loop, and the ants step a cell a frame with 28 a whole
  // number of their spacings, so the last frame runs into the first without a seam.
  // Palette: 0..5 the ECHO palette unchanged (0 is also the dark rim round the creature; 2 also the tree, the outlines
  // of the watch and its drops, the ticks, the hands, the ants and the smile; 5 also the puddle's near half); 6 deep
  // amber (the upper sky); 7 pale gold (the lower sky, the ripples); 8 sand (also the bronze bezel and crown); 9 cream
  // (the dial, the drops, the splat). Index 6 is not ping here, so nothing in it goes through echoGlitch. Big tier: 28 frames of
  // 3600 bytes (100800 bytes) ship only on boards built with SPLASH_BIG. One closure, so echoMeltingClock is the only
  // name it adds; registered at the end of this file.
  const echoMeltingClock = (() => {
    const N = 60, K = 2;                                           // lattice; the 20 cell pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, FEET = 5, SKY = 6, GLOW = 7, SAND = 8, CREAM = 9;
    // Constants: 60 cells of 8 px; the creature at 2x, its frame 19 rows down and 4 cols left (feet on row 52, cols 2..31);
    // horizon row 44; rim to row 46; melt 9 steps, slide 9 rows at the visor, 10.5 at the shoulders, 12 and 13 at the
    // arms, rows below 38 squeezed; antenna wilt 150 degrees; dial 17 across round col 41.5, fold row 20.5, droop 7 rows,
    // tip drift 2.5 cols; hour hand three, sag 55 degrees; ants 4 of 2 cells, 7 apart on a 28 cell trail; loop 9.9 s.
    const OY = 19, OX = -4;                                        // the family's 2x frame on the panel: its content on rows 21..52, cols 2..31
    const col = c => c + OX;                                       // a col of the 2x frame, on the panel
    const G = 52;                                                  // the feet's last row; the tree stands on it too
    const HORIZON = 44;                                            // the first sand row; rows 0..43 are sky
    const RIM_TO = 47;                                             // the dark rim runs down to the legs' first row; the legs stand on bare sand
    const XB = col(21);                                            // the body's middle (2x cols 10..31): the squash axis and the puddle's middle
    const R1 = 38;                                                 // the melt: rows down to here slide whole, the rows below squeeze
    // Rows each 2x cell col slides at full melt, left arm to right arm: one value across the whole visor, so the band
    // sinks straight and never breaks, more at the body's outer cols (the shoulders round off), most at the arms.
    const SLIDE = [13, 12, 10.5, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10.5, 12, 13];
    const GAPS = [[col(12), col(15)], [col(18), col(23)], [col(26), col(29)]];   // between the legs
    const HANDS_AT = [[col(6), col(7)], [col(34), col(34)]];       // each hand's left col, and the col its drip hangs from
    const LOBE = 14, HAND_DRIP = 10, HAND_DRIP_MAX = 5;            // rows of drip a full melt would run: between the legs, off the hands
    const ANT_X = col(31), WILT = 150;                             // the antenna's axis (2x cols 30..31); degrees it bends over at full melt
    const DEEP_TO = 9, BAND = 6, GLOW_FROM = DEEP_TO + 1 + 3 * BAND;   // deep rows 0..9, three tone bands of 6, glow 28..43
    const XC = 41.5, YF = 20.5;                                    // the dial's axis col; the fold where it lies over the branch
    const RW = 8.5;                                                // the dial's radius in cells
    const VF = -0.72, HTOP = 1.6;                                  // the fold as a dial height, and the rows the sliver above it shows
    const V0 = 0.2, SAG = 7, NAR = 0.55, BEND = -2.5;              // below V0 the dial droops: extra rows, narrowing, the tip's drift (to the left)
    const BEZEL = 0.82, BEZEL_TO = 0.55;                           // the bezel: outside this radius, above this height (it melts off below)
    const HANDS = [[90, 0.42, 0.8], [180, 0.7, 0.8]];              // [degrees from twelve, length, half width]: hour at three, minute hanging at six
    const HOUR_SAG = 55;                                           // degrees the hour hand sags toward six as the creature melts (it springs back on the pop)
    const ANT_L = 38, AD = 7, NA = 4;                              // the ants' trail from col 38 (by the splat) to the roots; their spacing; how many

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const copy = g => g.map(row => row.slice());
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    // Sprites are rows of letters: k dark, c cream, b bronze (the sand); a dot leaves the cell alone.
    const INK = {k: EYE, c: CREAM, b: SAND};
    const stamp = (g, art, r0, c0) => { art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(g, r0 + dr, c0 + dc, INK[ch]); })); return g; };
    // Distance from (y, x) to the segment p q, and how far along it the nearest point lies (0 at p, 1 at q).
    const near = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return [Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx), t];
    };
    // A cell beside a mask (four neighbours), for outlines.
    const edge = (m, r, c) => [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => inside(r + a, c + b) && m[r + a][c + b]);

    // The scene: the sky in three tone bands of pale gold cells in a quarter, a half and three quarters of the cells
    // (staggered dots, a checker, the dots inverted), so it pales in steps toward the horizon; the sand, its ripples;
    // the tree, every limb a tapered stroke. Drawn once.
    const TONES = [(r, c) => (c + 2 * (r % 2)) % 4 === 0, (r, c) => (r + c) % 2 === 0, (r, c) => (c + 2 * (r % 2)) % 4 !== 0];
    const skyCell = (r, c) => (r <= DEEP_TO ? SKY : r >= GLOW_FROM ? GLOW : TONES[Math.floor((r - DEEP_TO - 1) / BAND)](r, c) ? GLOW : SKY);
    const RIPPLES = [[45, 56, 3], [45, 47, 2], [46, 34, 3], [47, 52, 2], [49, 44, 3], [56, 52, 5], [57, 8, 4], [58, 22, 5], [57, 40, 3]];   // [row, first col, length]
    const TREE = [                                                 // [from, to, radius at from, radius at to], points [row, col]
      [[53.0, 56.5], [45.0, 55.9], 2.1, 1.7],                      // the trunk, from the roots up
      [[45.0, 55.9], [36.0, 56.9], 1.7, 1.35],
      [[36.0, 56.9], [27.5, 55.7], 1.35, 1.1],
      [[27.5, 55.7], [21.8, 53.9], 1.1, 0.95],
      [[52.8, 56.5], [53.2, 60.9], 1.0, 0.5],                      // the roots
      [[52.8, 56.5], [53.2, 51.9], 1.0, 0.5],
      [[21.8, 53.9], [20.6, 47.5], 0.95, 0.85],                    // the branch the watch lies over, out to the left
      [[20.6, 47.5], [20.4, 36.0], 0.85, 0.75],
      [[20.4, 36.0], [21.4, 31.5], 0.75, 0.5],
      [[21.8, 53.9], [14.5, 56.3], 0.85, 0.6],                     // a crooked twig up from the fork
      [[14.5, 56.3], [9.0, 53.7], 0.6, 0.45],
      [[33.0, 56.7], [29.0, 60.7], 0.7, 0.45],                     // a broken stub on the trunk
    ];
    const SCENE = (() => {
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g[r][c] = r < HORIZON ? skyCell(r, c) : SAND;
      for (const [r, c0, n] of RIPPLES) for (let c = c0; c < c0 + n; c++) put(g, r, c, GLOW);
      for (const [p, q, r0, r1] of TREE) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const [d, t] = near(r + 0.5, c + 0.5, p, q);
        if (d <= r0 + (r1 - r0) * t) g[r][c] = EYE;
      }
      return g;
    })();

    // The watch.
    // The dial: a point (u, v) of the unit disc (v down) on the panel. Over the fold a sliver bends back over the branch;
    // under it the dial hangs, round down to V0 and drooping below it, sag extra rows at the bottom, narrowing to a tip.
    const droop = v => Math.max(0, (v - V0) / (1 - V0));
    const hangY = (v, sag) => YF + RW * (v - VF) + sag * droop(v) ** 2;
    function dial(u, v, sag) {
      if (v < VF) return [YF - (VF - v) / (1 + VF) * HTOP, XC + u * RW];
      const q = droop(v);
      return [hangY(v, sag), XC + u * RW * (1 - NAR * q ** 1.3) + BEND * q * q];
    }
    // And back: the dial point under the panel point (y, x), or null off the dial (bisection: hangY rises with v).
    function undial(y, x, sag) {
      let u, v;
      if (y < YF) {
        const t = (YF - y) / HTOP;
        if (t > 1) return null;
        v = VF - t * (1 + VF); u = (x - XC) / RW;
      } else {
        if (y > hangY(1, sag)) return null;
        let lo = VF, hi = 1;
        for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (hangY(mid, sag) < y) lo = mid; else hi = mid; }
        v = (lo + hi) / 2;
        const q = droop(v);
        u = (x - XC - BEND * q * q) / (RW * (1 - NAR * q ** 1.3));
      }
      return u * u + v * v <= 1 ? [u, v] : null;
    }
    // The drop on the tip, stage by stage: [its middle below the tip, its radius, the neck's width]; stage 0 is just
    // after one lets go. STRETCH is the rows the watch hangs longer (or shorter, springing back) at each stage.
    const STAGES = [null, [0.6, 0.9, 2], [1.3, 1.2, 2], [2.3, 1.6, 1.2], [3.4, 1.6, 0.8]];
    const STRETCH = [-1, 0, 0, 1, 1];
    const CROWN = ['.kkk.', 'k...k', '.kkk.', '.kbk.', '.kbk.'];   // the bow over the winding crown
    const cellOf = ([y, x]) => [Math.floor(y), Math.floor(x)];
    // The watch onto g: the dial (bezel and face) and the drop as one shape outlined in dark, then the ticks, the hands
    // (the hour hand at hour degrees), the crown on top.
    function watch(g, stage, hour) {
      const sag = SAG + (typeof stage === 'number' ? STRETCH[stage] : -1), [tipY, tipX] = dial(0, 1, sag);
      const m = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const p = undial(r + 0.5, c + 0.5, sag);
        if (p) m[r][c] = Math.hypot(p[0], p[1]) > BEZEL && p[1] < BEZEL_TO ? SAND : CREAM;
      }
      if (typeof stage === 'number' && STAGES[stage]) {
        const [hb, rb, wn] = STAGES[stage];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const y = r + 0.5, x = c + 0.5;
          if (!m[r][c] && (Math.hypot(y - tipY - hb, x - tipX) <= rb || (Math.abs(x - tipX) <= wn / 2 && y >= tipY - 1 && y <= tipY + hb))) m[r][c] = CREAM;
        }
      }
      const out = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) out[r][c] = m[r][c] || (edge(m, r, c) ? EYE : 0);
      for (let k = 0; k < 12; k++) {                               // the ticks: the quarters three cells long, the hours one
        const a = k * Math.PI / 6, rs = k % 3 ? [0.7] : [0.56, 0.64, 0.72];
        for (const q of rs) { const [r, c] = cellOf(dial(q * Math.sin(a), -q * Math.cos(a), sag)); put(out, r, c, EYE); }
      }
      // The hands: a stroke round the hand's own path through the drape, so a hand in the droop bends with it.
      HANDS.forEach(([deg0, len, w], k) => {
        const a = (k ? deg0 : hour) * Math.PI / 180, pts = [];
        for (let q = 0; q <= len + 1e-9; q += len / 12) pts.push(dial(q * Math.sin(a), -q * Math.cos(a), sag));
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          for (let i = 0; i + 1 < pts.length; i++) if (near(r + 0.5, c + 0.5, pts[i], pts[i + 1])[0] <= w) { out[r][c] = EYE; break; }
        }
      });
      let top = 0; while (top < N && !m[top].some(Boolean)) top++;
      stamp(out, CROWN, top - CROWN.length, Math.floor(XC) - 2);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (out[r][c]) g[r][c] = out[r][c];
      return g;
    }
    // A drop in the air, outlined, and the splat on the sand (a splash for the frame a drop lands).
    const DROP_X = XC + BEND;
    function fallingDrop(g, yd) {
      const m = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (Math.hypot(r + 0.5 - yd, c + 0.5 - DROP_X) <= 1.0 || (r === Math.floor(yd) - 2 && c === Math.floor(DROP_X))) m[r][c] = CREAM;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (m[r][c]) g[r][c] = CREAM; else if (edge(m, r, c)) g[r][c] = EYE;
      return g;
    }
    const SPLAT = ['..cccc..', '.cccccc.'];
    const SPLASH = ['c......c', '..cccc..', 'cccccccc'];
    const splat = (g, big) => (big ? stamp(g, SPLASH, G - 2, Math.floor(DROP_X) - 4) : stamp(g, SPLAT, G - 1, Math.floor(DROP_X) - 4));

    // The ants: a closed trail between the splat and the roots, out along row 54 toward the splat and back along row
    // 53. NA ants AD cells apart, a cell a frame, each two cells long (a head and a body); the loop's frame count is a
    // whole number of spacings, so they end where they began.
    const P = NA * AD, RUN = P / 2;
    const trail = p => { p = ((p % P) + P) % P; return p < RUN ? [54, ANT_L + RUN - 1 - p] : [53, ANT_L + (p - RUN)]; };
    function ants(g, f) {
      for (let i = 0; i < NA; i++) for (const back of [0, 1]) { const [r, c] = trail(i * AD + f - back); put(g, r, c, EYE); }
      return g;
    }

    // The creature.
    // The family's eyes on the 20 cell pose (anims.js keeps these two private, so they are restated here): a cell
    // toward dir, and the family's blink, the upper eye cells gone to visor.
    function eyesToward(f, dir) {
      const b = f.map(row => row.slice());
      for (const c of [7, 13]) for (const r of [6, 7]) b[r][c] = VISOR;
      for (const c of [7 + dir, 13 + dir]) for (const r of [6, 7]) b[r][c] = EYE;
      return b;
    }
    const lidded = f => { const b = f.map(row => row.slice()); b[6][7] = VISOR; b[6][13] = VISOR; return b; };
    const SMILE = ['k....k', '.kkkk.'];
    // The pose on the panel: the family pose at 2x with its eyes (open, a cell right, half lidded or shut), a smile, and
    // while it melts the drips.
    function pose(o) {
      let f = echoPing(!!o.ping);
      if (o.eyes === 'right') f = eyesToward(f, 1);
      if (o.eyes === 'half' || o.eyes === 'shut') f = lidded(f);
      const src = upscale(f, K), g = blank();
      for (let r = 0; r < src.length; r++) for (let c = 0; c < src.length; c++) if (src[r][c]) put(g, r + OY, c + OX, src[r][c]);
      if (o.eyes === 'shut') for (const c0 of [col(14), col(26)]) {            // shut: the visor over the eye, a line under it
        for (let r = 31; r <= 34; r++) for (let c = c0; c < c0 + 2; c++) g[r][c] = VISOR;
        for (let c = c0 - 1; c <= c0 + 2; c++) put(g, 34, c, EYE);
      }
      if (o.smile) stamp(g, SMILE, 36, XB - 3);
      const m = o.m || 0;
      if (m > 0 && !o.dry) {
        // The body runs down between the legs: a lobe in each gap from the torso's last row (46), deepest in the middle.
        for (const [c0, c1] of GAPS) for (let c = c0; c <= c1; c++) {
          const len = Math.min(6, Math.round(m * LOBE * Math.sin(Math.PI * (c - c0 + 0.5) / (c1 - c0 + 1))));
          for (let r = 47; r < 47 + len; r++) g[r][c] = BODY;
        }
        // And off each hand a drop: a neck one cell across, then the drop, two across and two tall, the neck longer as
        // it melts.
        const len = Math.min(HAND_DRIP_MAX, Math.round(m * HAND_DRIP));
        for (const [c0, inner] of HANDS_AT) {
          for (let r = 41; r < 41 + len; r++) put(g, r, inner, BODY);
          for (let r = 41 + len; r < 43 + len; r++) for (const c of [c0, c0 + 1]) put(g, r, c, BODY);
        }
      }
      return g;
    }
    // Rows the 2x cell col holding col c slides at melt m (whole rows, so every 2x cell moves in one piece).
    const slide = (m, c) => {
      const p = Math.max(0, Math.min(SLIDE.length - 1, Math.floor((c - col(6)) / 2)));
      return Math.min(G - 1 - R1, Math.round(m * SLIDE[p]));
    };
    // The melt and the squash, read backward from every panel cell: undo the squash about the feet and the body's
    // middle, then the slide (rows down to R1 move whole), then the squeeze of the rows below it into what is left.
    function melt(src, m, sy, sx) {
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const ys = (G + 1) - (G + 1 - (r + 0.5)) / sy, xs = XB + (c + 0.5 - XB) / sx;
        const rr = Math.floor(ys), cc = Math.floor(xs);
        if (cc < 0 || cc >= N || rr > G || rr < 0) continue;
        const D = slide(m, cc);
        const sr = rr <= R1 + D ? rr - D : Math.round(R1 + (rr - R1 - D) / (G - R1 - D) * (G - R1));
        if (sr >= 0 && sr < N && src[sr][cc]) g[r][c] = src[sr][cc];
      }
      return g;
    }
    // The antenna, bent over to the right by WILT times m degrees, more toward its tip: a stalk two cells across and six
    // long from the head's top, its last two cells the tip.
    function antenna(g, m, lit) {
      let top = 0; while (top < N && !g[top][ANT_X - 1] && !g[top][ANT_X]) top++;
      const th = WILT * m * Math.PI / 180, STEPS = 24, LEN = 6, pts = [[top, ANT_X]];
      for (let i = 1; i <= STEPS; i++) { const a = th * Math.pow(i / STEPS, 1.5), [y, x] = pts[i - 1]; pts.push([y - LEN / STEPS * Math.cos(a), x + LEN / STEPS * Math.sin(a)]); }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (g[r][c]) continue;
        let best = Infinity, at = 0;
        for (let i = 0; i < STEPS; i++) { const [d, t] = near(r + 0.5, c + 0.5, pts[i], pts[i + 1]); if (d < best) { best = d; at = (i + t) / STEPS * LEN; } }
        if (best <= 0.7) g[r][c] = at >= LEN - 2 && lit ? PING : BODY;
      }
    }
    // The puddle round its feet: a flat ellipse, wider and deeper as it melts, its near half in the feet teal.
    function puddle(g, m) {
      const hw = 10 + 7 * m, hh = 0.5 + 1.7 * m, cy = G + 0.5;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const dy = (r + 0.5 - cy) / hh, dx = (c + 0.5 - XB) / hw;
        if (dx * dx + dy * dy <= 1) g[r][c] = r + 0.5 > cy ? FEET : BODY;
      }
    }
    // The creature for frame o: m the melt (0 to 1), sy and sx the squash, eyes, ping, smile, dry (no drips).
    function creature(o) {
      const m = o.m || 0, sy = o.sy || 1, sx = o.sx || 1;
      const src = pose(o);
      if (m > 0) for (let r = 21; r <= 26; r++) for (const c of [ANT_X - 1, ANT_X]) src[r][c] = 0;   // the antenna is drawn bent
      const body = m === 0 && sy === 1 && sx === 1 ? src : melt(src, m, sy, sx);
      const g = blank();
      if (m > 0.05) puddle(g, m);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (body[r][c]) g[r][c] = body[r][c];
      if (m > 0) antenna(g, m, !!o.ping);
      // A cell the squeeze left empty with body on all four sides is a hole, not sand showing through: fill it.
      if (m > 0 || sy !== 1) for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
        if (!g[r][c] && g[r - 1][c] && g[r + 1][c] && g[r][c - 1] && g[r][c + 1]) g[r][c] = BODY;
      }
      return g;
    }
    // The creature over the scene: a dark rim round it down to RIM_TO, then the creature.
    function over(g, cr) {
      for (let r = 0; r < RIM_TO; r++) for (let c = 0; c < N; c++) {
        if (cr[r][c]) continue;
        let rim = false;
        for (let a = -1; a <= 1 && !rim; a++) for (let b = -1; b <= 1; b++) if (inside(r + a, c + b) && cr[r + a][c + b]) { rim = true; break; }
        if (rim) g[r][c] = 0;
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (cr[r][c]) g[r][c] = cr[r][c];
      return g;
    }

    // The frames: F(hold, o), o as for creature, plus drop (a stage, 'fall1', 'fall2' or 'land') and hour (the hour
    // hand's degrees; left out it sags with the melt).
    const specs = [];
    const F = (hold, o = {}) => specs.push({hold, o});
    // 1. Rest, the loop anchor: the drop swells on the tip, stretches on a neck, lets go, falls and splats; the
    // creature looks across at it with a ping.
    F(1200, {drop: 3});
    F(450, {drop: 4});
    F(110, {drop: 'fall1'});
    F(110, {drop: 'fall2'});
    F(180, {drop: 'land'});
    F(160, {eyes: 'right', ping: true, drop: 0});
    F(900, {eyes: 'right', drop: 0});
    // 2. The melt, nine steps: still looking, then at us, then sleepy over a smile; a new drop starts to swell.
    const MELT = [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.89];
    MELT.forEach((m, i) => F(i ? 380 : 320, {m, eyes: i < 2 ? 'right' : i < 5 ? 'open' : 'half', smile: m >= 0.58, drop: i < 2 ? 0 : i < 6 ? 1 : 2}));
    // 3. Melted: it settles with a squash, lies there content, glances at the watch.
    F(160, {m: 1, sy: 0.94, sx: 1.05, eyes: 'half', smile: true, drop: 2});
    F(1100, {m: 1, eyes: 'half', smile: true, drop: 2});
    F(600, {m: 1, eyes: 'right', smile: true, drop: 3});
    // 4. The pop: a squeeze, up through half height, tall with a ping (the hour hand springs back past three), a
    // squash, itself again with a ping.
    F(120, {m: 1, sy: 0.9, sx: 1.05, eyes: 'shut', smile: true, drop: 3});
    F(90, {m: 0.4, dry: true, eyes: 'open', drop: 3});
    F(90, {sy: 1.15, sx: 0.88, ping: true, drop: 3, hour: 78});
    F(90, {sy: 0.92, sx: 1.06, ping: true, drop: 3, hour: 94});
    F(150, {ping: true, drop: 3});
    // 5. The blink, then rest (it loops to frame 0).
    F(70, {eyes: 'half', drop: 3}); F(110, {eyes: 'shut', drop: 3}); F(70, {eyes: 'half', drop: 3}); F(800, {drop: 3});
    const NF = specs.length;
    if (NF % AD) throw new Error(`melting clock: ${NF} frames do not step the ants back to the start (spacing ${AD})`);

    const frames = specs.map(({hold, o}, f) => {
      const g = copy(SCENE);
      splat(g, o.drop === 'land');
      ants(g, f);
      watch(g, typeof o.drop === 'number' ? o.drop : 0, o.hour !== undefined ? o.hour : HANDS[0][0] + HOUR_SAG * (o.m || 0));
      if (o.drop === 'fall1') fallingDrop(g, 45.5);
      if (o.drop === 'fall2') fallingDrop(g, 49.5);
      over(g, creature(o));
      return {hold, grid: g};
    });

    return {
      name: 'ECHO · melting clock', key: 'echo_melting_clock', fwname: 'echo melting clock', category: 'Idle', size: N,
      // Big tier, like the other HD cells: 28 frames of 3600 bytes (100800 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, a surrealist idea in our own drawing, 60 cell lattice (8 px cells, the creature at 2x so the desert, the tree and the watch have room): under an amber sky a pocket watch lies folded over the branch of a dead tree, its dial round at the top in a bronze bezel with twelve ticks, the hour hand at three and the minute hand hanging at six, drooping below into a drip, and a drop swells on its tip, stretches on a neck, lets go and splats on the sand where a few ants come and go; the creature beside it looks across at the splat with an antenna ping and then melts slowly too, nine steps of its head sinking with the visor straight, its shoulders and arms sagging, its body running down between its legs and off its hands into a spreading puddle, its antenna wilting over toward the watch and its eyes going sleepy over a smile while the hour hand sags with it from three toward five until both hands hang; it settles with a squash, lies there content, glances at the watch, then squeezes its eyes shut, springs back up tall with a ping as the hour hand springs back, squashes, lands as itself and blinks; judge whether the watch reads as a clock folded over the branch, whether the melt reads as melting rather than sinking, and whether the smiling puddle is still this creature.',
      // 0 transparent (also the rim round the creature), 1 body, 2 eyes (also the tree, the watch's outline, ticks and
      // hands, the drops' outlines, the ants, the smile), 3 visor, 4 ping (the antenna tip), 5 feet (also the puddle's
      // near half), 6 deep amber (the upper sky), 7 pale gold (the lower sky, the ripples), 8 sand (also the bronze bezel
      // and crown), 9 cream (the dial, the drops, the splat)
      palette: [...ECHO_PALETTE.slice(0, 6), '#d47a26', '#f5c45e', '#a8703c', '#fff1d6'],
      frames,
    };
  })();

  L.register([echoMeltingClock]);
})(typeof window !== 'undefined' ? window : globalThis);
