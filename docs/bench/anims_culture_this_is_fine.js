// Culture creatures: the ECHO creature plays the set pieces everyone knows (operator, 2026-10-02: famous paintings,
// memes and pop culture for the animation list, "get crazy get creative"). Drawn from scratch in code on the ECHO
// base; the creature plays every role, and a meme lends its format only: the setting, the composition and the
// gesture, never its characters or its art, and no words in the picture (the name is the meme's own caption phrase).
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {upscale, echoPing, ECHO_PALETTE} = L;

  // ECHO · this is fine: the meme format of a figure sitting calm at a little table with its
  // coffee while the room burns round it. The format only: the ECHO creature plays the part, it wears nothing, and
  // its speech bubble holds three dots, no words. 60 cell lattice, 8 px cells on the 480 panel, built the way
  // mushroom HD is built: the body is the family's 20 cell pose repeated exactly 3 times across and down, so the
  // silhouette, the visor, the antenna and the arms are the family's own, moved 3 cells left and 4 down so it sits,
  // its legs cut to 6 rows (sitting foreshortens them) and hanging in front of the chair's seat edge.
  //   room      a dark room lit by its own fire: flame tongues in three nested shells (orange outside, gold inside,
  //             a cream heart in the big wall flames) up both walls, and five behind the creature that burn low
  //             under the chair at rest and stand over its head in the flare, a ragged skyline; round smoke
  //             billows rolling right along the ceiling; embers rising in the gaps. The room takes only empty cells
  //             off a one cell rim round the creature and its props, so a dark outline always holds the silhouette.
  //   props     a chair (its seat edge and front legs show), a little side table at its right and a cream mug on
  //             it, the right hand on the handle.
  //   rest      the family's slit eyes, mushroom HD's calm smile under the visor, a blink.
  //   sip       the elbow stays out (the family's arm stub is the upper arm) and a forearm, creased in the feet
  //             teal where it lies over the body, brings the mug to the mouth, the eyes shut happy; the fist hides
  //             the handle while it turns, from the hand's side on the table to the hand's side at the mouth.
  //   flare     the flames climb the walls and rise over its head, the smoke swells and comes down with loose
  //             puffs under it; the eyes glance left at the fire and right at the mug, an antenna ping.
  //   bubble    a speech bubble over its left shoulder pops in and fills with three dots, one at a time, the eyes
  //             shut happy: all fine.
  //   fog       the smoke gets into the visor from the top down in four steps until the band is soot with a ghost
  //             of the eyes through it; the smile never moves.
  //   wipe      the antenna pings and a ping bar sweeps the band left to right, the visor clean behind it.
  //   settle    the flames sink back down the walls and the smoke lifts; the loop opens on the rest again.
  // Loop: 43 frames, 7.5 s, every hold 120 to 200 ms but the 80 ms blink, so the fire never stands still. Every
  // flicker, sway, drift and ember runs a whole number of cycles a loop on the frame index, and the flare's envelope
  // eases back to 0 by the last frame, so it runs into the first without a seam.
  // Palette: 0..5 the ECHO palette unchanged (2 is also the smile, the coffee, the dots and the table's shadow; 4 also
  // the wiper; 5 also the arm's crease); 6 cream (the mug, the bubble, the flames' hearts, embers); 7 gold (flames,
  // embers); 8 flame orange (every flame's outer shell); 9 soot (the smoke, the fog in the visor, the chair, the
  // table and the floor line). Index 6 is not ping here, so nothing in it goes through echoGlitch. Big tier: 43
  // frames of 3600 cells are 154800 bytes of firmware table, so it ships only on boards built with SPLASH_BIG. One
  // closure, so echoThisIsFine is the only name it adds; registered at the end of this file.
  const echoThisIsFine = (() => {
    const N = 60, K = 3;                                           // lattice; a 20 cell pose repeated K times
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, FEET = 5, CREAM = 6, GOLD = 7, FLAME = 8, SOOT = 9;
    // Constants the cell is judged on.
    const OX = -3, OY = 4;                                         // the family's 3x frame, 3 cells left and 4 down
    const LEG_CUT = 48;                                            // family rows 48..50 dropped: the shins hang 6 rows
    const FLOOR = 57;                                              // the floor line; chair, table and flames stand on 56
    const V = {top: 18 + OY, bot: 23 + OY, l: 18 + OX, r: 44 + OX};   // the visor band on the panel
    const EYE_C = [21 + OX, 39 + OX];                              // each slit's left col, 3 wide
    const MOUTH = [31 + OY, 31 + OX];                              // the smile's top row and centre col
    const TAU = 2 * Math.PI;

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const copy = g => g.map(row => row.slice());
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    // Sprites are rows of letters: k dark, w cream; a dot leaves the cell alone.
    const INK = {k: EYE, w: CREAM};
    const stamp = (g, art, r0, c0) => { art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(g, r0 + dr, c0 + dc, INK[ch]); })); return g; };
    // Distance from (y, x) to the segment p q.
    const seg = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };

    // The creature, seated: the family pose at 3x moved OX across and OY down, the legs cut short.
    function seated(ping = false) {
      const src = upscale(echoPing(ping), K), g = blank();
      for (let r = 0; r < LEG_CUT; r++) for (let c = 0; c < N; c++) if (src[r][c]) put(g, r + OY, c + OX, src[r][c]);
      return g;
    }
    // Faces: the band plain; the family's slits slid dx; a blink (two rows of each slit); mushroom HD's happy arches.
    const band = g => { for (let r = V.top; r <= V.bot; r++) for (let c = V.l; c <= V.r; c++) g[r][c] = VISOR; return g; };
    const slits = (g, dx = 0) => { band(g); for (let r = V.top; r <= V.bot; r++) for (const c0 of EYE_C) for (let c = c0; c < c0 + 3; c++) g[r][c + dx] = EYE; return g; };
    const blinked = g => { band(g); for (let r = V.bot - 1; r <= V.bot; r++) for (const c0 of EYE_C) for (let c = c0; c < c0 + 3; c++) g[r][c] = EYE; return g; };
    const ARCH = ['..kkkkk..', '.kk...kk.', 'kk.....kk'];
    const arches = g => { band(g); for (const c0 of EYE_C) stamp(g, ARCH, V.top + 1, c0 - 3); return g; };
    const SMILE = ['k.......k', '.kkkkkkk.'];
    const smile = g => stamp(g, SMILE, MOUTH[0], MOUTH[1] - 4);
    // The fog: the smoke gets into the band from the top down, the front a dithered row; the eyes take only half the
    // dither's cells, so a ghost of them always shows. level 0..1; cols left of clearTo are wiped clean.
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    function fog(g, level, clearTo = -1) {
      const H = V.bot - V.top + 1;
      for (let r = V.top; r <= V.bot; r++) for (let c = Math.max(V.l, clearTo); c <= V.r; c++) {
        const t = (BAYER[r % 4][c % 4] + 0.5) / 16;
        if (level * (H + 1) - (r - V.top) - 1.5 * t <= 0) continue;
        if (g[r][c] === VISOR || (g[r][c] === EYE && t < 0.5)) g[r][c] = SOOT;
      }
      return g;
    }
    // The wiper: a ping bar two cells wide down the band, its left edge on col c.
    const wiper = (g, c) => { for (let r = V.top; r <= V.bot; r++) { put(g, r, c, PING); put(g, r, c + 1, PING); } return g; };

    // The props. The chair stands behind the creature: its seat edge shows between the hanging shins, its front
    // legs at the seat's ends.
    function chair(g) {
      for (let r = 46; r <= 47; r++) for (let c = 9; c <= 47; c++) put(g, r, c, SOOT);
      for (let r = 48; r < FLOOR; r++) for (const c of [9, 10, 46, 47]) put(g, r, c, SOOT);
      return g;
    }
    // The little side table at its right: a top running off the panel's edge, its shadow, a pedestal and a foot.
    function table(g) {
      for (let r = 41; r <= 42; r++) for (let c = 46; c < N; c++) put(g, r, c, SOOT);
      for (let c = 47; c < N; c++) put(g, 43, c, EYE);
      for (let r = 44; r <= 54; r++) for (let c = 51; c <= 53; c++) put(g, r, c, SOOT);
      for (let c = 49; c <= 55; c++) put(g, 55, c, SOOT);
      for (let c = 48; c <= 56; c++) put(g, 56, c, SOOT);
      return g;
    }
    // The mug, 7 across and 9 tall with a coffee row under the rim: on the table its handle is on the left, under the
    // right hand; at the mouth (MUG_R) on the right, under the fist; on the way up (MUG_B) the fist hides it.
    const MUG = ['...wwwwwww', '...wkkkkkw', '.wwwwwwwww', 'w..wwwwwww', 'w..wwwwwww', 'w..wwwwwww', '.wwwwwwwww', '...wwwwwww', '....wwwww.'];
    const MUG_R = MUG.map(l => [...l].reverse().join(''));
    const MUG_B = MUG.map(l => l.slice(3));
    const HAND = {r: [34, 36], c: [48, 50]};                       // the family's right hand on the panel
    // The sip: the family's stub stays as the upper arm, elbow out, and its hand comes off; a forearm 5 across runs
    // from the stub's end to a fist, a one cell crease in the feet teal round it where it lies over the body.
    const ELBOW = [31, 48], FORE_R = 2.4, FIST_R = 2.8;
    function forearm(g, fist) {
      const under = copy(g);
      for (let r = HAND.r[0]; r <= HAND.r[1]; r++) for (let c = HAND.c[0]; c <= HAND.c[1]; c++) if (g[r][c] === BODY) g[r][c] = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const y = r + 0.5, x = c + 0.5;
        const d = Math.min(seg(y, x, ELBOW, fist) - FORE_R, Math.hypot(y - fist[0], x - fist[1]) - FIST_R);
        if (d <= 0) g[r][c] = BODY;
        else if (d <= 1 && under[r][c] && under[r][c] !== EYE && under[r][c] !== CREAM) g[r][c] = FEET;
      }
      return g;
    }
    // The speech bubble over its left shoulder, its tail toward the head, holding 0 to 3 dots.
    const BUBBLE = [
      '...wwwwwwwwwwwwwww...', '.wwwwwwwwwwwwwwwwwww.', 'wwwwwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwwwwww', '.wwwwwwwwwwwwwwwwwww.', '...wwwwwwwwwwwwwww...', '..............wwww...',
      '...............www...', '................ww...'];
    const BUB = [2, 2];                                            // its top left; the dots are 3 x 3, 5 apart
    function bubble(g, dots) {
      stamp(g, BUBBLE, BUB[0], BUB[1]);
      for (let k = 0; k < dots; k++) for (let r = 3; r <= 5; r++) for (let c = 0; c < 3; c++) put(g, BUB[0] + r, BUB[1] + 4 + 5 * k + c, EYE);
      return g;
    }

    // The room.
    let NF = 1;                                                    // frames a loop, set once the frames are listed
    // Flame tongues: [root col, height at rest, extra height at the flare's top, half width, sway, flicker cycles a
    // loop, sway cycles a loop, phase, the gold shell's share of the height]; whole cycles a loop, so the last frame
    // runs into the first.
    const TONGUES = [
      [2.0, 43, 14, 6.5, 2.5, 9, 7, 0.0, 0.66],                    // the left wall
      [8.0, 25, 18, 4.0, 2.0, 11, 9, 1.7, 0.66],
      [58.0, 44, 14, 6.5, 2.5, 10, 8, 2.9, 0.66],                  // the right wall
      [52.5, 23, 18, 4.0, 2.0, 12, 7, 4.1, 0.66],
      // behind the creature: low under the chair at rest, a ragged skyline over its head in the flare, the gold
      // running high enough to show over the head too
      [14.5, 7, 39, 5.5, 4.0, 10, 6, 0.8, 0.8],
      [21.5, 8, 48, 6.0, 4.5, 13, 8, 2.6, 0.8],
      [28.5, 6, 43, 5.5, 4.0, 11, 7, 4.9, 0.8],
      [35.5, 8, 50, 6.0, 4.5, 9, 9, 1.4, 0.8],
      [42.5, 7, 39, 5.5, 4.0, 12, 6, 3.7, 0.8],
    ];
    // Three nested shells: [height, width, ink]; the gold shell's height is the tongue's own; the cream heart only
    // in the big wall flames.
    const SHELLS = [[1, 1, FLAME], [0, 0.6, GOLD], [0.3, 0.32, CREAM]];
    function tongue(bg, x0, h, w, sway, ph, goldH) {
      for (const [hs, ws, ink] of SHELLS) {
        if (ink === CREAM && (h < 14 || (x0 > 12 && x0 < 48))) continue;
        const H = h * (ink === GOLD ? goldH : hs), W = w * ws;
        for (let y = 0; y < H; y++) {
          const u = (y + 0.5) / H, uo = (y + 0.5) / h;             // its own height fraction, and the outer shell's
          const cx = x0 + sway * Math.pow(uo, 1.3) * Math.sin(ph + TAU * 0.9 * uo);   // every shell on the outer's centre line
          const hw = W * Math.pow(1 - u, 0.65) * (u < 0.15 ? 0.75 + 1.67 * u : 1);   // a teardrop
          const r = FLOOR - 1 - y;
          for (let c = Math.floor(cx - hw - 1); c <= Math.ceil(cx + hw + 1); c++) if (Math.abs(c + 0.5 - cx) <= hw) put(bg, r, c, ink);
        }
      }
    }
    function fire(bg, f, E) {
      for (const [x0, h0, gain, w, sway, m, p, ph, goldH] of TONGUES) {
        const flick = 1 + 0.13 * Math.sin(TAU * m * f / NF + ph) + 0.07 * Math.sin(TAU * (m + 3) * f / NF + 2 * ph);
        tongue(bg, x0, (h0 + gain * E) * flick, w * (1 + 0.15 * E), sway, TAU * p * f / NF + ph, goldH);
      }
    }
    // Smoke: round billows along the ceiling, 15 cols apart, a big one and a small one in turn, so the row repeats
    // every 30 cols and drifts right exactly that far a loop; they swell and come down with the flare, and past
    // halfway a loose puff hangs under each.
    const PUFFS = [[0, 8.0, 0.0], [15, 6.5, 2.1], [30, 8.0, 0.0], [45, 6.5, 2.1]];   // [col, radius, phase]
    function smoke(bg, f, E) {
      const drift = 30 * f / NF;
      const disc = (cy, cx, rad) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (Math.hypot(r + 0.5 - cy, c + 0.5 - cx) <= rad) put(bg, r, c, SOOT); };
      for (const [c0, rad0, ph] of PUFFS) for (const k of [-1, 0, 1]) {
        const cx = c0 + drift + 60 * k, cy = -2.5 + 5 * E + 0.6 * Math.sin(TAU * 2 * f / NF + ph);
        const rad = rad0 + 2 * E + 0.6 * Math.sin(TAU * 3 * f / NF + ph);
        disc(cy, cx, rad);
        if (E > 0.5) disc(cy + rad + 2.5, cx + 4, 4.4 * (E - 0.5));
      }
    }
    // Embers: twelve sparks rising a row or two a frame up the side gaps, round the loop's length exactly.
    const EMBERS = Array.from({length: 12}, (_, i) => ({c: [3, 7, 11, 49, 54, 57, 5, 55, 9, 50, 1, 58][i], o: (i * 17) % 40, v: 1 + (i % 2), ink: i % 3 ? GOLD : CREAM}));
    function embers(bg, f) {
      EMBERS.forEach(({c, o, v, ink}, i) => {
        const y = FLOOR - 4 - ((v * f + o) % NF), x = c + Math.round(Math.sin(TAU * 2 * f / NF + i));
        if (inside(y, x) && !bg[y][x]) bg[y][x] = ink;
      });
    }
    function room(f, E) {
      const bg = blank();
      smoke(bg, f, E);
      fire(bg, f, E);                                              // flames lick up into the smoke
      embers(bg, f);
      return bg;
    }
    // The creature and its props over the room: the room takes a cell only where nothing stands and nothing stands
    // beside it, so a dark rim keeps every outline; the floor line goes on last.
    function compose(fg, bg) {
      const g = copy(fg);
      for (let r = 0; r < FLOOR; r++) for (let c = 0; c < N; c++) {
        if (fg[r][c] || !bg[r][c]) continue;
        let near = false;
        for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1; b++) if (inside(r + a, c + b) && fg[r + a][c + b]) { near = true; break; }
        if (!near) g[r][c] = bg[r][c];
      }
      for (let c = 0; c < N; c++) g[FLOOR][c] = SOOT;
      return g;
    }

    // A scene: the chair and the table behind, the creature with its face, the smile, the mug where the sip has it,
    // then the bubble. o: face (a function of the pose), ping, sip (null on the table, 'up' on the way, 'mouth'),
    // fog [level, clearTo], wipe (the wiper's col), dots (null: no bubble), nod (the torso a row down, the shins
    // where they hang).
    const HIPS = 41 + OY;                                          // the body's last row; the shins hang below it
    function scene(o) {
      const g = blank();
      chair(g); table(g);
      let c = seated(!!o.ping);
      (o.face || slits)(c);
      if (o.fog) fog(c, ...o.fog);
      if (o.wipe !== undefined) wiper(c, o.wipe);
      smile(c);
      if (o.nod) { const b = blank(); for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) if (c[r][k]) put(b, r > HIPS ? r : r + 1, k, c[r][k]); c = b; }
      for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) if (c[r][k]) g[r][k] = c[r][k];
      const dn = o.nod ? 1 : 0;                                    // the hand nods with the torso; the mug stays put
      if (!o.sip) { stamp(g, MUG, 32, 48); for (let r = HAND.r[0] + dn; r <= HAND.r[1] + dn; r++) for (let k = HAND.c[0]; k <= HAND.c[1]; k++) g[r][k] = BODY; }
      if (o.sip === 'up') { stamp(g, MUG_B, 30, 37); forearm(g, [34.5, 44]); }
      if (o.sip === 'mouth') { stamp(g, MUG_R, 28, MOUTH[1] - 3); forearm(g, [33, 34.5]); }
      if (o.dots !== undefined && o.dots !== null) bubble(g, o.dots);
      return g;
    }

    // The frames: listed first (the room needs the loop's length), drawn after. F(hold, E the flare's envelope, o).
    const specs = [];
    const F = (hold, E, o = {}) => specs.push({hold, E, o});
    const look = dx => g => slits(g, dx);
    // 1. Rest, the loop anchor: calm, a blink.
    F(190, 0); F(190, 0); F(190, 0);
    F(80, 0, {face: blinked});
    F(190, 0); F(190, 0); F(190, 0);
    // 2. The sip: the mug comes up, held at the mouth with the eyes shut happy, and goes back down.
    F(140, 0, {sip: 'up'});
    F(190, 0, {sip: 'mouth', face: arches}); F(190, 0, {sip: 'mouth', face: arches}); F(190, 0, {sip: 'mouth', face: arches});
    F(140, 0, {sip: 'up', face: arches});
    F(190, 0, {face: arches}); F(190, 0); F(190, 0);
    // 3. The flare: the fire climbs and the smoke comes down; a glance left at the fire, a ping, a glance right.
    F(170, 0.25); F(170, 0.5, {face: look(-3)}); F(170, 0.72, {face: look(-3), ping: true}); F(170, 0.88, {face: look(3)}); F(170, 1);
    // 4. The bubble: it pops in, fills with three dots one at a time, the eyes shut happy; all fine.
    F(170, 1, {dots: 0}); F(200, 1, {dots: 1, face: arches}); F(200, 1, {dots: 2, face: arches}); F(200, 1, {dots: 3, face: arches, nod: true});
    F(200, 1, {dots: 3, face: arches}); F(200, 1, {dots: 3, face: arches}); F(180, 1, {dots: 3});
    // 5. The fog: the smoke gets into the visor from the top in four steps, then holds; the smile never moves.
    F(180, 1, {fog: [0.25]}); F(180, 1, {fog: [0.5]}); F(180, 1, {fog: [0.75]}); F(180, 1, {fog: [1]});
    F(190, 1, {fog: [1]}); F(190, 1, {fog: [1]});
    // 6. The wipe: a ping, then the bar sweeps the band left to right, the visor clean behind it.
    F(150, 1, {fog: [1], ping: true}); F(120, 1, {fog: [1, 19], wipe: 17}); F(120, 1, {fog: [1, 29], wipe: 27}); F(120, 1, {fog: [1, 39], wipe: 37});
    F(170, 0.95, {ping: true});
    // 7. The settle: the flames sink back and the smoke lifts (the loop opens on the rest).
    F(170, 0.78); F(170, 0.58); F(180, 0.38); F(180, 0.2); F(190, 0.07);

    NF = specs.length;
    const frames = specs.map(({hold, E, o}, f) => ({hold, grid: compose(scene(o), room(f, E))}));
    return {
      name: 'ECHO · this is fine', key: 'echo_this_is_fine', fwname: 'echo this is fine', category: 'Idle', size: N,
      // Big tier, like the other HD cells: 43 frames of 3600 bytes (154800 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, the meme format of calm in a burning room, 60 cell lattice (8 px cells, the creature at 3x as in mushroom HD, sitting on a chair with its short legs hanging, a little side table at its right and a cream mug on it under its hand) in a dark room on fire: flames in orange, gold and cream climb both walls and lick under the chair, round smoke billows drift along the ceiling and embers rise; it rests with the family\'s slit eyes and a calm smile and blinks, brings the mug to its mouth with its elbow out and its eyes shut happy and puts it back, then the fire flares, climbing the walls and rising over its head while the smoke swells and comes down, it glances left at the fire and right at its mug with an antenna ping, a speech bubble over its shoulder fills with three dots one at a time while its eyes shut happy, the smoke gets into its visor from the top down until the band is soot with a ghost of its eyes, the smile never moving, the antenna pings and a wiper bar sweeps the visor clean, and the fire sinks back to where the loop began; judge whether it reads at a glance as calm in a burning room, whether the sip reads with the elbow out, whether the soot in the visor reads as smoke fog rather than sunglasses, and whether it is still this creature.',
      // 0 transparent, 1 body, 2 eyes (also the smile, the coffee, the dots, the table's shadow), 3 visor, 4 ping (the
      // antenna tip, the wiper), 5 feet (the shins, the arm's crease), 6 cream (the mug, the bubble, the flames' hearts,
      // embers), 7 gold (flames, embers), 8 flame orange (the flames' outer shell), 9 soot (smoke, the visor's fog, the
      // chair, the table, the floor line)
      palette: [...ECHO_PALETTE.slice(0, 6), '#fff1d6', '#ffc93c', '#ff5a1f', '#6e5c50'],
      frames,
    };
  })();

  L.register([echoThisIsFine]);
})(typeof window !== 'undefined' ? window : globalThis);
