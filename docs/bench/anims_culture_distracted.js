// Culture creatures: the ECHO creature plays the famous paintings, memes and pop culture moments (operator, 2026-10-02:
// "famous paintings, memes, pop culture ... get crazy, get creative"). Drawn from scratch on the ECHO base, in code: a
// composition, a setting and a gesture are homaged, never a character, a real person or a logo.
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
//
// ECHO · distracted: the meme from the stock photo of a couple out walking, where one turns to look back at a passer by
// while the partner glares: its format only, no one from the photo; every role is the ECHO creature. 60 cell lattice,
// 8 px cells.
// Built differently from the HD cells on purpose: three of the family side by side do not fit at 3x or 2x (the pose is 15
// cells wide with its arms, so three at 2x are 90 on a 60 lattice and any 2x layout puts one face behind another), and at
// 1x the eyes are one cell, too small to carry a glance. So the cast is a street size creature drawn from the family's
// ratios rather than resampled (1.5x nearest neighbour gives the two eyes and the four legs different widths): a body
// 15 x 14, the visor band inset a cell each side on rows 3..5 with the eyes 2 x 3 at the family's places, the arms 2 wide
// on rows 4..8 with the hand a row lower on the outer column, four legs 2 x 4 in the family's 2:3:2 spacing, and on the
// top right body column the antenna, a stalk of 3 and a tip of 2 that pings. With its arms it is 19 wide, so the couple
// holding hands (38) and the passer by (19) fit across the panel together.
//   stroll   the couple walks hand in hand on the spot, the family's walk (outer stance, then inner stance and a row of
//            bob, both in step so the held hands stay level) while the street scrolls 2 cells a step; the middle one
//            blinks.
//   pass     a chrome antenna with a glossy orb rises over their heads at the right edge, twinkling, and glides left
//            behind them 4 to 6 cells a frame, its owner hidden behind the couple (it walks a row further back, and that
//            row goes to the couple's rim); it hops 6 cells across the middle one's antenna, so the two stalks never
//            line up into one; the middle one's eyes roll up and follow it, its own antenna perking and pinging while
//            the orb is near.
//   turn     the passer by steps out from behind it on the left and the couple stops; the middle one looks, blinks (the
//            double take) and turns its head: the visor band slides to the left edge with the eyes in it, a 2 column
//            side face shows shaded on the right, the torso leans a cell toward the passer by over planted legs, and the
//            antenna springs up 2 rows, bends toward it and pings while a heart pops out of the tip.
//   meme     the dominant state, 3.2 s of the loop with the turn's 600 ms before it: the passer by struts nearly on the
//            spot, a cell every four steps, so it stays whole on the panel the whole time, its antenna swaying and
//            twinkling, oblivious; the heart rises; the partner's eyes find the middle one, then its head turns the same
//            way and its eyes go angry (inner top corners cut, a brow of four cells over each slanting down to the nose)
//            under an anger vein, four L strokes with their corners pointing in. Three gazes chain to the left, as in
//            the photo, across a gap with nothing in it.
//   walk on  the passer by picks up speed (3, 5, 5 and 6 cells a frame) and walks out at the left edge, the orb last on
//            its antenna swept back; the middle one stares a beat at the empty street, snaps its eyes front with its
//            antenna drooped, and the two walk on, the partner glaring for three steps.
// Loop: the street scrolls on walking frames only, 20 of them at 2 cells, 40 cells, one street period, and the stance
// alternates on each, so the last frame is one step before frame 0 in scroll and stance alike.
// Rims: the passer by is drawn first and loses a 1 cell rim wherever the couple's cells touch it, and the street only
// takes cells that no creature and no mark touches, so every silhouette keeps a dark edge (rave bunny HD's rule).
// Constants: 60 cells of 8 px; body 15 x 14, eyes 2 x 3, legs 2 x 4, stalk 3 and tip 2 (the passer by's stalk 8, orb
// 4 x 4); couple at cols 24 and 43 on ground row 50, passer by on row 49; scroll 2 cells a walking frame, period 40;
// pass 4 to 6 cells a frame; strut a cell every 4 steps; walk on 3 to 6 cells a frame; 39 frames, 8.82 s.
// Palette: 0..5 the ECHO palette unchanged (3 is also the chrome stalk, 4 also the orb and the twinkles' arms, 5 also the
// turned side face); 6 white (the orb's glint, the twinkle cores), 7 red (the heart, the anger vein), 8 slate (the
// buildings, the sidewalk joints, the curb face, the lane dashes), 9 lit slate (the windows, the back edge of the
// sidewalk, the curb top). Index 6 is white here, not the duplicate ping, and no frame uses echoGlitch.
// Big tier: 39 frames of 3600 cells are 140400 bytes of firmware table, so it ships only on boards built with SPLASH_BIG.
(function (root) {
  const L = root.BENCH_LIB;
  const {ECHO_PALETTE} = L;
  const N = 60;
  const BODY = 1, EYE = 2, VISOR = 3, PING = 4, FEET = 5, WHITE = 6, RED = 7, SLATE = 8, LIT = 9;

  // The street size creature, in body cells: rows 0..13 and cols 0..14 are the body.
  const W = 15, H = 14;
  const BAND = [3, 5];                           // visor rows
  const EYE_C = [3, 10];                         // each eye's left col, 2 wide, the band's height
  const ARM = [4, 8];                            // arm rows, 2 wide; the hand a row lower on the outer col
  const LEG_OUT = [0, 4, 9, 13], LEG_IN = [1, 4, 9, 12];   // the family's walk: outer stance, inner stance
  const LEG_H = 4, STALK = 3, TIP = 2;

  const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
  const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  // One creature, painted into g (a fresh layer unless given). o: x the body's left col standing straight, ground its
  // last leg row, step 0 or 1 while walking (1 lifts the body a row and draws the inner stance; the lifted hip row is
  // body, as in the family's walk), lean the torso's cols over planted legs, band the visor band's cols (the head turn),
  // eye the eyes' cols inside it, side the shaded side face's cols on the right, look 'up' | 'blink' | 'angry',
  // reach {l, r} extra arm cols (the held hands), ant {lit, extra stalk rows, tilt cols at the top, chrome, orb}.
  function creature(o, g = blank()) {
    const put = (r, c, v) => { if (inside(r, c)) g[r][c] = v; };
    const top = o.ground - LEG_H - H + 1 - (o.step === 1 ? 1 : 0);
    const bx = o.x + (o.lean || 0), face = bx + W - (o.side || 0);
    for (const lc of (o.step === 1 ? LEG_IN : LEG_OUT)) for (let r = top + H; r <= o.ground; r++) for (let k = 0; k < 2; k++)
      put(r, o.x + lc + k, r <= o.ground - LEG_H ? BODY : FEET);
    for (let r = top; r < top + H; r++) for (let c = bx; c < bx + W; c++) put(r, c, c >= face ? FEET : BODY);
    const reach = o.reach || {};
    for (const side of [-1, 1]) {
      const n = 2 + ((side < 0 ? reach.l : reach.r) || 0), at = k => (side < 0 ? bx - k : bx + W - 1 + k);
      for (let r = top + ARM[0]; r <= top + ARM[1]; r++) for (let k = 1; k <= n; k++) put(r, at(k), BODY);
      put(top + ARM[1] + 1, at(n), BODY);
    }
    const band = o.band || 0, eye = o.eye || 0;
    for (let r = top + BAND[0]; r <= top + BAND[1]; r++) for (let c = bx + 1 + band; c <= bx + W - 2 + band; c++) if (c >= bx && c < face) put(r, c, VISOR);
    EYE_C.forEach((ec, i) => {
      const c0 = bx + ec + band + eye;
      for (let row = 0; row < 3; row++) for (let k = 0; k < 2; k++) {
        if (o.look === 'up' && row === 2) continue;                       // rolled up: the top two rows
        if (o.look === 'blink' && row < 2) continue;                      // shut: the bottom row
        if (o.look === 'angry' && row === 0 && k === 1 - i) continue;     // the inner top corner cut
        if (c0 + k >= bx && c0 + k < face) put(top + BAND[0] + row, c0 + k, EYE);
      }
      // the scowl: four cells a brow, two high at the temple and two low at the nose, on the two rows over the band
      // (a third row would sit on the head's top row and notch the silhouette); kept on the face
      if (o.look === 'angry') for (const [dr, dc] of (i ? [[-1, -1], [-1, 0], [-2, 1], [-2, 2]] : [[-2, -1], [-2, 0], [-1, 1], [-1, 2]]))
        if (c0 + dc >= bx && c0 + dc < face) put(top + BAND[0] + dr, c0 + dc, EYE);
    });
    const ant = o.ant || {}, len = STALK + (ant.extra || 0), tilt = ant.tilt || 0, ac = bx + W - 1;
    for (let i = 1; i <= len; i++) put(top - i, ac + Math.round(tilt * (i - 1) / Math.max(1, len - 1)), ant.chrome ? VISOR : BODY);
    const tr = top - len, tc = ac + tilt;
    if (ant.orb) ['.pp.', 'pwpp', 'pppp', '.pp.'].forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(tr - 4 + dr, tc - 1 + dc, ch === 'w' ? WHITE : PING); }));
    else for (let r = tr - TIP; r < tr; r++) put(r, tc, ant.lit ? PING : BODY);
    return g;
  }

  // Marks: r red, w white, p ping.
  const INK = {r: RED, w: WHITE, p: PING};
  const mark = (g, art, r0, c0) => art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.' && inside(r0 + dr, c0 + dc)) g[r0 + dr][c0 + dc] = INK[ch]; }));
  const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
  const HEART_S = ['.r.r.', 'rrrrr', '.rrr.', '..r..'];
  // The anger vein: four L strokes a cell thick, each corner pointing at the middle (corners pointing out read as a
  // ring or a viewfinder).
  const ANGER = ['..r.r..', '..r.r..', 'rrr.rrr', '.......', 'rrr.rrr', '..r.r..', '..r.r..'];
  const ANGER_S = ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.'];
  const TWINKLE = ['.p.', 'pwp', '.p.'], GLINT = ['w'];

  // The street, a pattern PERIOD cells long (c in pattern cols): two blocks of lit windows, the sidewalk between its
  // back edge (row 40) and the curb (rows 53..54), the road with its lane dashes. No lamp post: the pattern repeats
  // every 40 cells on a 60 cell panel, so a post behind the passer by in the stop has a twin behind the partner, and
  // the one place it stands alone is the gap the three gazes cross.
  const PERIOD = 40;
  const BLOCKS = [{c0: 9, w: 19, roof: 4}, {c0: 30, w: 18, roof: 9}];
  function street(r, c) {
    if (r >= 55) return r === 58 && c % 10 < 5 ? SLATE : 0;
    if (r === 53) return LIT;
    if (r === 54) return SLATE;
    if (r === 40) return LIT;
    if (r > 40) return c % 10 === 0 ? SLATE : 0;
    for (const b of BLOCKS) {
      const u = ((c - b.c0) % PERIOD + PERIOD) % PERIOD;
      if (u >= b.w || r < b.roof) continue;
      const wr = (r - b.roof - 4) % 7, wc = (u - 2) % 5;
      return r >= b.roof + 4 && r < 36 && wr < 3 && wc < 2 && u >= 2 && u <= b.w - 3 ? LIT : SLATE;
    }
    return 0;
  }

  // A frame: the layers back to front, each clearing a 1 cell rim out of what is already drawn wherever it touches it;
  // the marks on top; then the street, scrolled s cells, on every cell nothing drawn touches.
  function compose(layers, marks, s) {
    const g = blank();
    for (const lay of layers) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (lay[r][c])
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, c + dc) && !lay[r + dr][c + dc]) g[r + dr][c + dc] = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (lay[r][c]) g[r][c] = lay[r][c];
    }
    for (const [art, r0, c0] of marks) mark(g, art, r0, c0);
    const drawn = g.map(row => row.map(Boolean));
    const touched = (r, c) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(r + dr, c + dc) && drawn[r + dr][c + dc]) return true; return false; };
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!touched(r, c)) g[r][c] = street(r, ((c + s) % PERIOD + PERIOD) % PERIOD);
    return g;
  }

  // The cast: the middle one (mid) at col 24 holding hands with the partner (partner) at col 43, both on ground row 50;
  // the passer by (pb) a row further back. The couple is one layer, so the held hands never get a rim between them.
  const MID_X = 24, PARTNER_X = 43, GROUND = 50, PB_GROUND = 49, PB_STALK = 5;
  const frames = [];
  let walked = 0, scroll = 0;
  function F(hold, o) {
    if (o.walk) scroll = 2 * walked;
    const step = o.walk ? walked % 2 : undefined;
    const couple = creature({x: PARTNER_X, ground: GROUND, step, ...o.partner});
    creature({x: MID_X, ground: GROUND, step, ...o.mid}, couple);
    const layers = [];
    if (o.pb) layers.push(creature({ground: PB_GROUND, eye: -1, ...o.pb, ant: {orb: true, chrome: true, extra: PB_STALK, ...o.pb.ant}}));
    layers.push(couple);
    frames.push({hold, grid: compose(layers, o.marks || [], scroll)});
    if (o.walk) walked++;
  }
  const orbTop = (x, step) => [PB_GROUND - LEG_H - H + 1 - step - STALK - PB_STALK - 4, x + W - 1];   // the orb's top row, the stalk's col

  // 1. Stroll: six steps, a blink on the fourth.
  for (let k = 0; k < 6; k++) F(200, {walk: true, mid: {eye: 1, look: k === 3 ? 'blink' : undefined}, partner: {eye: 1}});
  // 2. The pass: the orb enters at the right edge and glides left behind their heads; the middle one's eyes follow it.
  [45, 40, 35, 31, 27, 21, 16, 11].forEach((x, k) => {   // a 6 cell hop across the middle one's antenna, so the two stalks never line up
    const st = k % 2, [or, oc] = orbTop(x, st), d = oc - (MID_X + 7), over = Math.abs(oc - (MID_X + W - 1)) <= 12;
    F(120, {walk: true, pb: {x, step: st, ant: {tilt: st ? 1 : -1}}, partner: {eye: 1},
      mid: {eye: d > 6 ? 1 : d < -6 ? -1 : 0, look: 'up', ant: {lit: over, extra: over ? 1 : 0}},
      marks: [[st ? TWINKLE : GLINT, or - 2, oc + (st ? 3 : -3)]]});
  });
  // 3. The turn: it steps out on the left; a look, the double take, the head turns and the heart pops.
  const TURN = {band: -1, eye: -1, lean: -1, side: 2, reach: {r: 1}, ant: {lit: true, extra: 2, tilt: -2}};   // the arm reaches a cell to keep hold
  F(170, {pb: {x: 8, step: 0}, mid: {eye: -1, ant: {lit: true, extra: 1}}, partner: {eye: 1}});
  F(90, {pb: {x: 7, step: 1}, mid: {eye: -1, look: 'blink', ant: {extra: 1}}, partner: {eye: 1}});
  F(140, {pb: {x: 6, step: 0}, mid: {...TURN, ant: {...TURN.ant, extra: 3}}, partner: {eye: 1}, marks: [[HEART_S, 22, 34]]});
  F(600, {pb: {x: 5, step: 1}, mid: TURN, partner: {eye: 1}, marks: [[HEART, 18, 31], [TWINKLE, orbTop(5, 1)[0] - 3, 16]]});
  // 4. The meme: the passer by struts nearly on the spot; the partner finds the middle one, turns and glares under the
  // anger vein.
  const GLARE = {band: -1, eye: -1, look: 'angry', side: 2};
  const MEME = [[300, {eye: -1}], [250, GLARE, ANGER_S], ...Array.from({length: 7}, () => [380, GLARE, ANGER])];
  MEME.forEach(([hold, partner, anger], k) => {
    const x = 4 - (k >> 2), st = k % 2, [or, oc] = orbTop(x, st);   // a strut nearly on the spot: a cell every four steps
    const marks = [[HEART, 17 - k, 31 - (k >> 1)]];
    if (st === 0) marks.push([TWINKLE, or - 2 + (k % 4 ? 5 : 0), oc + (k % 4 ? 4 : -3)]);
    if (anger) marks.push(anger === ANGER ? [ANGER, 22, 41] : [ANGER_S, 23, 42]);
    F(hold, {pb: {x, step: st, ant: {tilt: st ? 1 : -1}}, mid: {...TURN, ant: {...TURN.ant, lit: k % 2 === 0}}, partner, marks});
  });
  // 5. Walk on: it picks up speed (3, 5, 5, 6 cells) and leaves at the left edge, the orb last on its antenna swept
  // back; a beat at the empty street; the eyes snap front, the antenna droops.
  [[-1, 1], [-6, -1], [-11, 1], [-17, 3]].forEach(([x, tilt], k) => F(120, {pb: {x, step: (k + 1) % 2, ant: {tilt}}, mid: TURN, partner: GLARE,
    marks: [[ANGER, 22, 41], ...(k ? [] : [[HEART_S, 9, 26]])]}));
  F(200, {mid: TURN, partner: GLARE, marks: [[ANGER, 22, 41]]});
  F(450, {mid: {eye: 1, ant: {extra: -1}}, partner: GLARE, marks: [[ANGER, 22, 41]]});
  // 6. They walk on, the partner glaring for three steps; the last step hands frame 0 its scroll and stance.
  for (let k = 0; k < 6; k++) F(220, {walk: true, mid: {eye: 1, ant: k < 2 ? {extra: -1} : {}}, partner: k < 3 ? GLARE : {eye: 1},
    marks: k < 2 ? [[ANGER_S, 23, 42]] : []});

  L.register([{
    name: 'ECHO · distracted', key: 'echo_distracted', fwname: 'echo distracted', category: 'Active', size: N,
    // Big tier, like the HD cells: 39 frames of 3600 bytes (140400 bytes) ship only on boards built with SPLASH_BIG.
    tier: 'big',
    intent: 'Proposal, 60 cell lattice (8 px cells), the format of the stock photo meme where one of a couple turns to look back at a passer by while the partner glares, every role played by the ECHO creature at a street size drawn from the family\'s ratios (body 15 x 14) because three of it at 2x would not fit across the panel: on a night street of lit windows and a curb, the couple walks hand in hand on the spot while the street scrolls by, then a chrome antenna with a glossy twinkling orb glides left over their heads from behind them, the middle one\'s eyes rolling up to follow it as its own antenna perks and pings, until the passer by steps out on the left and the couple stops; the middle one looks, blinks a double take and turns its head, its visor sliding to the left edge with a shaded side face showing on the right, its torso leaning in and its antenna springing up and bending toward the passer by as a heart pops out of the tip, and for 3.2 s, the longest state, the passer by struts nearly on the spot swaying its shiny antenna while the heart rises and the partner\'s eyes find the middle one, its head turns too and its eyes go angry under brows slanting down to the nose and an anger vein, three gazes chaining left across an empty gap as in the photo; then the passer by picks up speed and walks out at the left edge, orb last, the middle one snaps its eyes front with its antenna drooped and the two walk on, the partner glaring for three steps; judge whether the head turn and the glare read from a metre, whether the gliding antenna reads as someone walking behind them, and whether the street size still reads as this creature.',
    // 0 transparent, 1 body, 2 eyes and brows, 3 visor and the chrome stalk, 4 ping (antenna tips, the orb, twinkle arms),
    // 5 legs and the turned side face, 6 white (the orb's glint, twinkle cores), 7 red (the heart, the anger vein), 8 slate
    // (buildings, sidewalk joints, curb face, lane dashes), 9 lit slate (windows, sidewalk edge, curb top)
    palette: [...ECHO_PALETTE.slice(0, 6), '#eafffb', '#ff5a78', '#18242b', '#2f424a'],
    frames,
  }]);
})(typeof window !== 'undefined' ? window : globalThis);
