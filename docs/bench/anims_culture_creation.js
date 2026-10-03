// Culture creatures: the creation (operator, 2026-10-02: "famous paintings, memes, pop culture ... get crazy get
// creative"). After Michelangelo's Creation of Adam on the Sistine Chapel ceiling (about 1512, public domain): the
// composition, the setting and the gesture only, and the ECHO creature plays both parts. Drawn from scratch in code.
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
//
// A 60 cell lattice, 8 px cells on the 480 panel. Two creatures and the reach between them do not fit across 60 cells
// at the HD cells' 2x or 3x (each one is about 30 cells from its back to its fingertip), so the scene is laid out in a
// composition frame, Adam on the left facing God on the right with their arms on one line, and that frame is turned
// 26.57 degrees counter clockwise onto the panel (tan = 1/2, so straight edges land as clean two by one staircases):
// Adam ends up low on the left leaning back against the hill, God high on the right leaning in, and the panel's
// diagonal gives the reach the room the width does not. Every cell takes 3 x 3 samples of the turned scene and the
// commonest colour wins, so the turned shapes keep their true outline instead of nearest neighbour noise.
//   figures   the family's front view at 1.5x, 12 px a family cell (the size two agents draws its minis at, with four
//             times their detail), drawn from the family's ratios rather than resampled with upscale: nearest neighbour
//             at 1.5x gives the two eyes and the four legs different widths (distracted draws its cast the same way for
//             the same reason), and the turn samples the figure as shapes anyway. Torso 17 x 15, the visor band 3 rows,
//             the antenna, legs 2 wide; the reaching arm comes off the torso's side where the family's stub was. Arm
//             and hand are continuous shapes (a capsule 3 across, a fist 6 across, a finger 2 across along the top of
//             it): God's finger straight, Adam's hanging at rest with its tip two rows below the line (the fresco's
//             languid hand against God's taut one) and lifting straight when it stirs. The eyes are stamped upright at
//             the turned eye centres (open, sleepy slit, shut, happy arch), each slid a cell toward the other creature,
//             so both read whatever the tilt.
//   god       a white beard under the visor, no legs (the cloak takes them), on a red shell: an oval cloak with a
//             vermilion rim and a dark lining, scalloped, two broken fold lines inside, its mouth open toward Adam, a
//             cherub (the family mini, anims_moves' 2x2 majority) riding low in the lining under God's arm, far enough
//             left that God's drift keeps the whole of it on the panel.
//   adam      reclining on an olive earth hill out of the bottom left, eyes a sleepy slit, and still through the rest: in
//             the fresco God's side moves and Adam waits, so Adam's first beat is the stir (a blink before it reads as a
//             twitch on the tilted visor, and would spend the stir's open eyes early).
//   the gap   one lattice step along the reach (a row and two cols, root 5 cells) between God's fingertip and Adam's
//             lifted one, so God's reach to the touch, and God's drift away and back, are whole cell moves that never
//             shimmer. At rest Adam's tip hangs two rows lower, so the resting gap is about 3 cells of dark, and the
//             stir closes it to the one step.
// The loop, 23 frames, 8.97 s:
//   rest      4.1 s, the dominant state: the iconic gap; the cloak's scallops ripple round the rim an eighth of a
//             scallop a step and the cherub bobs a row every second step; God blinks once while Adam lies still.
//   stir      Adam's eyes open and its hanging finger lifts two rows, straight to the line of God's (300 ms).
//   spark     a twinkle in the gap (140 ms), a bolt across it with both antennas pinging (110 ms), then a burst, a white
//             star with cyan rays, while both reaching arms flare visor teal and the cherub's antenna pings (180 ms).
//   touch     God reaches one step and the fingertips meet; a ring of light runs out from them in three widening,
//             thinning rings (behind the figures), the arms still lit on the first; both go happy and hold 600 ms.
//   apart     God's whole group (shell, cherub and all) drifts two steps back up the reach while motes of the spark hang
//             in the widening gap and go out; Adam's finger droops again and its eyes close back to the slit.
//   return    God drifts back, and the loop opens on the rest.
// Constants: 60 cells of 8 px; the reach at 26.57 degrees; figures 1.5x; arm 4 out, hand 9.5, gap root 5, Adam's
// resting tip 2 rows low; the ripple pi/4 a step, 16 steps a loop (two whole turns, checked at load so the seam cannot
// slip); drift 2 steps; the cherub's top left at row 32, col 45.
// Palette: 0..5 the ECHO palette unchanged (3 is also the arms' flare, 4 also the spark's rays, the rings and the motes,
// 5 also Adam's legs); 6 vermilion (the cloak's rim and folds), 7 the cloak's dark lining, 8 olive earth (the hill),
// 9 warm white (God's beard, the spark's core). Index 6 is not the duplicate ping here, so no frame goes through
// echoGlitch. Big tier: 23 frames of 3600 cells are 82800 bytes of firmware table, so it ships only on boards built
// with SPLASH_BIG. One closure, so echoCreation is the only name this adds to the file's scope.
(function (root) {
  const L = root.BENCH_LIB;
  const {echoBase, ECHO_PALETTE} = L;

  const echoCreation = (() => {
    const N = 60;
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, DEEP = 5, RED = 6, LINING = 7, EARTH = 8, WHITE = 9;
    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    const fill = (g, r, c, v) => { if (inside(r, c) && !g[r][c]) g[r][c] = v; return g; };
    const stamp = (g, art, r0, c0, ink) => { art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ink[ch] !== undefined) put(g, r0 + dr, c0 + dc, ink[ch]); })); return g; };
    const key = (r, c) => r * 100 + c;
    const cells = (...boxes) => { const s = new Set(); for (const [r0, r1, c0, c1] of boxes) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) s.add(key(r, c)); return s; };
    // Distance from (y, x) to the segment p q.
    const segd = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };

    // The figure at 1.5x, front view, in sprite cells from the torso's top left: torso 17 x 15; visor band rows 3..5,
    // cols 2..14; arm stubs rows 5..8, 3 wide, a claw cell under the outer col on rows 9..10; legs rows 15..18, 2 wide,
    // at cols 0, 5, 10, 15; antenna cols 15..16, stalk rows -3..-1, tip rows -5..-4. The reaching side's stub is left
    // off (the reach draws that arm); the eyes are stamped later, upright.
    const TW = 17, TALL = 15, ARM_Y = 7;                           // ARM_Y: the middle of the arm rows, on the reach line
    const BEARD = cells([6, 6, 3, 13], [7, 7, 4, 12], [8, 8, 5, 11], [9, 9, 6, 10], [10, 10, 7, 9]);
    const LEGS = [0, 5, 10, 15];
    function bodyCell(y, x, o) {
      const r = Math.floor(y), c = Math.floor(x);
      if (o.beard && BEARD.has(key(r, c))) return WHITE;
      if (r >= 0 && r < TALL && c >= 0 && c < TW) return r >= 3 && r <= 5 && c >= 2 && c <= 14 ? VISOR : BODY;
      if (c >= 15 && c <= 16 && r >= -5 && r <= -1) return r <= -4 && o.lit ? PING : BODY;
      if (!o.noLegs && r >= 15 && r <= 18 && LEGS.some(c0 => c === c0 || c === c0 + 1)) return DEEP;
      const stub = side => (side < 0 ? (c >= -3 && c <= -1 && r >= 5 && r <= 8) || (c === -3 && r >= 9 && r <= 10)
                                     : (c >= 17 && c <= 19 && r >= 5 && r <= 8) || (c === 19 && r >= 9 && r <= 10));
      if (o.side > 0 && stub(-1)) return 0;                        // God reaches with its left arm
      if (o.side < 0 && stub(1)) return 0;                         // Adam with its right
      return stub(-1) || stub(1) ? BODY : 0;
    }

    // The reaching arm and hand, in reach cells: along runs out from the torso edge toward the gap, across is the sprite
    // row less ARM_Y. Continuous shapes, so the turn renders their true outline: the arm a capsule 3 across, the fist a
    // disc 6 across round the wrist end, the finger a capsule 2 across along the top of it. A lit reach (the flare) is
    // drawn in visor teal.
    const STEP = Math.sqrt(5);                                     // one lattice step along the reach: a row and two cols
    const ARM = 4, HAND = 9.5, HALF_GAP = STEP / 2, EDGE = HALF_GAP + HAND + ARM;
    const FINGER = {
      firm: [[-0.5, 3], [-0.3, 8.5]],                              // God: straight out
      limp: [[-0.6, 3], [0.0, 6.0], [2.0, 7.8]],                   // Adam at rest: the tip hanging two rows low
      lift: [[-0.6, 3], [-0.6, 6.6], [-0.5, 8.5]],                 // Adam stirring: the finger straightens
    };
    function reachCell(along, across, o) {
      const w = ARM + (o.extend || 0);                             // the wrist, cells out from the torso edge
      if (along < -1 || along > w + 11) return 0;
      const ink = o.glow ? VISOR : BODY;
      if (segd(across, along, [0, -1], [0, w]) <= 1.5) return ink;
      if (Math.hypot(across, along - w - 2.4) <= 2.9) return ink;
      const f = FINGER[o.finger];
      for (let i = 0; i + 1 < f.length; i++) if (segd(across, along - w, f[i], f[i + 1]) <= 1.0) return ink;
      return 0;
    }

    // The composition frame: u along the reach (Adam toward God), v across it (down), origin on the gap centre GAP. The
    // panel is that frame turned TH counter clockwise, tan TH = 1/2. Adam's torso ends at u = -EDGE, God's begins at
    // u = EDGE, both with the arm rows on v = 0.
    const TH = Math.atan(0.5), CS = Math.cos(TH), SN = Math.sin(TH);
    const GAP = [30, 32];
    const toComp = (r, c) => { const dy = r - GAP[0], dx = c - GAP[1]; return [dx * SN + dy * CS, dx * CS - dy * SN]; };
    const toPanel = (v, u) => [GAP[0] + v * CS - u * SN, GAP[1] + v * SN + u * CS];
    const spriteOf = (v, u, side) => [v + ARM_Y, side < 0 ? u + EDGE + TW : u - EDGE];   // side -1 Adam, +1 God
    const compOf = (y, x, side) => [y - ARM_Y, side < 0 ? x - EDGE - TW : x + EDGE];

    // Eyes, stamped upright on the panel at the turned eye centres, every one 4 cols by 3 rows round the centre cell:
    // open is the family's tall eye, sleepy a slit on the middle row, shut the slit dropped a row, happy an arch.
    const EYE_ART = {
      open: ['.kk.', '.kk.', '.kk.'], sleepy: ['....', 'kkkk', '....'], shut: ['....', '....', 'kkkk'], happy: ['.kk.', 'k..k', '....'],
    };
    function eyes(g, side, state, look) {
      for (const ex of [4, 13]) {
        const [pr, pc] = toPanel(...compOf(4.5, ex + look, side));
        stamp(g, EYE_ART[state], Math.floor(pr) - 1, Math.round(pc) - 2, {k: EYE});
      }
    }

    // The cherub: the family mini (anims_moves' 2x2 majority of the family pose, eyes winning ties), antenna tip unlit.
    // CHERUB is its top left at rest: low in the lining under God's arm, its feet on the lining just above the bottom
    // rim, two rows of lining clear of God's torso corner; its cells span cols 46..53, so God's drift of two steps (4
    // cols right) leaves them on cols 50..57, the whole mini on the panel.
    const CHERUB = [32, 45];
    const MINI = (() => {
      const m = [];
      for (let r = 0; r < 20; r += 2) {
        const row = [];
        for (let c = 0; c < 20; c += 2) {
          const v = [echoBase[r][c], echoBase[r][c + 1], echoBase[r + 1][c], echoBase[r + 1][c + 1]].filter(Boolean);
          if (!v.length) { row.push(0); continue; }
          const n = {}; let best = v[0];
          for (const x of v) { n[x] = (n[x] || 0) + 1; if (n[x] > n[best]) best = x; }
          if ((n[2] || 0) >= 1) best = 2;
          row.push(best === 4 ? BODY : best);
        }
        m.push(row);
      }
      return m;
    })();
    const cherub = (g, r0, c0, lit) => MINI.forEach((row, r) => row.forEach((v, c) => { if (v) put(g, r0 + r, c0 + c, lit && r === 0 && v === BODY ? PING : v); }));

    // The hill: a mound out of the bottom left, Adam lying back on it; the top edge through these [col, row] points.
    const HILL = [[0, 38], [6, 39], [12, 41], [18, 44], [23, 47.5], [27, 51.5], [30, 55.5], [32, 60]];
    const hillTop = c => {
      for (let i = 0; i + 1 < HILL.length; i++) {
        const [c0, r0] = HILL[i], [c1, r1] = HILL[i + 1];
        if (c >= c0 && c <= c1) return r0 + (r1 - r0) * (c - c0) / (c1 - c0);
      }
      return N + 1;
    };
    // The cloak: an oval shell behind God, its mouth toward Adam (left and a little down), cut back and rimless there;
    // a vermilion rim round the back scalloped eight times, the scallops moved by ph (the ripple), and two broken fold
    // lines in the lining. It takes empty cells only, and is drawn first, so God and the cherub sit in it.
    const CLOAK = {cy: 25, cx: 53, ry: 22, rx: 17};
    const OPEN = Math.atan2(0.25, -1);
    function cloak(g, ph) {
      const {cy, cx, ry, rx} = CLOAK;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const dy = (r + 0.5 - cy) / ry, dx = (c + 0.5 - cx) / rx, a = Math.atan2(dy, dx), k = Math.hypot(dy, dx);
        const t = Math.cos(a - OPEN);                                // 1 at the mouth, -1 at the back
        const R = (1 + 0.06 * Math.sin(8 * a + ph)) * (1 - 0.4 * Math.max(0, t - 0.55));
        const rim = 0.2 * Math.max(0, Math.min(1, (0.85 - t) / 0.4));
        if (k > R) continue;
        const fold = t < 0.4 && [0.62, 0.8].some(f0 => Math.abs(k - f0 * R) < 0.035) && Math.sin(5 * a + ph) > -0.2;
        fill(g, r, c, k > R - rim || fold ? RED : LINING);
      }
    }

    // A figure's layer: for God the cloak and the cherub first, then the figure, 3 x 3 samples a cell (the commonest
    // colour wins where at least 4 of 9 land on it; the antenna tip and the beard count double, so they are not voted
    // away by the body round them), then the eyes. Only cells whose centre lies within a cell of the figure's reach in
    // the composition frame are sampled, and a layer is drawn once per set of options (many frames share one).
    const layers = new Map();
    function figureLayer(side, o) {
      const memo = side + JSON.stringify(o);
      if (layers.has(memo)) return layers.get(memo);
      const g = blank();
      if (side > 0) { cloak(g, o.ph * Math.PI / 4); cherub(g, CHERUB[0] + o.bob, CHERUB[1], o.cherubLit); }
      const w = ARM + (o.extend || 0);
      const [u0, u1] = side < 0 ? [-EDGE - TW - 4, -EDGE + w + 12] : [EDGE - w - 12, EDGE + TW + 4];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const [vc, uc] = toComp(r + 0.5, c + 0.5);
        if (uc < u0 || uc > u1 || vc < -ARM_Y - 6 || vc > TALL + 5 - ARM_Y) continue;
        const n = {};
        let hit = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const [v, u] = toComp(r + (i + 0.5) / 3, c + (j + 0.5) / 3);
          const [y, x] = spriteOf(v, u, side);
          const along = side < 0 ? u + EDGE : EDGE - u;
          const val = reachCell(along, y - ARM_Y, o) || bodyCell(y, x, o);
          if (val) { hit++; n[val] = (n[val] || 0) + (val === PING || val === WHITE ? 2 : 1); }
        }
        if (hit >= 4) g[r][c] = +Object.keys(n).reduce((a, b) => (n[a] >= n[b] ? a : b));
      }
      eyes(g, side, o.eyes, o.look);
      layers.set(memo, g);
      return g;
    }

    // The spark, on the panel round a centre cell: p the cyan, w the white core.
    const FX = {
      twinkle: ['.p.', 'pwp', '.p.'],
      bolt: ['....p', '..pww', 'pww..', 'w....'],
      burst: ['p...p...p', '.p..p..p.', '..p.w.p..', '...www...', 'ppwwwwwpp', '...www...', '..p.w.p..', '.p..p..p.', 'p...p...p'],
    };
    function fx(g, name, r, c) {
      const art = FX[name];
      stamp(g, art, r - (art.length >> 1), c - (art[0].length >> 1), {p: PING, w: WHITE});
    }
    // A ring of light R cells round (r, c), every n-th cell, on empty cells only (it passes behind the figures).
    function ring(g, r, c, R, n) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (Math.abs(Math.hypot(y + 0.5 - r, x + 0.5 - c) - R) < 0.5 && (y + x) % n === 0 && !g[y][x]) g[y][x] = PING;
      }
    }

    // A frame. s: {gEyes, aEyes (default open and sleepy), gLit, aLit, cherubLit (antenna tips), glow (both reaches
    // flare), ext (God's reach, in steps), finger (Adam's), drift (God's group, steps back up the reach), ph, bob,
    // motes: [[r, c]], rings: [[R, every]], fx: [[name, r, c]]}
    const SPARK = [30, 31], TOUCH = [30.5, 31];                    // the spark's centre cell; where the fingertips meet
    function scene(s) {
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (r + 0.5 >= hillTop(c + 0.5)) g[r][c] = EARTH;
      const lay = (src, dy, dx) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (src[r][c]) put(g, r + dy, c + dx, src[r][c]); };
      const d = s.drift || 0;
      lay(figureLayer(1, {side: 1, eyes: s.gEyes || 'open', look: -1, lit: s.gLit, glow: s.glow, beard: true, noLegs: true,
        finger: 'firm', extend: (s.ext || 0) * STEP, ph: s.ph, bob: s.bob, cherubLit: s.cherubLit}), -d, 2 * d);
      lay(figureLayer(-1, {side: -1, eyes: s.aEyes || 'sleepy', look: 1, lit: s.aLit, glow: s.glow, finger: s.finger || 'limp'}), 0, 0);
      for (const [r, c] of s.motes || []) if (inside(r, c) && !g[r][c]) g[r][c] = PING;
      for (const [R, every] of s.rings || []) ring(g, TOUCH[0], TOUCH[1], R, every);
      for (const name of s.fx || []) fx(g, name, SPARK[0], SPARK[1]);
      return g;
    }

    // The frames. ph is the cloak's ripple, an eighth of a scallop round the rim a step; it runs through the rest and the
    // drift, holds while the spark and the touch play (tick false), and makes a whole number of turns a loop (16 steps),
    // so the seam does not show. bob lifts the cherub a row every second ripple step.
    const frames = [];
    let ph = 0;
    const F = (hold, s, tick = true) => { frames.push({hold, grid: scene({...s, ph: ph % 8, bob: Math.floor(ph / 2) % 2})}); if (tick) ph++; };
    // 1. Rest: the iconic gap. The cloak billows, the cherub bobs, God blinks; Adam lies still, its finger hanging.
    F(600, {});
    F(660, {});
    F(550, {});
    F(600, {});
    F(550, {});
    F(100, {gEyes: 'shut'}, false);
    F(500, {});
    F(500, {});
    // 2. Adam stirs: its eyes open and its finger lifts straight to the line of God's.
    F(300, {aEyes: 'open', finger: 'lift'});
    // 3. The spark: a twinkle in the gap, a bolt across it, a burst; the reaches flare and the antennas ping.
    F(140, {aEyes: 'open', finger: 'lift', fx: ['twinkle']}, false);
    F(110, {aEyes: 'open', finger: 'lift', fx: ['bolt'], gLit: true, aLit: true}, false);
    F(180, {aEyes: 'open', finger: 'lift', fx: ['burst'], glow: true, gLit: true, aLit: true, cherubLit: true}, false);
    // 4. The touch: God closes the gap; a ring of light runs out from the fingertips and both go happy.
    F(200, {ext: 1, aEyes: 'open', gEyes: 'happy', finger: 'lift', glow: true, gLit: true, aLit: true, cherubLit: true, rings: [[3.5, 1]]}, false);
    F(200, {ext: 1, aEyes: 'happy', gEyes: 'happy', finger: 'lift', rings: [[6.5, 2]]}, false);
    F(240, {ext: 1, aEyes: 'happy', gEyes: 'happy', finger: 'lift', rings: [[9.5, 3]]}, false);
    F(600, {ext: 1, aEyes: 'happy', gEyes: 'happy', finger: 'lift'});
    // 5. They drift apart; motes of the spark hang in the gap and go out; Adam's finger droops, its eyes close.
    F(320, {drift: 1, aEyes: 'open', finger: 'lift', motes: [[28, 33], [31, 29], [26, 30], [32, 35]]});
    F(420, {drift: 2, aEyes: 'open', motes: [[27, 32], [31, 28], [25, 31]]});
    F(450, {drift: 2, aEyes: 'sleepy', motes: [[26, 32]]});
    F(400, {drift: 2});
    F(400, {drift: 2});
    // 6. And God drifts back to the gap (it loops to the rest).
    F(450, {drift: 1});
    F(500, {});
    if (ph % 8) throw new Error('echo creation: the cloak ripple ends the loop on step ' + (ph % 8) + ', not 0, so the seam would jump');

    return {
      name: 'ECHO · creation', key: 'echo_creation', fwname: 'echo creation', category: 'Idle', size: N,
      // Big tier, like the HD cells: 23 frames of 3600 bytes (82800 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, 60 cell lattice (8 px cells), after Michelangelo\'s Creation of Adam (public domain) with the ECHO creature in both parts, drawn at 1.5x from the family\'s ratios in its front view and laid along the panel\'s diagonal: Adam reclines on an olive hill in the bottom left, eyes a sleepy slit, its right arm reaching up the diagonal to a limp finger that hangs two rows below the line, while God, with a white beard under its visor, leans in from a red shell of a cloak in the top right (a vermilion rim scalloped round a dark lining, a cherub mini riding low in it) and reaches down with a straight finger, about three cells of dark between the fingertips; for four seconds the cloak ripples, the cherub bobs and God blinks while Adam lies still, then Adam\'s eyes open and its finger lifts straight to the line of God\'s, a twinkle appears in the gap, a bolt crosses it with both antennas pinging, a white burst with cyan rays flares while both arms light up visor teal, God reaches the last step so the fingertips meet, three rings of light run out from them and both go happy, then God, its cloak and the cherub drift two steps back up the diagonal while motes of the spark hang in the gap and go out, Adam\'s finger droops again and its eyes close back to a slit, and God drifts back to the gap to do it again; judge whether Adam\'s hanging finger against God\'s straight one reads as the languid hand and the taut one, whether the gap reads at a metre before the spark comes, and whether the two tilted creatures still read as ECHO.',
      // 0 transparent, 1 body, 2 eyes, 3 visor (also the arms' flare), 4 ping (antenna tips, the spark's rays, the rings,
      // the motes), 5 Adam's legs, 6 vermilion (the cloak's rim and folds), 7 the cloak's dark lining, 8 olive earth
      // (the hill), 9 warm white (God's beard, the spark's core)
      palette: [...ECHO_PALETTE.slice(0, 6), '#c8452f', '#5a1a1e', '#6b5a35', '#fff4dc'],
      frames,
    };
  })();

  L.register([echoCreation]);
})(typeof window !== 'undefined' ? window : globalThis);
