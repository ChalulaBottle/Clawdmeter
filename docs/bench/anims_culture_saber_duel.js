// Culture creatures: the ECHO creature plays the set pieces everyone knows (operator, 2026-10-02: famous paintings,
// memes and pop culture for the animation list, "get crazy get creative"). Drawn from scratch in code on the ECHO
// base; the creature plays every role, and a set piece lends its format only: the setting, the composition and the
// gesture, never its characters, its words or its art.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {ECHO_PALETTE} = L;

  // ECHO · saber duel: the laser sword duel. Generic glowing blades and the duel's gestures only, never a film's names,
  // characters, costumes or sounds; two ECHO creatures play both parts, one with a cyan blade (the ping's own colour)
  // and one with a magenta one. 60 cell lattice, 8 px cells on the 480 panel. Two creatures at 3x would need 90 cells
  // across, so they stand at 1.5x: the family's front pose rebuilt as boxes (torso, arm stubs, legs, antenna) so the
  // same model can turn for the spin, in the family's proportions at 1.5x, rounded to whole cells. The left one is
  // mirrored, so both antennas stand on the outside and the middle stays clear for the blades; they look at each other.
  //   blades    a white core, the blade's colour either side and a halo in a dim shade of it, by distance from the
  //             blade's centre line, so a blade reads as light at any angle; the halo takes empty cells only, so it
  //             never eats a silhouette, and it swells on the hum and flares on the clash. A white hilt out of the top
  //             of the fist, its pommel end hidden inside the fist; unlit, the emitter end glows faintly in its blade's
  //             colour.
  //   en garde  the loop anchor: both lit, the blades leaning in like a tall A with a dark gap between the tips, the
  //             halos humming; both breathe down a row and back, the left one blinks.
  //   cut       both draw back into a V, then cut, each blade's line dotted behind it at the angles it swept.
  //   clash     the blades meet mid blade in an X: a white burst at the cross, sparks of both colours flying out over
  //             two more frames, the halos flaring, a white flash on the floor, both leaning in with wide eyes.
  //   lock      the right one presses in until the cross slides down to the hilts, the hands raised so the cross sits
  //             over the heads; sparks crackle at the cross and drip, the eyes narrow, the antennas ping cyan and
  //             magenta in turn.
  //   push      the left one drives the right one back, 2 cols and then 1 and 1 as the skid bites, the cross moving
  //             with them; dust kicks up at its trailing heel, billows and thins.
  //   spin      the right one spins out of it where the push left it, 2 cols in from its mark so its blade and halo
  //             stay on the panel at the half turn: a full turn in 45 degree steps with its blade held straight up, a
  //             hop, white whoosh marks round its chest; the left one steps back to its mark. The visor band and an
  //             eye go round its head, painted back over the raised arm while the arm is in front (acrobat HD's way
  //             with its near arm), so the face shows in every frame but one: the half turn, its plain back for one
  //             90 ms frame, kept on purpose as the cue that it turned right round.
  //   reset     en garde again, the right one settling back onto its mark over two frames with a magenta ping; both
  //             blades retract into their hilts, both bow with happy eyes and rest holding unlit hilts, one blinks.
  //   ignite    the left one raises its hilt and the blade snaps out in three frames, a white spark on its leading edge
  //             and a cyan antenna ping; then the right one in magenta; the loop opens on the face off.
  // The floor line catches each lit blade's light under its span. Loop: 41 frames, 7.46 s; the face off, the lock and
  // the rest hold longest, the cut, the clash and the spin run at 70 to 130 ms a frame.
  // Palette: 0..5 the ECHO palette unchanged (4, the ping, is also the cyan blade and the left antenna's ping; 5, the
  // feet, also the floor line); 6 the house white, #eafffb (blade cores, hilts, sparks, the burst, whoosh marks, the
  // skid dust, the floor's flash); 7 the house magenta, #ff5fd2 (the magenta blade, the right antenna's ping, sparks);
  // 8 dim cyan and 9 dim magenta (the halos, the trails, the floor's light, the unlit emitters). Index 6 is not ping
  // here, so nothing goes through echoGlitch. Big tier: 41 frames of 3600 cells are 147600 bytes of firmware table, so
  // it ships only on boards built with SPLASH_BIG. One closure, so echoSaberDuel is the only name it adds; registered
  // at the end of this file.
  const echoSaberDuel = (() => {
    const N = 60;
    const BODY = 1, EYE = 2, VISOR = 3, CYAN = 4, FEET = 5, WHITE = 6, MAG = 7, CYAN_GLOW = 8, MAG_GLOW = 9;
    // Constants the cell is judged on.
    const FLOOR = 52;                                              // the floor line; the feet stand on the row above
    const TOP = FLOOR - 19;                                        // the torso's top row: torso 15 rows, legs 4
    const MARK = [12.5, 47.5];                                     // torso centre cols at the marks, left and right
    // Cells along the blade line from the fist. The hilt is 0.8 either side of its line and drawn outside the fist only,
    // so with HILT_BACK + 0.8 no more than FIST its pommel end stays inside the fist and never pokes out under it.
    const BLADE = 18, HILT_FWD = 4.4, HILT_BACK = 0.7, FIST = 1.5;
    // Blade radii from the centre line: white core, colour, halo; and the halo swelling on the hum and on the clash.
    // A line on a cell boundary has cells at 0.5, 1.5 and 2.5, one through a cell centre at 0, 1 and 2, so these
    // give core, colour and halo at every alignment, never core straight into halo.
    const CORE = 0.6, EDGE = 1.6, GLOW = 2.55, GLOW_HUM = 2.85, GLOW_FLARE = 3.2;
    const ARM_R = 1.9, SHOULDER = [7, -8];                         // the sword arm: its half width, the shoulder
    const rad = d => d * Math.PI / 180;

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    const fill = (g, r, c, v) => { if (inside(r, c) && !g[r][c]) g[r][c] = v; return g; };
    const seg = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };
    const INK = {w: WHITE, c: CYAN, m: MAG, k: EYE, f: FEET};
    const stamp = (g, art, r0, c0, only = false) => art.forEach((line, dr) => [...line].forEach((ch, dc) => {
      if (ch !== '.') (only ? fill : put)(g, r0 + dr, c0 + dc, INK[ch]);
    }));

    // The creature at 1.5x, in creature space: y rows down from the torso's top, x across from the torso's centre,
    // z toward the viewer; the sword side is -x. Boxes, so the same model turns for the spin; at turn 0 it is the
    // family's front pose in the family's proportions at 1.5x, rounded to whole cells (no exact 1.5x exists: the
    // torso's 11 cols come to 16.5 and round to 17, the 1 x 2 eyes become 2 x 3): torso 17 x 15, visor rows 3..5 cols
    // 2..14, eyes 2 x 3 at cols 3 and 12, arm stubs 3 x 4 on rows 5..8 with a claw cell under the outer col on rows
    // 9..10, legs 2 x 4 at cols 0, 5, 10 and 15, antenna 2 wide on the torso's last two cols, a stalk of 3 rows and a
    // tip of 2.
    const box = (x0, x1, z0, z1, y0, y1, kind) => ({x: [x0, x1], z: [z0, z1], y: [y0, y1], kind});
    const TORSO = box(-8.5, 8.5, -6.5, 6.5, 0, 15, 'torso');
    const ARM_IN = [box(-11.5, -8.5, -1.5, 1.5, 5, 9, 'arm'), box(-11.5, -10.5, -1.5, 1.5, 9, 11, 'arm')];
    const ARM_OUT = [box(8.5, 11.5, -1.5, 1.5, 5, 9, 'arm'), box(10.5, 11.5, -1.5, 1.5, 9, 11, 'arm')];
    // The legs stand two in front and two behind, so a side view shows a pair; at turn 0 only x shows.
    const LEGS = [[-7.5, 2.5], [-2.5, -2.5], [2.5, -2.5], [7.5, 2.5]].map(([x, z]) => box(x - 1, x + 1, z - 1, z + 1, 15, 19, 'leg'));
    const ANTENNA = box(6.5, 8.5, -1, 1, -5, 0, 'antenna');
    // The frontmost surface of box b on the screen column xs at turn (cs, sn): [depth, face] or null.
    // x = xs cs - z' sn, z = xs sn + z' cs; faces 'in' (x min), 'out' (x max), 'front' (z max), 'back' (z min).
    function hit(b, xs, cs, sn) {
      let lo = -Infinity, hi = Infinity, face = null;
      const upper = (v, f) => { if (v < hi) { hi = v; face = f; } };
      const lower = v => { if (v > lo) lo = v; };
      if (Math.abs(sn) < 1e-9) { const x = xs * cs; if (x < b.x[0] || x > b.x[1]) return null; }
      else if (sn > 0) { upper((xs * cs - b.x[0]) / sn, 'in'); lower((xs * cs - b.x[1]) / sn); }
      else { upper((xs * cs - b.x[1]) / sn, 'out'); lower((xs * cs - b.x[0]) / sn); }
      if (Math.abs(cs) < 1e-9) { const z = xs * sn; if (z < b.z[0] || z > b.z[1]) return null; }
      else if (cs > 0) { upper((b.z[1] - xs * sn) / cs, 'front'); lower((b.z[0] - xs * sn) / cs); }
      else { upper((b.z[0] - xs * sn) / cs, 'back'); lower((b.z[1] - xs * sn) / cs); }
      return hi >= lo ? [hi, face] : null;
    }
    // Eyes on the visor, in face cells: each eye's left col (at look 0) and a bitmap from the visor's top row. Wide and
    // happy are wider than the slits, so those frames look straight ahead (look 0), or the visor's end clips them.
    const EYE_U = [-5.5, 3.5];
    const EYES = {
      open: {du: 0, art: ['kk', 'kk', 'kk']},
      blink: {du: 0, art: ['..', '..', 'kk']},
      narrow: {du: 0, art: ['..', 'kk', 'kk']},
      wide: {du: -0.5, art: ['kkk', 'kkk', 'kkk']},
      happy: {du: -1, art: ['....', '.kk.', 'k..k']},
    };
    const eyeAt = (u, y, state, look) => {
      const e = EYES[state], i = Math.floor(y - 3);
      if (i < 0 || i >= e.art.length) return false;
      return EYE_U.some(u0 => { const j = Math.floor(u - (u0 + look + e.du)); return j >= 0 && j < e.art[i].length && e.art[i][j] === 'k'; });
    };
    // The creature into g. o: cx (torso centre col, always a half so the cells sample the boxes off their edges),
    // side (0 left, mirrored; 1 right), lean (cols the upper body leans, on the panel), dip (rows the upper body
    // sinks, the legs planted), lift (rows off the floor), th (turn, degrees), lit (the antenna tip's colour or 0),
    // eyes, look (face cells toward the other, negative), stub (the sword side's own arm stub shows).
    function body(g, o) {
      const t = rad(o.th || 0), cs = Math.cos(t), sn = Math.sin(t), s = o.side ? 1 : -1;
      const boxes = [TORSO, ...ARM_OUT, ...LEGS, ANTENNA, ...(o.stub ? ARM_IN : [])];
      const top = TOP - (o.lift || 0), dip = o.dip || 0;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          let best = null;
          for (const b of boxes) {
            const leg = b.kind === 'leg', y = r + 0.5 - top - (leg ? 0 : dip);   // the upper body dips, the legs stay
            if (y < b.y[0] || y >= b.y[1]) continue;
            const xs = s * (c + 0.5 - o.cx - (leg ? 0 : (o.lean || 0)));
            const h = hit(b, xs, cs, sn);
            if (h && (!best || h[0] > best.z)) best = {z: h[0], face: h[1], b, xs, y};
          }
          if (!best) continue;
          let v = BODY;
          const {b, face, xs, z, y} = best;
          if (b.kind === 'leg') v = FEET;
          else if (b.kind === 'antenna') v = y < -3 && o.lit ? o.lit : BODY;
          else if (b.kind === 'torso' && y >= 3 && y < 6) {
            if (face === 'front') {
              const u = xs * cs - z * sn;                            // across the front face
              if (u >= -6.5 && u <= 6.5) v = eyeAt(u, y, o.eyes || 'open', o.look === undefined ? -1 : o.look) ? EYE : VISOR;
            } else if (face === 'in' || face === 'out') {
              // a side face, seen only in the turn: the band wraps round its front half, the near eye on it
              const w = xs * sn + z * cs;                            // back to front along the side
              if (w >= 0) v = w >= 2.5 && w < 4.5 ? EYE : VISOR;
            }
          }
          g[r][c] = v;
        }
      }
    }
    // A creature-space point on the panel.
    const P = (o, y, x) => [TOP - (o.lift || 0) + (o.dip || 0) + y, o.cx + (o.lean || 0) + (o.side ? x : -x)];
    // The blade's direction on the panel: ang degrees from straight up, toward the other positive.
    const dirOf = (o, ang) => [-Math.cos(rad(ang)), (o.side ? -1 : 1) * Math.sin(rad(ang))];

    // The sword arm, the hilt and the fist on the panel: a capsule from the shoulder sh to the hand, the hilt a white
    // bar through the fist along d, the fist over its grip. Behind the body (empty cells only), or in front of it with
    // no crease, the body's own teal over the body, as acrobat HD draws its near arm. Returns the blade's emitter and
    // direction.
    function armAt(g, sh, hand, d, front, armR = ARM_R, cap = 0) {
      const lay = blank();
      const pom = [hand[0] - d[0] * HILT_BACK, hand[1] - d[1] * HILT_BACK], emi = [hand[0] + d[0] * HILT_FWD, hand[1] + d[1] * HILT_FWD];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const y = r + 0.5, x = c + 0.5;
        if (Math.min(seg(y, x, sh, hand) - armR, Math.hypot(y - hand[0], x - hand[1]) - FIST) <= 0) lay[r][c] = BODY;
        if (seg(y, x, pom, emi) <= 0.8 && Math.hypot(y - hand[0], x - hand[1]) > FIST) {
          // the hilt; unlit, its emitter end glows faintly in its blade's colour
          const t = (y - hand[0]) * d[0] + (x - hand[1]) * d[1];
          lay[r][c] = cap && t > HILT_FWD - 1.3 ? cap : WHITE;
        }
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (lay[r][c]) (front ? put : fill)(g, r, c, lay[r][c]);
      return {p: emi, d, front};
    }
    const swordArm = (g, o) => armAt(g, P(o, ...SHOULDER), P(o, ...o.pose.hand), dirOf(o, o.pose.ang), false, ARM_R, o.len ? 0 : (o.side ? MAG_GLOW : CYAN_GLOW));
    // The spin's arm: raised beside the head, the blade straight up, turning with the body (the same turn as the
    // boxes); in front of the body while the hand is nearer the viewer than the torso's middle, else behind it. In
    // front it would cover the visor band and the near eye, so scene() paints those back over it.
    const SPIN_SH = [7, -8.5, 0], SPIN_HAND = [-1.5, -9.5, 1.5];    // [y, x, z] in creature space
    function spinArm(g, o) {
      const t = rad(o.th), cs = Math.cos(t), sn = Math.sin(t);
      const on = ([y, x, z]) => [TOP - (o.lift || 0) + (o.dip || 0) + y, o.cx + (o.lean || 0) + (o.side ? 1 : -1) * (x * cs + z * sn)];
      const depth = -SPIN_HAND[1] * sn + SPIN_HAND[2] * cs, hand = on(SPIN_HAND);
      hand[1] = Math.floor(hand[1]) + 0.5;                         // a straight up blade on a cell centre: one core col
      return armAt(g, on(SPIN_SH), hand, [-1, 0], depth > 0, 1.6);
    }
    // Whoosh: a white arc round the turning body at chest height, trailing the turn, on its near half only.
    function whoosh(g, cx, cy, th) {
      for (let a = th - 150; a <= th - 50; a += 4) {
        const t = rad(a), r = Math.round(cy + 3.2 * Math.cos(t)), c = Math.floor(cx + 13.5 * Math.sin(t));
        if (Math.cos(t) > 0.1) fill(g, r, c, WHITE);
      }
    }

    // A blade: cells within CORE of the line white, within EDGE its colour, within glow the halo (empty cells only).
    // The base is flat (nothing behind the emitter), the tip round.
    function bladeCells(bl, len, glow) {
      const out = [];
      const q = [bl.p[0] + bl.d[0] * len, bl.p[1] + bl.d[1] * len];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const y = r + 0.5, x = c + 0.5;
        if ((y - bl.p[0]) * bl.d[0] + (x - bl.p[1]) * bl.d[1] < 0) continue;
        const dist = seg(y, x, bl.p, q);
        if (dist <= glow) out.push([r, c, dist <= CORE ? 2 : dist <= EDGE ? 1 : 0]);
      }
      return out;
    }

    // Sparks.
    const BURST = [
      ['....w....', '.m..w..c.', '..m.w.c..', '...www...', 'wwwwwwwww', '...www...', '..c.w.m..', '.c..w..m.', '....w....'],
      ['.....w.....', '..m.....c..', '...........', 'm....w....c', '....w.w....', 'w..w...w..w', '....w.w....', 'c....w....m', '...........', '..c.....m..', '.....w.....'],
      ['......w......', '.............', '..m.......c..', '.............', '.............', '.............', 'w.....w.....w', '.............', '.............', '.............', '..c.......m..', '.............', '......w......'],
    ];
    const CRACKLE = [
      ['..w..', '.www.', 'wwwww', '.www.', '..w..'],
      ['w...m', '.w.w.', '..w..', '.w.w.', 'c...w'],
      ['.c.w.', 'w.w..', '.www.', '..w.w', '.w.m.'],
    ];
    const art = (g, a, r, c) => stamp(g, a, Math.round(r - (a.length - 1) / 2), Math.round(c - (a[0].length - 1) / 2));
    // Skid dust, 3 rows: the kick at the heel, a billow, the same spread thin.
    const PUFF = [['..w..', '.www.', 'wwwww'], ['..ww.w.', '.wwwwww', 'wwwwwww'], ['w..w.w..w', '.w.w.w.w.', 'w.w.w.w.w']];
    const SNAP = ['.w.', 'www', '.w.'];                           // the leading edge of a blade snapping out

    // Where two blades' lines cross, on the panel.
    function crossOf(a, b) {
      const det = -a.d[0] * b.d[1] + a.d[1] * b.d[0], dy = b.p[0] - a.p[0], dx = b.p[1] - a.p[1];
      const t = (-dy * b.d[1] + dx * b.d[0]) / det;
      return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t];
    }

    // A scene. s: {L, R} creature states {cx, lean, dip, lift, th, lit, eyes, look, pose (the sword arm; none: the
    // stub), len (blade length, 0 unlit), ghost (angles the blade swept through), spin (the arm up through the turn)};
    // glow (halo radius); fx: burst k or crackle k (at the blades' cross), drops [[dr, dc, ink]] (from the cross),
    // snap [side] (the blade's leading edge), dust [[bottom row, right col, puff]], whoosh [cx, row, turn].
    function scene(s) {
      const g = blank();
      for (let c = 0; c < N; c++) g[FLOOR][c] = FEET;
      const who = [{...s.L, side: 0}, {...s.R, side: 1}];
      for (const o of who) body(g, {...o, stub: !o.pose && !o.spin});
      const blades = [];
      for (const o of who) {
        if (o.pose) blades.push({...swordArm(g, o), o});
        else if (o.spin) {
          blades.push({...spinArm(g, o), o});
          // acrobat HD's way: a fresh pass of the turning body, and its visor band and eyes go back over the arm, so
          // the face shows whatever the arm does
          const face = blank();
          body(face, {...o, stub: false});
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (face[r][c] === VISOR || face[r][c] === EYE) g[r][c] = face[r][c];
        }
      }
      const fx = s.fx || {};
      if (fx.whoosh) whoosh(g, ...fx.whoosh);
      const ink = o => (o.side ? [MAG, MAG_GLOW] : [CYAN, CYAN_GLOW]);
      // the cut's trail: the blade's centre line at the angles it swept, dotted, the older one in its halo colour and
      // the newer in its own, behind everything (light left on the eye, not a shadow)
      for (const bl of blades) (bl.o.ghost || []).forEach((a, i, all) => {
        const hand = P(bl.o, ...bl.o.pose.hand), d = dirOf(bl.o, a);
        const gb = {p: [hand[0] + d[0] * (HILT_FWD + 3), hand[1] + d[1] * (HILT_FWD + 3)], d};
        for (const [r, c, lv] of bladeCells(gb, bl.o.len - 3, 0.75)) if (lv && (r + c) % 2 === 0) fill(g, r, c, i === all.length - 1 ? ink(bl.o)[0] : ink(bl.o)[1]);
      });
      const cells = blades.map(bl => bladeCells(bl, bl.o.len || 0, s.glow || GLOW));
      // halos on empty cells first, then colour and core over everything (a blade behind the body: empty cells only)
      blades.forEach((bl, k) => { if (bl.o.len) for (const [r, c, lv] of cells[k]) if (lv === 0) fill(g, r, c, ink(bl.o)[1]); });
      blades.forEach((bl, k) => {
        if (!bl.o.len) return;
        for (const [r, c, lv] of cells[k]) {
          if (lv === 0) continue;
          const v = lv === 2 ? WHITE : ink(bl.o)[0];
          if (bl.o.spin && !bl.front) fill(g, r, c, v); else put(g, r, c, v);
        }
      });
      // the floor catches each lit blade's light under its span, the two dithered where they meet
      const span = cells.map((cl, k) => {
        if (!blades[k].o.len) return null;
        const cols = cl.filter(([, , lv]) => lv).map(([, c]) => c);
        return [Math.min(...cols) - 1, Math.max(...cols) + 1];
      });
      for (let c = 0; c < N; c++) {
        const lit = blades.map((bl, k) => span[k] && c >= span[k][0] && c <= span[k][1] ? ink(bl.o)[1] : 0).filter(Boolean);
        if (lit.length) g[FLOOR][c] = lit[c % lit.length];
      }
      if (fx.snap) for (const bl of blades) if (bl.o.side === fx.snap[0]) {
        const t = [bl.p[0] + bl.d[0] * bl.o.len, bl.p[1] + bl.d[1] * bl.o.len];
        art(g, SNAP, t[0], t[1]);
      }
      if (fx.burst !== undefined || fx.crackle !== undefined || fx.drops) {
        const [xr, xc] = crossOf(blades[0], blades[1]);
        if (fx.burst === 0) for (let c = Math.round(xc) - 5; c <= Math.round(xc) + 5; c++) put(g, FLOOR, c, WHITE);
        if (fx.burst !== undefined) art(g, BURST[fx.burst], xr, xc);
        if (fx.crackle !== undefined) art(g, CRACKLE[fx.crackle], xr, xc);
        for (const [dr, dc, ch] of fx.drops || []) put(g, Math.round(xr + dr), Math.round(xc + dc), INK[ch]);
      }
      // skid: a puff of dust kicked up off the floor at the trailing heel, its right end tucked behind the leg
      for (const [r, c, k] of fx.dust || []) stamp(g, PUFF[k], r - PUFF[k].length + 1, c - PUFF[k][0].length + 1, true);
      return g;
    }

    // The poses of the sword arm, in creature space: the hand [y, x] and the blade's angle from straight up, toward
    // the other positive.
    const POSE = {
      rest: {hand: [9, -11.5], ang: 30},                           // unlit: the hilt low, angled up toward the other
      guard: {hand: [3, -10.5], ang: 8},                           // en garde: the blades lean in, a tall A, tips apart
      wind: {hand: [0, -11], ang: -24},                            // drawn back over the shoulder, a V
      swing: {hand: [2.5, -11], ang: 14},                          // half way through the cut
      clash: {hand: [3, -10], ang: 40},                            // the cut lands: the blades cross mid blade
      lock: {hand: [-1, -11], ang: 42},                            // closed in, the cross down by the hilts, over the heads
    };
    const C = (cx, pose, len, more = {}) => ({cx, pose: POSE[pose], len, ...more});
    const [ML, MR] = MARK;

    const frames = [], F = (hold, s) => frames.push({hold, grid: scene(s)});
    // 1. En garde, the loop anchor: both lit, the halos humming, a blink.
    F(520, {L: C(ML, 'guard', BLADE), R: C(MR, 'guard', BLADE)});
    F(460, {L: C(ML, 'guard', BLADE, {dip: 1}), R: C(MR, 'guard', BLADE, {dip: 1}), glow: GLOW_HUM});
    F(90, {L: C(ML, 'guard', BLADE, {dip: 1, eyes: 'blink'}), R: C(MR, 'guard', BLADE, {dip: 1}), glow: GLOW_HUM});
    F(460, {L: C(ML, 'guard', BLADE), R: C(MR, 'guard', BLADE)});
    // 2. Wind up, the cut, the clash: a white burst where the blades cross.
    F(180, {L: C(ML, 'wind', BLADE), R: C(MR, 'wind', BLADE)});
    F(70, {L: C(ML, 'swing', BLADE, {ghost: [-12, 1]}), R: C(MR, 'swing', BLADE, {ghost: [-12, 1]})});
    F(80, {L: C(ML, 'clash', BLADE, {lean: 1, eyes: 'wide', look: 0}), R: C(MR, 'clash', BLADE, {lean: -1, eyes: 'wide', look: 0}), glow: GLOW_FLARE, fx: {burst: 0}});
    F(110, {L: C(ML, 'clash', BLADE, {lean: 1, eyes: 'wide', look: 0}), R: C(MR, 'clash', BLADE, {lean: -1, eyes: 'wide', look: 0}), fx: {burst: 1}});
    F(130, {L: C(ML, 'clash', BLADE, {lean: 1}), R: C(MR, 'clash', BLADE, {lean: -1}), fx: {burst: 2}});
    // 3. The lock: the right one presses in, the cross slides down to the hilts; sparks crackle and drip, the eyes
    // narrow, the antennas ping in turn.
    F(110, {L: C(ML + 1, 'lock', BLADE, {lean: 1, eyes: 'narrow'}), R: C(MR - 3, 'lock', BLADE, {lean: -1, eyes: 'narrow'}), fx: {crackle: 0}});
    F(110, {L: C(ML + 2, 'lock', BLADE, {lean: 1, eyes: 'narrow'}), R: C(MR - 6, 'lock', BLADE, {lean: -1, eyes: 'narrow'}), fx: {crackle: 1}});
    const DRIP = [[[3, -1, 'w'], [2, 2, 'm']], [[5, -1, 'w'], [4, 2, 'c'], [2, 0, 'w']], [[7, -2, 'c'], [6, 2, 'w'], [4, 0, 'm']], [[9, -2, 'w'], [8, 3, 'm'], [6, 1, 'w']]];
    for (let k = 0; k < 4; k++) F(200, {L: C(ML + 2, 'lock', BLADE, {lean: 1, eyes: 'narrow', lit: k % 2 ? 0 : CYAN}), R: C(MR - 6, 'lock', BLADE, {lean: -1, eyes: 'narrow', lit: k % 2 ? MAG : 0}), glow: k % 2 ? GLOW : GLOW_HUM, fx: {crackle: (k + 2) % 3, drops: DRIP[k]}});
    // 4. The push: the left one drives the right one back, 2 cols and then 1 and 1 as the skid bites, to 2 cols short
    // of its mark (the spin needs the room at the panel's edge); dust kicks up at its trailing heel, billows and thins.
    [2, 3, 4].forEach((d, i) => {
      const cx = MR - 6 + d;                                       // its trailing leg's right col is cx - 7.5
      F(110, {L: C(ML + 2 + d, 'lock', BLADE, {lean: 1, eyes: 'narrow'}), R: C(cx, 'lock', BLADE, {lean: 1, eyes: 'wide', look: 0}), fx: {crackle: (i + 1) % 3, dust: [[FLOOR - 1, Math.floor(cx - 7), i]]}});
    });
    // 5. The spin: the right one spins out of it where the push left it, 2 cols in from its mark so the blade and its
    // halo stay on the panel at the half turn, a full turn with its blade held up, while the left one steps back.
    const SPIN_X = MR - 2, BACK = [5, 4, 3, 2, 1, 0, 0].map(d => ML + d);
    for (let k = 1; k < 8; k++) F(90, {L: C(BACK[k - 1], 'guard', BLADE), R: {cx: SPIN_X, th: 45 * k, spin: true, len: BLADE, look: 0, lift: k > 2 && k < 6 ? 1 : 0}, fx: {whoosh: [SPIN_X, TOP + 8 - (k > 2 && k < 6 ? 1 : 0), 45 * k]}});
    // 6. En garde again, the right one settling back onto its mark over two frames, its antenna pinging; then the
    // reset: both blades retract, a bow, rest, a blink.
    F(260, {L: C(ML, 'guard', BLADE), R: C(MR - 1, 'guard', BLADE, {lit: MAG})});
    F(300, {L: C(ML, 'guard', BLADE), R: C(MR, 'guard', BLADE)});
    F(70, {L: C(ML, 'guard', 11), R: C(MR, 'guard', 11)});
    F(70, {L: C(ML, 'guard', 4), R: C(MR, 'guard', 4)});
    F(500, {L: C(ML, 'rest', 0, {eyes: 'happy', look: 0, dip: 1, lean: 1}), R: C(MR, 'rest', 0, {eyes: 'happy', look: 0, dip: 1, lean: -1})});
    F(600, {L: C(ML, 'rest', 0), R: C(MR, 'rest', 0)});
    F(80, {L: C(ML, 'rest', 0), R: C(MR, 'rest', 0, {eyes: 'blink'})});
    F(380, {L: C(ML, 'rest', 0), R: C(MR, 'rest', 0)});
    // 7. Ignite: the left one raises its hilt and the blade snaps out with a cyan ping, then the right one, magenta.
    F(160, {L: C(ML, 'guard', 0), R: C(MR, 'rest', 0)});
    for (const n of [6, 12]) F(60, {L: C(ML, 'guard', n, {lit: CYAN}), R: C(MR, 'rest', 0), fx: n === 6 ? {snap: [0]} : {}});
    F(260, {L: C(ML, 'guard', BLADE, {lit: CYAN}), R: C(MR, 'rest', 0)});
    F(160, {L: C(ML, 'guard', BLADE), R: C(MR, 'guard', 0)});
    for (const n of [6, 12]) F(60, {L: C(ML, 'guard', BLADE), R: C(MR, 'guard', n, {lit: MAG}), fx: n === 6 ? {snap: [1]} : {}});
    F(300, {L: C(ML, 'guard', BLADE), R: C(MR, 'guard', BLADE, {lit: MAG})});

    return {
      name: 'ECHO · saber duel', key: 'echo_saber_duel', fwname: 'echo saber duel', category: 'Active', size: N,
      // Big tier, like the other HD cells: 41 frames of 3600 bytes (147600 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, a laser sword duel with generic glowing blades, 60 cell lattice (8 px cells; two ECHO creatures at 1.5x, since two at 3x would need 90 cells across, the family\'s front pose rebuilt as boxes so it can turn, the left one mirrored so both antennas stand outside): they face off en garde, a cyan blade and a magenta blade leaning in like a tall A with a dark gap between the tips, the halos humming while both breathe and one blinks; they draw back into a V and cut, dotted light trailing the blades, and meet mid blade in an X with a white burst, sparks of both colours flying out, the halos flaring and the floor flashing white, both leaning in with wide eyes; the right one presses in until the cross slides down to the hilts and they lock with the cross over their heads, eyes narrowed, sparks crackling and dripping, the antennas pinging cyan and magenta in turn; the left one drives the right one back, dust kicking up at its heel as it skids, and it spins out of it, a full turn with its blade held up, the visor band and an eye going round its head over its raised arm and its plain back showing for one frame half way, white whoosh marks round it, while the left one steps back; en garde again as the right one settles onto its mark, then both blades retract, they bow with happy eyes and rest holding unlit hilts whose emitters glow faintly in their colours, one blinks, and the left one\'s blade snaps out of its hilt with a white spark on the tip and a cyan antenna ping and the right one answers in magenta, back to the face off; judge whether the X and the burst read as a clash at a glance from across the room, whether the turn reads as a spin rather than a flicker, whether the creatures at 1.5x are still big enough to be this creature, and whether the blades read as light rather than as solid bars.',
      // 0 transparent, 1 body, 2 eyes, 3 visor, 4 ping (also the cyan blade and the left antenna's ping), 5 feet (also
      // the floor line), 6 white (blade cores, hilts, sparks, the burst, whoosh marks, the skid dust, the floor's flash),
      // 7 magenta (the magenta blade, the right antenna's ping, sparks), 8 dim cyan and 9 dim magenta (the halos, the
      // trails, the floor's light, the unlit emitters)
      palette: [...ECHO_PALETTE.slice(0, 6), '#eafffb', '#ff5fd2', '#1d6f8c', '#7d1f6c'],
      frames,
    };
  })();

  L.register([echoSaberDuel]);
})(typeof window !== 'undefined' ? window : globalThis);
