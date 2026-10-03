// Culture creatures: the ECHO creature playing famous paintings, memes and pop culture moments (operator,
// 2026-10-02, more for the animation list: famous paintings, memes, pop culture, "get crazy get creative"). The
// ECHO creature plays every role; a scene borrows only the composition, the setting and the gesture of its source,
// never a character, a likeness or a logo, and its name stays generic. Drawn from scratch on the ECHO base.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {upscale, echoPing, ECHO_PALETTE} = L;

  // ECHO · stonks (the meme's format, played by our creature): the ECHO creature in a little suit and tie stands in front
  // of a trading chart while the price line draws itself across the grid behind it. 60 cell lattice, 8 px cells on the
  // 480 panel, built the way mushroom HD is built: the body is the family's 20 cell pose repeated exactly 3 times across
  // and down (upscale(echoPing(ping), 3)), so the silhouette, the visor band, the antenna and the legs are the family's
  // own; the whole 3x frame sits 9 rows lower and 8 cols left, so its feet stand on the panel's bottom edge and the chart
  // gets the band over its head and the strip to its right.
  //   suit      a navy jacket over the body under the visor and navy sleeves over the arm stubs, the hands left teal; a
  //             white shirt collar opening in a V under the chin with a red tie down it and a dark lapel edge, a white
  //             pocket square, one dark button, navy trousers over the family's legs.
  //   chart     dark teal dashed grid lines every 10 cells on whatever the creature leaves empty, two cells clear of it
  //             all round, so the silhouette always keeps a black rim; the price line is 2 cells thick with a white dot
  //             on its head, and the grid stays a cell clear of the line too. The line only ever moves forward: a
  //             jittery green climb across the band over the head, a red crash down the right strip with two dead cat
  //             bounces, and a green rebound that rockets out of the top right corner, a V shaped recovery. No arrow
  //             anywhere: the line carries it.
  //   rest      the loop anchor: the empty chart with the opening dot at the left and the family's own face; a blink, an
  //             antenna ping, then the eyes roll up and find the dot.
  //   climb     the line draws itself left to right, 5 cells a frame, while the eyes ride along under its head, and a
  //             small smile comes up halfway.
  //   beam      at the peak a white glint flares on the line's head, the eyes close into happy arches over a wide toothy
  //             grin, the torso puffs up a row, the visor takes a shine and the antenna pings twice.
  //   crash     the line ticks down and turns red and the grin drops to a round mouth, held a beat; then it plunges, the
  //             antenna leans over and wilts into a hook with its tip gone dim, the torso sinks a row and shivers a col
  //             each way on planted legs, the eyes shrink and slide right after the line, the mouth clenches into a
  //             grimace, sweat beads break on the forehead and a big drop rolls down the temple.
  //   sweat     the line sits at the bottom with its dot blinking; the beads run, the drop slides, a blink, a hopeful wobbly mouth.
  //   rebound   the line turns green and climbs back, the antenna springs back up, the eyes ride up with it, the sweat is
  //             gone, and as it leaves the top right corner the beam comes back bigger: arches, grin, puff, shine, glints
  //             round the head, pings.
  //   reset     the creature already wears its rest face while the line dissolves in two dither steps, so only the chart
  //             changes across the seam and frame 0 follows the last frame with the creature unchanged.
  // The antenna is the barometer: upright and pinging while the line climbs, wilted and dark while it crashes, the one
  // change to the silhouette, so the two moods differ at a glance with the faces covered.
  // Constants: 60 cells of 8 px; the creature at 3x, 9 rows down and 8 cols left of the family frame; rim 2 cells; grid
  // every 10 cells from col and row 4, dashes 2 on 1 off; line 2 cells thick; climb 5 cells a frame at 170 ms, the tick
  // down held 320 ms, crash and rebound 2 to 3 cells a frame at 110 to 140 ms; puff 1 row up, sink 1 row down, shiver 1
  // col; 33 frames, 8.6 s.
  // Palette: 0..5 the ECHO palette unchanged (2 is also the mouths, the lapel edge and the button, 4 the sweat drop, the
  // beads' tips and the glints' tips, 5 the grid and the wilted antenna's dim tip); 6 white (shirt, teeth, beads, the
  // line's dot, the glints, the visor shine, the pocket square), 7 market green, 8 market red (the crash and the tie), 9
  // suit navy (jacket, sleeves, trousers). Index 6 is white here, not the family's duplicate ping, so no frame goes
  // through echoGlitch.
  // Big tier: 33 frames of 3600 cells are 118800 bytes of firmware table, so it ships only on boards built with
  // SPLASH_BIG. One closure, so echoStonks is the only name it adds to this scope; L.register hands it to the bench and
  // the export.
  const echoStonks = (() => {
    const N = 60, K = 3;                                           // lattice; a 20 cell pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, GRID = 5, WHITE = 6, GREEN = 7, RED = 8, SUIT = 9;
    const OY = 9, OX = -8;                                         // where the family's 3x frame sits on the panel
    const HIPS = 41;                                               // family rows 0..41 are the torso, 42..50 the legs
    const RIM = 2;                                                 // cells the chart keeps clear of the creature
    const HALF = 1;                                                // the price line's half thickness: 2 cells across

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    // Sprites are rows of letters: k dark, w white, p ping, r red; a dot leaves the cell alone.
    const INK = {k: EYE, w: WHITE, p: PING, r: RED};
    const stamp = (g, art, r0, c0) => { art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(g, r0 + dr, c0 + dc, INK[ch]); })); return g; };

    // The creature, on the family lattice at 3x.
    const pose = (ping = false) => upscale(echoPing(ping), K);
    // The suit. The collar is 11 x 9 from row 29, col 26: the shirt opening in a V edged dark, the knot, the tie's neck,
    // its blade and its point; the jacket closes under the V, so the blade hangs over the jacket front.
    const COLLAR = [
      'wwwwrrrwwww',
      'kwwwrrrwwwk',
      '.kwwwrwwwk.',
      '..kwrrrwk..',
      '...krrrk...',
      '....rrr....',
      '...rrrrr...',
      '....rrr....',
      '.....r.....',
    ];
    const POCKET = ['www', 'kkk'];                                 // the pocket square over the pocket's edge
    function dress(g) {
      for (let r = 29; r <= HIPS; r++) for (let c = 15; c <= 47; c++) if (g[r][c] === BODY) g[r][c] = SUIT;   // the jacket
      for (let r = 21; r <= 29; r++) for (const c0 of [9, 48]) for (let c = c0; c < c0 + 6; c++) if (g[r][c] === BODY) g[r][c] = SUIT;   // the sleeves
      for (let r = HIPS + 1; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c]) g[r][c] = SUIT;           // the trousers
      stamp(g, COLLAR, 29, 26);
      stamp(g, POCKET, 31, 39);
      return put(g, 39, 31, EYE);                                  // the button
    }
    // The face. The family's visor band is rows 18..23, cols 18..44; its eyes are 3 x 6 at cols 21 and 39. eyes() draws
    // them 3 wide and h tall from row 18 + dy, slid dx cols along the band: (0, 0, 6) is the family's own, h 4 at the
    // top of the band looks up, h 3 low in the band is the scared look.
    const band = g => { for (let r = 18; r <= 23; r++) for (let c = 18; c <= 44; c++) g[r][c] = VISOR; return g; };
    const eyes = (g, dx = 0, dy = 0, h = 6) => {
      band(g);
      for (let r = 18 + dy; r < 18 + dy + h; r++) for (const c0 of [21, 39]) for (let c = c0; c < c0 + 3; c++) g[r][c + dx] = EYE;
      return g;
    };
    const ARCH = ['..kkkkk..', '.kk...kk.', 'kk.....kk'];          // a happy shut eye, over each eye's place
    const arches = g => stamp(stamp(band(g), ARCH, 19, 18), ARCH, 19, 36);
    const SHINE = ['..ww', '.ww.', 'ww..'];                        // the visor's shine, between the arches
    // Mouths in the teal under the band, rows 25..28, centred on col 31 (every one an odd width).
    const SMILE = ['k.......k', '.kkkkkkk.'];
    const GRIN = ['k...........k', 'kk.........kk', '.kkwwwwwwwkk.', '..kkkkkkkkk..'];
    const OH = ['.kkk.', 'kkkkk', 'kkkkk', '.kkk.'];
    const GRIMACE = ['.kkkkkkkkkkk.', 'kwwkwwkwwkwwk', 'kwwkwwkwwkwwk', '.kkkkkkkkkkk.'];
    const WOBBLE = ['.kk..kkk..kk.', 'k..kk...kk..k'];
    const mouth = (g, art, r0 = 25) => stamp(g, art, r0, 31 - (art[0].length - 1) / 2);
    // Sweat: three beads on the forehead (rows 12..17), white running to a ping tip, and a big ping drop at the left
    // temple, hanging over the head's edge, with a white glint in it.
    const BEADS = [[12, 21], [13, 29], [12, 37]];
    const BEAD = ['.w', 'ww', 'pp'];
    const DROP = ['..p..', '.ppp.', '.ppp.', 'ppppp', 'pwppp', 'pwppp', '.ppp.'];
    function sweat(g, run, drop) {
      for (const [r, c] of BEADS) stamp(g, BEAD, r + run, c);
      return drop === null ? g : stamp(g, DROP, 11 + drop, 11);
    }
    // The antenna wilting: the family's stalk and tip (cols 45..47, rows 3..11) taken off and drawn again from col 39,
    // ending on row 11: leaning over toward the head, away from the chart, or bent right over with its tip hanging two
    // rows clear of the head and gone dim, the light out (b the stalk, t a tip in body teal, d a dim tip).
    const WILT = {
      lean:  ['.ttt.....', '.tttb....', '.tttbb...', '...bbbb..', '....bbbb.', '.....bbbb', '......bbb', '......bbb'],   // rows 4..11
      droop: ['...bbbbb.', '..bbbbbbb', '.ddd..bbb', '.ddd..bbb', '.ddd..bbb', '......bbb', '......bbb'],                 // rows 5..11
    };
    function wilt(g, how) {
      for (let r = 0; r <= 11; r++) for (let c = 36; c < N; c++) g[r][c] = 0;
      const art = WILT[how];
      art.forEach((line, dr) => [...line].forEach((ch, dc) => {
        if (ch !== '.') put(g, 12 - art.length + dr, 39 + dc, ch === 'd' ? GRID : BODY);
      }));
      return g;
    }
    // One creature pose: o.ping, o.wilt ('lean' or 'droop'), o.face ('look', 'shut' or 'beam'), o.look [dx, dy, h],
    // o.mouth, o.sweat [run, drop or null], o.shine.
    function creature(o) {
      const g = dress(pose(!!o.ping));
      if (o.wilt) wilt(g, o.wilt);
      if (o.face === 'beam') arches(g);
      else if (o.face === 'shut') eyes(g, 0, 4, 2);
      else if (o.look) eyes(g, ...o.look);
      if (o.shine) stamp(g, SHINE, 18, 29);
      if (o.mouth) mouth(g, o.mouth);
      if (o.sweat) sweat(g, ...o.sweat);
      return g;
    }
    // The creature on the panel: the 3x frame moved OY rows down and OX cols across; the torso (rows 0..HIPS) moves a
    // further dx cols and dy rows while the legs stay planted, and a torso raised a row keeps its jacket's last row
    // doubled under it, so it never leaves a gap over the legs.
    function place(g, dx = 0, dy = 0) {
      const b = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!g[r][c]) continue;
        if (r <= HIPS) put(b, r + OY + dy, c + OX + dx, g[r][c]); else put(b, r + OY, c + OX, g[r][c]);
      }
      for (let k = 1; k <= -dy; k++) for (let c = 0; c < N; c++) if (g[HIPS][c]) put(b, HIPS + OY + dy + k, c + OX + dx, g[HIPS][c]);
      return b;
    }

    // The chart, on the panel.
    // The price line, [row, col] along its centre, always moving forward in col: the climb, the peak at PEAK, the crash
    // with its two dead cat bounces, the bottom at BOTTOM, the rebound out past the top right corner.
    const PATH = [
      [19, 2], [16, 5], [17.5, 8], [13, 12], [15, 15], [11, 19], [12.5, 22], [8, 27], [10, 30], [6, 34], [7.5, 37], [3, 42], [2, 45],
      [7, 46.5], [5.5, 47.5], [22, 50], [19, 51], [31, 53],
      [20, 55], [23, 56], [8, 58], [-4, 61],
    ];
    const PEAK = 12, BOTTOM = 17;
    const RED_SEGS = i => i >= PEAK && i < BOTTOM;                 // segment i runs from PATH[i] to PATH[i + 1]
    const segDist = (y, x, [ay, ax], [by, bx]) => {
      const vy = by - ay, vx = bx - ax, L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - ay) * vy + (x - ax) * vx) / L2)) : 0;
      return Math.hypot(y - ay - t * vy, x - ax - t * vx);
    };
    // The line drawn up to col X (its head), into its own layer, and where the head is.
    function lineTo(X) {
      const layer = blank();
      let head = PATH[0];
      for (let i = 0; i + 1 < PATH.length && PATH[i][1] < X; i++) {
        const a = PATH[i];
        let b = PATH[i + 1];
        if (b[1] > X) { const t = (X - a[1]) / (b[1] - a[1]); b = [a[0] + (b[0] - a[0]) * t, X]; }
        head = b;
        for (let r = Math.floor(Math.min(a[0], b[0]) - 2); r <= Math.ceil(Math.max(a[0], b[0]) + 2); r++)
          for (let c = Math.floor(a[1] - 2); c <= Math.ceil(b[1] + 2); c++)
            if (inside(r, c) && segDist(r + 0.5, c + 0.5, a, b) <= HALF) layer[r][c] = RED_SEGS(i) ? RED : GREEN;
      }
      return {layer, head};
    }
    const DOT = ['.ww.', 'wwww', 'wwww', '.ww.'];                  // the line's head
    const near = (m, r, c, w) => {
      for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) if (inside(r + a, c + b) && m[r + a][c + b]) return true;
      return false;
    };
    // The chart behind the placed creature g: the line to col X (its head dot unless dot is false; fade 1 keeps half its
    // cells on a checker, fade 2 a quarter) and the dashed grid, only on cells RIM or more clear of the creature, the
    // grid also a cell clear of the line.
    function chart(g, X, {dot = true, fade = 0} = {}) {
      const {layer, head} = lineTo(X);
      if (dot && !fade) stamp(layer, DOT, Math.round(head[0]) - 2, Math.round(head[1]) - 2);
      if (fade) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (layer[r][c] && (fade === 1 ? (r + c) % 2 : (r % 2 || c % 2))) layer[r][c] = 0;
      }
      const out = g.map(row => row.slice());
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (g[r][c] || near(g, r, c, RIM)) continue;
        if (layer[r][c]) { out[r][c] = layer[r][c]; continue; }
        const v = c % 10 === 4, h = r % 10 === 4;
        if ((v && h) || (v && r % 3 !== 2) || (h && c % 3 !== 2)) if (!near(layer, r, c, 1)) out[r][c] = GRID;
      }
      return out;
    }
    // Glints, over everything: a white four point star with ping tips, and a small one.
    const GLINT = [['...p...', '...w...', '..www..', 'pwwwwwp', '..www..', '...w...', '...p...'], ['.p.', 'pwp', '.p.']];
    const glint = (g, k, r, c) => stamp(g, GLINT[k], r - (GLINT[k].length - 1) / 2, c - (GLINT[k].length - 1) / 2);

    // The frames.
    const frames = [];
    // F(hold, creature options, X, chart options, torso [dx, dy], glints [[size, row, col], ...])
    const F = (hold, o, X, co = {}, [tdx, tdy] = [0, 0], glints = []) => {
      const g = chart(place(creature(o), tdx, tdy), X, co);
      for (const [k, r, c] of glints) glint(g, k, r, c);
      frames.push({hold, grid: g});
    };
    const REST = {face: 'look', look: [0, 0, 6]};
    // 1. Rest, the loop anchor: the empty chart, its opening dot at the left; a blink, an antenna ping, the eyes find it.
    F(1100, REST, 2);
    F(90, {face: 'shut'}, 2);
    F(160, {...REST, ping: true}, 2);
    F(420, {face: 'look', look: [-2, 0, 4]}, 2);
    // 2. The climb: five cells a frame, the eyes riding under the head; a small smile comes up halfway.
    const CLIMB = [[7, -2], [12, -2], [17, -1], [22, 0], [27, 0], [32, 1], [37, 2], [42, 2]];
    CLIMB.forEach(([X, dx], k) => F(170, {face: 'look', look: [dx, 0, 4], mouth: k >= 3 ? SMILE : null}, X));
    F(200, {face: 'look', look: [2, 0, 4], mouth: SMILE}, 45);     // the peak
    // 3. The beam: arches, the grin, the puff, the shine, the glint on the peak, two pings.
    const BEAM = {face: 'beam', mouth: GRIN, shine: true};
    F(450, {...BEAM, ping: true}, 45, {}, [0, -1], [[0, 3, 46]]);
    F(450, BEAM, 45, {}, [0, -1], [[1, 3, 46]]);
    F(400, {...BEAM, ping: true}, 45, {}, [0, -1]);
    // 4. The crash: a tick down in red and the grin drops; the plunge, the scared eyes after it, the grimace, the
    // shiver, the sweat breaking.
    F(320, {face: 'look', look: [3, 0, 6], mouth: OH}, 47.5);       // uh oh: held, so the dip lands before the plunge
    F(110, {wilt: 'lean', face: 'look', look: [3, 1, 4], mouth: GRIMACE, sweat: [0, null]}, 50, {}, [1, 1]);
    F(110, {wilt: 'droop', face: 'look', look: [3, 1, 4], mouth: GRIMACE, sweat: [0, null]}, 51, {}, [-1, 1]);
    F(140, {wilt: 'droop', face: 'look', look: [3, 2, 3], mouth: GRIMACE, sweat: [0, 0]}, 53, {}, [1, 1]);
    // 5. The sweat at the bottom: the dot blinks, the beads run, the drop slides; a blink; a hopeful look with a wobbly mouth.
    F(300, {wilt: 'droop', face: 'look', look: [3, 2, 3], mouth: GRIMACE, sweat: [1, 1]}, 53, {dot: false}, [-1, 1]);
    F(300, {wilt: 'droop', face: 'look', look: [3, 2, 3], mouth: GRIMACE, sweat: [2, 2]}, 53, {}, [1, 1]);
    F(260, {wilt: 'droop', face: 'shut', mouth: GRIMACE, sweat: [2, 3]}, 53, {dot: false}, [0, 1]);
    F(300, {wilt: 'droop', face: 'look', look: [2, 0, 4], mouth: WOBBLE, sweat: [2, 3]}, 53, {}, [0, 1]);
    // 6. The rebound: green, the antenna springs back, the eyes ride up with it, the sweat gone; out of the top right
    // corner.
    F(130, {wilt: 'lean', face: 'look', look: [3, 0, 4], mouth: OH}, 55);
    F(110, {face: 'look', look: [3, 0, 4], mouth: OH}, 56);
    F(110, {face: 'look', look: [3, 0, 4], mouth: SMILE}, 58);
    F(150, {...BEAM, ping: true}, 61, {}, [0, -1]);
    // 7. The big beam: arches, grin, puff, shine, glints round the head twinkling, pings.
    F(500, BEAM, 61, {}, [0, -1], [[0, 6, 57], [1, 23, 2], [1, 21, 43]]);
    F(450, {...BEAM, ping: true}, 61, {}, [0, -1], [[1, 6, 57], [0, 23, 2], [0, 21, 43]]);
    F(450, BEAM, 61, {}, [0, -1], [[0, 6, 57], [1, 23, 2], [1, 21, 43]]);
    // 8. The reset: the rest face already, the line dissolving in two steps (loops to the rest).
    F(100, REST, 61, {fade: 1});
    F(100, REST, 61, {fade: 2});

    return {
      name: 'ECHO · stonks', key: 'echo_stonks', fwname: 'echo stonks', category: 'Active', size: N,
      // Big tier, like the other HD cells: 33 frames of 3600 bytes (118800 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, 60 cell lattice (8 px cells, the creature at 3x as in mushroom HD, set low and to the left so its feet stand on the bottom edge), the stonks format played by our creature: in a little navy suit with a white collar, a red tie and a pocket square it stands in front of a dark teal dashed chart grid while a 2 cell price line with a white dot on its head draws itself left to right across the band over its head, a jittery green climb with its eyes riding along under the dot and a small smile coming up, until at the peak a glint flares and it beams, eyes shut in happy arches over a wide toothy grin, puffed up a row with a shine on its visor and two antenna pings; then the line ticks down in red and the grin drops to a round mouth for a beat, and the line plunges down the strip to its right through two dead cat bounces while its antenna wilts over into a hook with its tip gone dark, it sinks a row and shivers a col each way on planted legs, its eyes shrink and follow the line, its mouth clenches into a grimace, beads of sweat run down its forehead and a big drop rolls down its temple, a blink and a hopeful look with a wobbly mouth at the bottom; then the line turns green and rockets back up and out of the top right corner in a V shaped recovery, the antenna springing back up and its eyes riding up with it, and it beams bigger with glints round its head, before the line dissolves and it rests on the empty chart again; no arrow anywhere, the line carries it; judge whether the climb and the crash read from a metre away, whether the suit still leaves it this creature, and whether the sweat reads as sweat.',
      // 0 transparent, 1 body and hands, 2 eyes, mouths, the lapel edge and the button, 3 visor, 4 ping (antenna tip,
      // sweat drop, the beads' tips, the glints' tips), 5 the chart grid and the wilted antenna's dim tip, 6 white (shirt,
      // teeth, beads, the line's dot, glints, the visor shine, the pocket square), 7 market green, 8 market red (the crash,
      // the tie), 9 suit navy (jacket, sleeves, trousers)
      palette: [...ECHO_PALETTE.slice(0, 6), '#eafffb', '#3fe04a', '#ff4646', '#2a3550'],
      frames,
    };
  })();

  L.register([echoStonks]);
})(typeof window !== 'undefined' ? window : globalThis);
