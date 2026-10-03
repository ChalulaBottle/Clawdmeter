// Culture creature: crosswalk (operator, 2026-10-02: "famous paintings, memes, popculture to be added to the animation
// list ... get crazy get creative"). An homage to a 1969 album cover photograph: four walkers crossing a zebra crossing
// in single file, left to right, in step, under a line of trees. The composition, the setting and the gesture only:
// every walker is the ECHO creature, told apart by one accent each, and every cell is drawn here in code, nothing traced.
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
//
// ECHO · crosswalk, on the 60 cell lattice, 8 px cells on the 480 panel, as a full bleed street: a pale overcast sky; a
// line of trees across the top (lumpy crowns lit from the upper left, the shade in the feet teal with a dither between,
// each ending in its own round, ragged bottom; a gap of sky over the road; four far trees, two either side of it, small,
// no trunk showing that far off, their feet running down to the horizon; the near trees' four trunks down to the far
// pavement, each showing a different length under its crown); the road in panel black; and the crossing right across
// the panel under the walkers' feet, its stripes running along the road and their edges drawn to one vanishing point
// above the trees (row 10, col 30), so they fan out a little toward the sides.
// The walkers: the family's side view (moonwalk HD's: the visor band on the front half with the near eye and the far
// one in it, the antenna on the back corner, a shading row along the bottom) at about 1x, a body 10 deep and 11 tall on
// legs of 7 rows, 2 cells across, from the middle of its bottom edge. Why about 1x: four of them must stand in a row
// with daylight between, and four of 15 cells is the whole panel; at 2x one walker alone would be 20 deep. Why legs of
// 7, longer than the HD side views' (about 4 rows at 1x in moonwalk HD, 5.5 in its take b): the stride's inverted V is
// the gesture, and it needs that length to stay legible at 120 px.
// The kit, last to first, each one kept clear of the next walker (a black column always stands between two of them, so
// the line stays four separate silhouettes):
//   bowler   amber, a round crown 6 wide on a brim of 10, the brim on the row over the head and clear of the antenna.
//   tie      red, down the front edge inside the outline, its knot one teal row below the visor so it never reads as a
//            tongue: the knot, a blade of 3 and the tip, which flies a cell forward on every contact, the only cell of
//            it that ever leaves the outline.
//   bare     nothing.
//   scarf    white, two rows round the neck under the visor with a knot under the chin, and its tail down the back in
//            five shapes a step, never more than two columns wide: the drop on the contact flicks it out, and it swings
//            back in as the body rides up. The near arm swings over the tail, the far one behind it.
// The beats:
//   cover    frame 0 and the thumbnail, 1.6 s: all four whole on the stripes (back columns 3, 18, 33 and 48), in step,
//            mid stride with the near legs ahead.
//   shutter  a camera flash whites out every black cell for 90 ms; the family's glitch split runs through all four
//            visors at once for 60 ms (the visor rows and the row under them a cell right, the visor in ping); they
//            blink, dazzled.
//   ripple   an antenna ping (the tip lit and flared) runs down the line from the leader, and the last one's ping
//            lingers before they set off. A raised bowler was tried and cut: at 1x there is no hand to lift it, and on
//            its own it read as a levitating hat, or tilted as a peaked cap, never as a tip.
//   walk     the dominant state, 29 frames, 4.1 s, 2 cells a frame: steps of 5 frames, 10 cells between the soles at a
//            contact. In a step the leg that landed stays planted, its sole on the same three panel cells for all 5
//            frames while the body passes over it, and the other swings through from 5 behind to 5 ahead, lifted 0, 1,
//            2, 2 and 1 rows; the body rides a row higher off the contact; the arms show as nubs past the outline at the
//            ends of their swing, each against its own leg. On the way the bare one glances back over its shoulder,
//            the tie and the bowler blink and the scarf pings.
// The panel wraps, as in moonwalk HD b: whatever leaves the right edge comes back in at the left on the same frame. Four
// walkers 15 cells apart fill the 60 cells exactly, so the 30th position round the panel is frame 0 cell for cell, and
// the loop's 3 strides of 20 cells bring every leg back to its phase.
// Constants: 60 cells of 8 px; horizon row 26; sole row 51; the crossing rows 46..56, a stripe every 10 cells, 5 wide on
// the sole row; body 10 x 11, its top row 34 at a contact; legs 7; a step of 10 cells in 5 frames; walkers 15 apart;
// 37 frames, 7.0 s.
// Palette: 0 the road (panel black); 1..5 the ECHO palette unchanged (2 is also the trunks; 5 also the far leg, the far
// arm and the crowns' shade); 6 white (the sky, the stripes, the scarf, the flash); 7 leaf green; 8 amber (the bowler);
// 9 red (the tie). Index 6 is not ping here, so no frame goes through echoGlitch: the split is drawn here.
// Big tier: 37 frames of 3600 cells are 133200 bytes of firmware table, so it ships only on boards built with SPLASH_BIG.
(function (root) {
  const L = root.BENCH_LIB;

  const echoCrosswalk = (() => {
    const N = 60;
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, DARK = 5, WHITE = 6, LEAF = 7, AMBER = 8, RED = 9;

    // Constants the cell is judged on.
    const HORIZON = 26;                                            // the first ground row: sky and trees above it
    const VP = [10, 30];                                           // the stripes' vanishing point [row, col]
    const SOLE = 51;                                               // every planted sole stands on this row
    const BAND = [46, 56];                                         // the crossing: its far row and its near row
    const PERIOD = 10, STRIPE = 5, STRIPE_AT = 30.5;               // on the sole row: a stripe every 10 cells, 5 wide, one on col 30
    const BW = 10, BH = 11;                                        // a walker's body, 10 deep and 11 tall
    const LEG = 7;                                                 // rows from the body's bottom edge to the sole, at a contact
    const TOP = SOLE + 1 - LEG - BH;                               // body top row at a contact (34): body 34..44, legs 45..51
    const STEP = 10, STEP_FRAMES = 5, V = STEP / STEP_FRAMES;      // cells between the soles at a contact; frames a step; cells a frame
    const SPACING = 15;                                            // back column to back column; 4 walkers x 15 = the 60 cell panel
    const B0 = 3;                                                  // the tail's back column on frame 0: all four whole
    const WALK_FRAMES = N / V - 1;                                 // 29: the 30th position round the panel is frame 0 again
    const LIFT = [0, 1, 2, 2, 1], BOB = [0, -1, -1, -1, -1];       // swing sole lift and body bob, frame by frame in a step
    const POSE = 1600, FLASH = 90, GLITCH = 60, DAZZLE = 320, RIPPLE = 160, LAST = 420, WALK = 140;  // ms
    const KITS = ['hat', 'tie', 'bare', 'scarf'];                  // tail to leader, left to right

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const wrap = c => ((c % N) + N) % N;
    const put = (g, r, c, v) => { if (r >= 0 && r < N) g[r][wrap(c)] = v; };   // walkers only: rows clip, columns wrap
    const fix = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; };            // the street: never wraps
    const segDist = (y, x, [ay, ax], [by, bx]) => {
      const vy = by - ay, vx = bx - ax, wy = y - ay, wx = x - ax, l = vy * vy + vx * vx;
      const t = l ? Math.max(0, Math.min(1, (wy * vy + wx * vx) / l)) : 0;
      return Math.hypot(wy - t * vy, wx - t * vx);
    };
    const sprite = (g, art, r0, c0, ink, draw = put) => art.forEach((line, i) => [...line].forEach((ch, k) => { if (ch !== '.') draw(g, r0 + i, c0 + k, ink); }));

    // ---- the street (fixed: the panel never pans, so nothing here wraps) ----
    // The tree line: crowns [row, col, radius], the four far ones first, and the near trees' trunks [col, width].
    const CROWNS = [
      [22, 26, 3.4], [22, 34, 3.4], [21.5, 21.5, 4.2], [21.5, 38.5, 4.2], [18, 16, 5], [18, 44, 5],
      [15, 9, 7], [15, 51, 7], [5, 2, 10], [5, 58, 10], [2, 13, 7], [2, 47, 7], [11, 19, 4], [11, 41, 4],
    ];
    const FAR = 4, FOOT = 0.7;                                     // the first 4 crowns are far: their feet run down to the horizon
    const TRUNKS = [[9, 2], [16, 1], [44, 1], [51, 2]];
    const TRUNK_TOP = 18;
    // Where a cell's centre falls on the sole row, seen from the vanishing point: the stripes' edges run to it.
    const toSole = (r, c) => VP[1] + (c + 0.5 - VP[1]) * (SOLE + 0.5 - VP[0]) / (r + 0.5 - VP[0]);
    function street() {
      const g = blank();
      for (let r = 0; r < HORIZON; r++) for (let c = 0; c < N; c++) g[r][c] = WHITE;   // overcast sky
      for (const [c0, w] of TRUNKS) for (let r = TRUNK_TOP; r < HORIZON; r++) for (let c = c0; c < c0 + w; c++) fix(g, r, c, EYE);
      // crowns: lumpy discs lit from the upper left, the shade in the dark teal with a dither between; a near crown ends in
      // its own round bottom, so the canopy's lower edge is ragged and every trunk shows a different length under it
      CROWNS.forEach(([cr, cc, rad], k) => {
        for (let r = Math.floor(cr - rad - 2); r < HORIZON; r++) for (let c = Math.floor(cc - rad - 2); c <= cc + rad + 2; c++) {
          const dy = r + 0.5 - cr, dx = c + 0.5 - cc, d = Math.hypot(dy, dx);
          const ang = Math.atan2(dy, dx), lump = 1 + 0.14 * Math.sin(5 * ang + k) + 0.08 * Math.sin(9 * ang + 2 * k);
          const foot = k < FAR && dy > 0 && Math.abs(dx) <= rad * FOOT;   // a far tree: no trunk shows, it stands on the horizon
          if (d > rad * lump && !foot) continue;
          const s = (dy + dx * 0.6) / rad;                          // toward the lower right
          fix(g, r, c, s > 0.55 ? DARK : s > 0.2 ? ((r + c) % 2 ? DARK : LEAF) : LEAF);
        }
      });
      // the road is panel black; the crossing's stripes run along it
      for (let r = BAND[0]; r <= BAND[1]; r++) for (let c = 0; c < N; c++) {
        const u = (((toSole(r, c) - STRIPE_AT + STRIPE / 2) % PERIOD) + PERIOD) % PERIOD;
        if (u < STRIPE) fix(g, r, c, WHITE);
      }
      return g;
    }
    const STREET = street();

    // ---- the walkers (wrapped) ----
    // Two steps of 5 frames: 10 phases. In a step the leg that landed at its contact stays planted, its sole on the same
    // panel cells while the body passes over it 2 cells a frame (5, 3, 1, -1 and -3 cells ahead of the hips), and the
    // other swings through from 5 behind to 5 ahead, lifted 0, 1, 2, 2 and 1 rows; the body rides a row higher off the
    // contact. Phases 0..4 the near leg is planted, 5..9 the far one.
    const PH = 2 * STEP_FRAMES;
    const phaseAt = B => ((((B - B0) / V) % PH) + PH) % PH;
    function legGeom(p) {
      const j = p % STEP_FRAMES, nearPlanted = p < STEP_FRAMES;
      const plant = {d: STEP / 2 - V * j, lift: 0}, swing = {d: -STEP / 2 + V * j, lift: LIFT[j]};
      return {j, bob: BOB[j], near: nearPlanted ? plant : swing, far: nearPlanted ? swing : plant};
    }
    // A leg 2 cells across from the hip (the body's bottom edge, mid way) to the ankle, and a sole of 3, its toe ahead.
    function leg(g, b, top, {d, lift}, ink) {
      const hip = [top + BH, b + BW / 2], ankle = [SOLE - lift, b + BW / 2 + d];
      for (let r = top + BH; r < SOLE - lift; r++) for (let c = Math.floor(Math.min(hip[1], ankle[1])) - 2; c <= Math.ceil(Math.max(hip[1], ankle[1])) + 1; c++)
        if (segDist(r + 0.5, c + 0.5, hip, ankle) <= 1.0) put(g, r, c, ink);
      const a = Math.round(ankle[1]);
      for (let c = a - 1; c <= a + 1; c++) put(g, SOLE - lift, c, ink);
    }
    // The scarf's tail down the back of the neck, one shape a frame of the step, as it lies on the panel: rows down from
    // the neck row, the two columns behind the back edge. Never wider than two, so a black column always stands between
    // it and the walker behind. The drop on the contact flicks it out; it swings back in as the body rides up.
    const TAILS = [
      ['ww', 'w.', 'w.', '..'],
      ['.w', 'ww', 'w.', 'w.'],
      ['.w', '.w', 'ww', 'w.'],
      ['.w', '.w', '.w', 'ww'],
      ['.w', '.w', 'w.', 'w.'],
    ];
    // The bowler, as it lies on the panel from the antenna column: a round crown 6 wide on a brim of 10, the brim on the
    // row over the head and a cell clear of the antenna.
    const HAT = ['....aaaa...', '...aaaaaa..', '...aaaaaa..', '.aaaaaaaaaa'];

    function walker(g, b, p, kit, o) {
      const lg = legGeom(p), top = TOP + lg.bob, nearAhead = lg.near.d > lg.far.d;
      leg(g, b, top, lg.far, DARK);
      leg(g, b, top, lg.near, BODY);
      // the scarf's tail before the arms: the near arm swings over it, the far one behind it
      if (kit === 'scarf') sprite(g, TAILS[lg.j], top + 4, b - 2, WHITE);
      // the arms: a nub out past the outline at each end of the swing, front and back, each against its own leg (the near
      // arm in the body's teal, the far one darker)
      if (lg.j === 0 || lg.j === 1 || lg.j === 4) {
        const out = lg.j === 1 ? 1 : 2, front = nearAhead ? DARK : BODY, back = nearAhead ? BODY : DARK;
        for (let k = 1; k <= out; k++) for (let r = top + 5; r <= top + 6; r++) {
          const row = r + (k > 1 ? 1 : 0);
          put(g, row, b + BW - 1 + k, front);
          if (back === BODY || g[row][wrap(b - k)] !== WHITE) put(g, row, b - k, back);
        }
      }
      for (let r = top; r < top + BH; r++) for (let c = 0; c < BW; c++) put(g, r, b + c, r === top + BH - 1 ? DARK : BODY);
      // the visor band on the front of the head with the near eye and the far one, or the eyes slid back: a look behind
      const eyes = o.back ? [4, 6] : [6, 8];
      for (const r of [top + 2, top + 3]) for (let c = 4; c < BW; c++) put(g, r, b + c, !o.blink && eyes.includes(c) ? EYE : VISOR);
      // the antenna on the back corner; a ping lights the tip and flares it
      for (let r = top - 3; r < top; r++) put(g, r, b, BODY);
      put(g, top - 4, b, o.ping ? PING : BODY);
      if (o.ping) for (const [dr, dc] of [[-1, 0], [0, -1], [0, 1]]) put(g, top - 4 + dr, b + dc, PING);
      // the kit
      if (kit === 'scarf') {
        for (let r = top + 4; r <= top + 5; r++) for (let c = 0; c < BW; c++) put(g, r, b + c, WHITE);
        put(g, top + 4, b + BW, WHITE);                              // the knot under the chin
      } else if (kit === 'tie') {
        // down the front edge, inside the outline, a teal row clear of the visor: the knot, a blade of 3 and the tip;
        // on the contact the tip flies a cell forward, the only cell that ever leaves the outline
        for (let r = top + 5; r <= top + 8; r++) put(g, r, b + BW - 1, RED);
        put(g, top + 9, b + BW - (lg.j === 0 ? 0 : 1), RED);
      } else if (kit === 'hat') {
        sprite(g, HAT, top - HAT.length, b, AMBER);
      }
      return top;
    }

    // ---- frames ----
    // The four walkers on their own layer, then onto the street. glitch: the family's split, the visor rows and the one
    // under them a cell right and the visor in ping; flash: every black cell white.
    function frame(B, o = {}) {
      const layer = blank(), p = phaseAt(B), on = (k, i) => (o[k] || []).includes(i);
      let top = TOP;
      KITS.forEach((kit, i) => { top = walker(layer, B + SPACING * i, p, kit, {blink: on('blink', i), ping: on('ping', i), back: on('back', i)}); });
      if (o.glitch) for (let r = top + 2; r <= top + 4; r++) {
        const row = layer[r].slice();
        for (let c = 0; c < N; c++) { const v = row[wrap(c - 1)]; layer[r][c] = v === VISOR ? PING : v; }
      }
      const g = STREET.map(row => row.slice());
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (layer[r][c]) g[r][c] = layer[r][c];
      if (o.flash) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c]) g[r][c] = WHITE;
      return g;
    }
    const ALL = [0, 1, 2, 3];
    const frames = [], F = (hold, grid) => frames.push({hold, grid});
    F(POSE, frame(B0));                                            // the cover: four whole, mid stride, in step
    F(FLASH, frame(B0, {flash: true}));                            // the shutter
    F(GLITCH, frame(B0, {glitch: true}));                          // the flash runs through the visors
    F(DAZZLE, frame(B0, {blink: ALL}));                            // dazzled
    for (const i of [3, 2, 1]) F(RIPPLE, frame(B0, {ping: [i]}));  // a ping down the line, leader first
    F(LAST, frame(B0, {ping: [0]}));                               // and the last one's ping lingers before they set off
    const LIFE = {6: {back: [2]}, 7: {back: [2]}, 12: {blink: [1]}, 18: {ping: [3]}, 24: {blink: [0]}};
    for (let k = 1; k <= WALK_FRAMES; k++) F(WALK, frame(B0 + V * k, LIFE[k] || {}));

    return {
      name: 'ECHO · crosswalk', key: 'echo_crosswalk', fwname: 'echo crosswalk', category: 'Active', size: N,
      // Big tier: 37 frames of 3600 bytes (133200 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, culture, 60 cell lattice (8 px cells, a full bleed street, four creatures in profile at about 1x): an homage to a 1969 album cover photograph, four ECHO creatures crossing a zebra crossing in single file from left to right, in step, under a line of trees and a pale overcast sky, told apart by one accent each and always four separate silhouettes (an amber bowler with a brim on the last, a red tie down the chest of the next, nothing on the third, a white scarf with its tail down the back on the leader); the cover holds for 1.6 s with all four whole on the stripes mid stride, then a camera flash whites out the street, the family glitch split runs through all four visors, they blink dazzled, an antenna ping runs down the line from the leader to the bowler, whose ping lingers, and they walk on, 2 cells a frame, each planted foot holding its stripe while the body passes over it, with a bob, swinging arms, the tie\'s tip flicking forward on every step and the scarf tail swinging, out at the right edge and straight back in at the left (the panel wraps), one glancing back over its shoulder, two blinking and one pinging, until the line is back on the cover; judge whether it reads as the album cover at a glance, whether the walk reads as striding rather than sliding, and whether the white flash is too much.',
      // 0 the road (panel black), 1 body and the near leg, 2 eyes and the trunks, 3 visor, 4 ping (antenna tip, glitch
      // visor), 5 feet teal (shading row, far leg, far arm, the crowns' shade), 6 white (sky, stripes, scarf, flash),
      // 7 leaf green, 8 amber (the bowler), 9 red (the tie)
      palette: ['transparent', '#17836f', '#06090b', '#35e0c0', '#6fe9ff', '#0f5a4c', '#eafffb', '#2f6f2f', '#e0b25a', '#e0665a'],
      frames,
    };
  })();

  L.register([echoCrosswalk]);
})(typeof window !== 'undefined' ? window : globalThis);
