// Culture: a homage to Girl with a Pearl Earring (Johannes Vermeer, about 1665, public domain), the ECHO creature as the
// sitter (operator, 2026-10-02: famous paintings, memes and pop culture for the animation list, "get crazy get
// creative"). Drawn from scratch in code, no traced image and no fetched pixel data: the painting lends its composition,
// its setting and its gesture only (a dark ground, a sitter turned away who looks back over the shoulder, a blue and
// yellow turban wrap, a pearl at the side of the head). Loaded after anims.js (bench: script tag; export:
// tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {upscale, echoPing, ECHO_PALETTE} = L;

  // 3x. Pearl earring HD: 60 cell lattice, 8 px cells on the 480 panel, the creature at 3x, seen turning. The turn is
  // drawn the way acrobat HD turns its figures, every lattice cell asking which body point its centre covers. The body
  // is an upright box the family's size at 3x (11 cells across, the side view's 9 deep, 30 rows tall) turned th degrees
  // about a vertical axis (0 faces the viewer, 90 faces left; th stays strictly between, so both faces it shows are
  // the front and the creature's left side). Each cell's view ray enters the box through one of them, and the front face
  // reads its visor straight from upscale(echoPing(false), 3), so square to the viewer it would be the family's own face
  // cell for cell. The legs stand at the box's corners and the antenna on its back corner, as in the family's side views.
  // The light is Vermeer's window, from the left: the front face is always lit; the side face is lit while the creature
  // faces left (th over 59) and drops into the feet teal once the face comes round into the light.
  // The turban: one soft volume over the head, tight round the brow (its hem lower over the brow than behind) and a dome
  // above leaning back; blue in front and below, yellow over the top and the back, split on a slope; a cyan rim where the
  // window catches the blue's top edge and one dark fold following the split round the head; the antenna pokes out of
  // the yellow cap. The drape, the yellow cloth falling from the cap's back corner, hangs behind the head, flares toward
  // a slanted hem and swings behind the turn.
  // The face is drawn on the panel at its projected place, so the slits keep whole widths: the near eye 3 cells and the
  // far eye 2 once the face is turned, each with one white catchlight on the window side; a mouth 4 cells across, shut a
  // row, parted two. The pearl hangs on a wire from the side face just behind the cheek's corner: a round drop 5 cells
  // across in pearl grey, a white highlight high on the lit side; it swings a cell or two behind the turn.
  //   rest     turned away to the left in near profile (th 76): the visor a sliver at the face edge with the two eye
  //            ticks in it, the pearl hanging on the lit side, the drape behind; 1.5 s.
  //   turn     a wind up (79), then round toward the viewer in five frames (71, 60, 49, 40, 33), past the mark (31) and
  //            back (34); the eyes lead, sliding toward the viewer from the third frame; the side drops into shadow
  //            between 60 and 49; the pearl and the drape lag and swing past as it stops.
  //   glance   the dominant state, 5 s: three quarter view, the eyes slid toward the viewer, a ping as the look lands;
  //            the pearl catches the light, a white star with cyan tips swelling from its highlight and fading (five
  //            frames, 0.52 s); the lips part; a blink; a ping; the lips close.
  //   back     the eyes lead away, then round to the left in five frames (40 to 78), the pearl and the drape lagging,
  //            and it settles into the rest, which is the loop's first frame.
  // Constants: 60 cells of 8 px; the box 33 x 27 x 30, its turning axis on panel col 28.5, the head's top on row 19; the
  // light from the left, the side face lit over th 59; rest 76, glance 34, wind up 79, overshoots 31 and 78; eyes slid
  // 1.5 cells; pearl wire on the side face 3.5 cells behind the front corner; 31 frames, 7.74 s a cycle.
  // Palette: 0..5 the ECHO palette unchanged (2 is also the fold, the drape's fold and the mouth, 4 also the turban's rim
  // and the glint's tips, 5 also the side face in shadow); 6 white (the pearl's highlight, the catchlights, the glint),
  // 7 ultramarine (the wrap), 8 lead tin yellow (the cap and the drape), 9 pearl grey. Index 6 is not ping here, so
  // nothing in it goes through echoGlitch. Big tier: 31 frames of 3600 cells are 111600 bytes of firmware table, so it
  // ships only on boards built with SPLASH_BIG. One closure, so echoPearlEarring is the only name it adds to this scope.
  const echoPearlEarring = (() => {
    const N = 60, K = 3;                                           // lattice; the family pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, SHADE = 5, WHITE = 6, BLUE = 7, YELLOW = 8, PEARL = 9;
    const AXIS = 28.5;                                             // panel col of the turning axis
    const TOP = 19, FAM = TOP - 12;                                // the head's top row; the family pose at 3x sits FAM rows lower
    const HALF_W = 16.5, HALF_D = 13.5;                            // the box: 11 cells across and 9 deep, at 3x
    const LIGHT = [-0.857, 0.514];                                 // the window light in view space [X, Z]: from the left
    const VIS = [TOP + 6, TOP + 11];                               // the visor band's rows (the family's)
    const EYE_U = [-9, 9];                                         // eye centres across the face: the far eye, the near eye
    const MOUTH = TOP + 16;                                        // the mouth's top row
    const EAR_Z = 10, EAR_ROW = TOP + 11;                          // the pearl's wire: depth on the side face, its top row
    const TURBAN = [TOP - 12, TOP + 5], BRIM = TOP - 2, DOME = 10.5;   // the turban's rows; where the dome starts; its height
    const hem = z => TOP + 3.5 + 1.5 * z / HALF_D;                 // the turban's lower edge: over the brow in front, higher behind
    const rad = d => d * Math.PI / 180;

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    const lit = (nx, nz) => nx * LIGHT[0] + nz * LIGHT[1] > 0;

    // The family pose at 3x; the front face reads its visor from here (the eyes are drawn on the panel, below).
    const FACE = upscale(echoPing(false), K);
    const faceAt = (u, r) => {
      const fr = r - FAM, fc = Math.floor(u + 31.5);
      const v = fr >= 0 && fr < N && fc >= 0 && fc < N ? FACE[fr][fc] : BODY;
      return v === VISOR || v === EYE ? VISOR : BODY;
    };

    // The solids in body space: x across (the creature's left is plus), z toward its front, rows down the panel.
    const box = (x0, x1, z0, z1, r0, r1, kind) => ({x0, x1, z0, z1, r0, r1, kind});
    const BOXES = [
      box(-HALF_W, HALF_W, -HALF_D, HALF_D, TOP, TOP + 29, 'body'),
      ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => box(15 * sx - 1.5, 15 * sx + 1.5, 7 * sz - 1.5, 7 * sz + 1.5, TOP + 30, TOP + 38, 'leg')),
      box(13.5, 16.5, -12, -9, TOP - 12, TOP - 1, 'stalk'), box(13.5, 16.5, -12, -9, TOP - 15, TOP - 13, 'tip'),
    ];
    // The view ray through panel offset X, the body turned th (cs, sn its cosine and sine, both over 0): its point at
    // depth 0 is (X cs, -X sn) in body space and it runs along (sn, cs), depth growing toward the viewer. The cell shows
    // the face where the ray, coming from the viewer, enters the box: the front or the left side.
    function hitBox(X, cs, sn, b) {
      const px = X * cs, pz = -X * sn;
      const ax = (b.x0 - px) / sn, bx = (b.x1 - px) / sn, az = (b.z0 - pz) / cs, bz = (b.z1 - pz) / cs;
      const lo = Math.max(ax, az), hi = Math.min(bx, bz);
      if (lo > hi) return null;
      return bx < bz ? {z: hi, face: 'side', u: pz + hi * cs} : {z: hi, face: 'front', u: px + hi * sn};
    }
    // A rounded solid at one row: |x / rx|^p + |(z - cz) / rz|^p <= 1. Convex along the ray, so a ternary search finds
    // its deepest point and a bisection the near edge; the answer carries the body point and how lit its surface is.
    const pw = (a, p) => Math.pow(Math.abs(a), p);
    function hitRound(X, cs, sn, rx, rz, cz, p) {
      if (!hitBox(X, cs, sn, {x0: -rx, x1: rx, z0: cz - rz, z1: cz + rz})) return null;
      const px = X * cs, pz = -X * sn;
      const f = t => pw((px + t * sn) / rx, p) + pw((pz + t * cs - cz) / rz, p);
      let lo = -40, hi = 40;
      for (let i = 0; i < 32; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
      let a = (lo + hi) / 2, b = 40;
      if (f(a) > 1) return null;
      for (let i = 0; i < 22; i++) { const m = (a + b) / 2; if (f(m) <= 1) a = m; else b = m; }
      const x = px + a * sn, z = pz + a * cs;
      const gx = Math.sign(x) * pw(x / rx, p - 1) / rx, gz = Math.sign(z - cz) * pw((z - cz) / rz, p - 1) / rz;
      const nX = gx * cs - gz * sn, nZ = gx * sn + gz * cs, nl = Math.hypot(nX, nZ) || 1;
      return {z: a, x, zb: z, s: (nX * LIGHT[0] + nZ * LIGHT[1]) / nl};
    }

    // The turban, a row at a time: below BRIM the wrap, tight round the brow and billowing toward the brim; above it the
    // dome, rounder, leaning back. [rx, rz, cz, p]
    const turbanShape = r => {
      if (r >= BRIM) {
        const t = (r - BRIM) / (TURBAN[1] - BRIM);
        return [20 - 2.4 * t, 17 - 2.4 * t, 0, 4 + 8 * t];
      }
      const h = (BRIM - r) / DOME, s = Math.sqrt(Math.max(0, 1 - h * h));
      return [20.1 * s, 17.1 * s, -3 * h, 2.6];
    };
    // The split between the blue wrap and the yellow cap, as a row for each depth: the yellow comes down lower behind.
    const splitRow = z => TURBAN[0] + 3 + (18 - z) / 3.2;
    function turbanInk(h, r) {
      const d = r - splitRow(h.zb);                                // rows under the split
      if (d < 0) return YELLOW;
      if (d < 1 && h.s > 0.62) return PING;                        // the rim on the wrap's top edge, where the light is brightest
      const f = d + 0.06 * h.x;                                    // the fold follows the split, sloping gently across the brow
      return f >= 5 && f < 6 ? EYE : BLUE;
    }

    // The drape: the yellow cloth falling from the cap's back corner, behind the head, flaring toward a slanted hem and
    // swinging sway cells there.
    const DRAPE = [TOP - 4, TOP + 25];
    function drape(g, cs, sn, sway) {
      const Xa = 15 * cs + 15 * sn;                                // the cap's back corner on the panel
      for (let r = DRAPE[0]; r <= DRAPE[1]; r++) {
        const k = (r - DRAPE[0]) / (DRAPE[1] - DRAPE[0]), sw = sway * k * k;
        let right = Xa + 4.5 + 4 * k + sw;
        if (r > DRAPE[1] - 3) right -= (r - (DRAPE[1] - 3)) * 1.5;   // the hem, cut on a slant
        const fold = Xa + 2 + 2.5 * k + sw;
        for (let c = 0; c < N; c++) {
          const X = c + 0.5 - AXIS;
          if (X > Xa - 8 && X <= right) g[r][c] = Math.abs(X - fold) < 0.5 && r > TOP + 3 ? EYE : YELLOW;
        }
      }
    }

    // The solids, a cell at a time, the nearest hit winning; cached per turn and ping, since the glance's holds reuse them.
    const cache = new Map();
    function solids(th, ping) {
      const key = th + (ping ? ' ping' : '');
      if (cache.has(key)) return cache.get(key);
      const cs = Math.cos(rad(th)), sn = Math.sin(rad(th));
      const litSide = lit(cs, sn);
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const X = c + 0.5 - AXIS;
        let best = -Infinity, v = 0;
        for (const b of BOXES) {
          if (r < b.r0 || r > b.r1) continue;
          const h = hitBox(X, cs, sn, b);
          if (!h || h.z <= best) continue;
          best = h.z;
          v = b.kind === 'body' ? (h.face === 'front' ? faceAt(h.u, r) : litSide ? BODY : SHADE)
            : b.kind === 'leg' ? SHADE : b.kind === 'tip' && ping ? PING : BODY;
        }
        if (r >= TURBAN[0] && r <= TURBAN[1]) {
          const [rx, rz, cz, p] = turbanShape(r);
          const h = rx > 0.5 ? hitRound(X, cs, sn, rx, rz, cz, p) : null;
          if (h && h.z > best && r <= hem(h.zb)) { best = h.z; v = turbanInk(h, r); }
        }
        if (best > -Infinity) g[r][c] = v;
      }
      cache.set(key, g);
      return g;
    }

    // The eyes, on the panel at their projected place, slid du cells along the face; 'open', 'half' or 'shut'. The near
    // eye (the creature's left, on the viewer's right) is a cell wider than the far one once the face turns, and an open
    // eye 2 or more cells wide takes a white catchlight high on the window side.
    function eyes(g, cs, sn, du, state) {
      EYE_U.forEach((u0, k) => {
        const w = Math.max(1, Math.round(3 * cs + (k ? 0.25 : -0.45)));
        const X = (u0 + du) * cs - HALF_D * sn, c0 = Math.round(AXIS + X - w / 2);
        const rows = state === 'shut' ? [VIS[1] - 1] : state === 'half' ? [VIS[1] - 2, VIS[1] - 1, VIS[1]] : [0, 1, 2, 3, 4, 5].map(i => VIS[0] + i);
        const c1 = state === 'shut' ? c0 - 1 : c0, c2 = state === 'shut' ? c0 + w : c0 + w - 1;
        for (const r of rows) for (let c = c1; c <= c2; c++) if (inside(r, c) && g[r][c] === VISOR) g[r][c] = EYE;
        if (state === 'open' && w > 1 && g[VIS[0] + 1][c0] === EYE) g[VIS[0] + 1][c0] = WHITE;
      });
    }
    // The mouth under the face's middle, 4 cells across: 'shut' a row, 'parted' two.
    function mouth(g, cs, sn, state) {
      if (!state) return;
      const c0 = Math.round(AXIS - HALF_D * sn - 2);
      for (const r of state === 'parted' ? [MOUTH, MOUTH + 1] : [MOUTH]) for (let c = c0; c < c0 + 4; c++) if (inside(r, c) && g[r][c] === BODY) g[r][c] = EYE;
    }
    // The pearl: a wire from the side face, leaning with the swing, and the drop dx cells off it; the glint, a white
    // star with cyan tips in three sizes, centred on the drop's highlight.
    const DROP = ['.ggg.', 'gwwgg', 'gwggg', 'ggggg', '.ggg.'];
    const GLINT = [['.w.', 'www', '.w.'], ['...c...', '...w...', '..www..', 'cwwwwwc', '..www..', '...w...', '...c...'],
      ['....c....', '....w....', '....w....', '...www...', 'cwwwwwwwc', '...www...', '....w....', '....w....', '....c....']];
    function pearl(g, cs, sn, dx, glint) {
      const hc = Math.round(AXIS + HALF_W * cs - EAR_Z * sn - 0.5);
      put(g, EAR_ROW, hc, PEARL); put(g, EAR_ROW + 1, hc + Math.round(dx / 2), PEARL);
      const c0 = hc - 2 + dx;
      DROP.forEach((line, i) => [...line].forEach((ch, j) => { if (ch !== '.') put(g, EAR_ROW + 2 + i, c0 + j, ch === 'w' ? WHITE : PEARL); }));
      if (glint) {
        const art = GLINT[glint - 1], m = (art.length - 1) / 2;
        art.forEach((line, i) => [...line].forEach((ch, j) => { if (ch !== '.') put(g, EAR_ROW + 3 + i - m, c0 + 1 + j - m, ch === 'w' ? WHITE : PING); }));
      }
    }

    // A frame. o: th the turn in degrees; du the eyes slid along the face; eyes 'open', 'half' or 'shut'; mouth
    // undefined, 'shut' or 'parted'; ping; pdx the pearl's swing; tdx the drape's; glint 0 (none) to 3. The drape goes
    // down first, so the head covers all of it but what hangs clear.
    function frame(o) {
      const cs = Math.cos(rad(o.th)), sn = Math.sin(rad(o.th));
      const g = blank();
      drape(g, cs, sn, o.tdx || 0);
      const s = solids(o.th, !!o.ping);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (s[r][c]) g[r][c] = s[r][c];
      eyes(g, cs, sn, o.du || 0, o.eyes || 'open');
      mouth(g, cs, sn, o.mouth);
      pearl(g, cs, sn, o.pdx || 0, o.glint || 0);
      return g;
    }

    const frames = [], F = (hold, o) => frames.push({hold, grid: frame(o)});
    const REST = 76, LOOK = 34, GAZE = 1.5;
    // Rest, turned away; the wind up; the turn round to the viewer, the eyes leading, the pearl and the drape lagging.
    F(1500, {th: REST});
    F(120, {th: 79});
    F(70, {th: 71, pdx: -1, tdx: -1});
    F(70, {th: 60, pdx: -1, tdx: -2, du: 0.75});
    F(70, {th: 49, pdx: -2, tdx: -3, du: GAZE});
    F(80, {th: 40, pdx: -1, tdx: -2, du: GAZE});
    F(100, {th: 33, du: GAZE});
    F(120, {th: 31, pdx: 1, tdx: 2, du: GAZE});                    // past the mark; the pearl and the drape swing past
    // The glance: the look lands with a ping; the glint; the lips part; a blink; a ping; the lips close.
    const look = o => ({th: LOOK, du: GAZE, mouth: 'shut', ...o});
    F(140, look({ping: true, pdx: 1, tdx: 1}));
    F(600, look({}));
    for (const [hold, glint] of [[80, 1], [120, 2], [140, 3], [100, 2], [80, 1]]) F(hold, look({glint}));
    F(350, look({}));
    F(900, look({mouth: 'parted'}));
    F(60, look({mouth: 'parted', eyes: 'half'}));
    F(110, look({mouth: 'parted', eyes: 'shut'}));
    F(60, look({mouth: 'parted', eyes: 'half'}));
    F(1000, look({mouth: 'parted'}));
    F(140, look({mouth: 'parted', ping: true}));
    F(700, look({mouth: 'parted'}));
    F(300, look({}));
    // Back: the eyes lead away, then the turn to the left, the pearl and the drape lagging; it settles into the rest.
    F(160, look({du: -1}));
    F(80, {th: 40, du: -1, pdx: 1, mouth: 'shut'});
    F(70, {th: 50, pdx: 1, tdx: 1});
    F(70, {th: 61, pdx: 2, tdx: 2});
    F(80, {th: 71, pdx: 1, tdx: 3});
    F(110, {th: 78, pdx: -1, tdx: 1});
    F(160, {th: REST, pdx: -1, tdx: -1});

    return {
      name: 'ECHO · pearl earring', key: 'echo_pearl_earring', fwname: 'echo pearl earring', category: 'Idle', size: N,
      // Big tier, like the other HD cells: 31 frames of 3600 bytes (111600 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: "Proposal, 60 cell lattice (8 px cells, the creature at 3x, turning), a homage to Vermeer's Girl with a Pearl Earring (about 1665, public domain): on a dark ground the creature stands turned away to the left in near profile, wearing a turban wrapped blue round its brow under a yellow cap whose drape falls behind, a big pearl hanging at the side of its head, then winds up and turns over its shoulder toward the viewer in five quick frames, its eyes leading, its side dropping into shadow as its face comes round into the light from the left, the pearl and the drape swinging behind the turn; the look lands with an antenna ping, the eyes slid toward the viewer with a catchlight in each, the pearl catches a white glint that swells into a star and fades, the lips part, it blinks, pings again, closes its lips and turns back, the eyes leading, to rest in profile; judge whether the turn reads as a look over the shoulder rather than a box spinning, whether the turban and the pearl say Vermeer at a glance, and whether it is still this creature.",
      // 0 transparent, 1 body, 2 eyes, mouth and folds, 3 visor, 4 ping (antenna tip, the turban's rim, the glint's tips),
      // 5 legs and the side face in shadow, 6 white (highlight, catchlights, glint), 7 ultramarine, 8 lead tin yellow,
      // 9 pearl grey
      palette: [...ECHO_PALETTE.slice(0, 6), '#eafffb', '#2f56c9', '#e8bf4f', '#a9b3b8'],
      frames,
    };
  })();

  L.register([echoPearlEarring]);
})(typeof window !== 'undefined' ? window : globalThis);
