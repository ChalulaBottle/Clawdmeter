// Culture: a homage to the Mona Lisa (Leonardo da Vinci, about 1503, public domain), the ECHO creature as the sitter
// (operator, 2026-10-02: famous paintings, memes and pop culture for the creature list, "get crazy get creative"). Drawn
// from scratch in code, no traced image and no fetched pixel data: the painting lends its composition, its setting and
// its gesture only (a sitter seen half length with folded hands before a hazy landscape, the slight smile, the eyes said
// to follow the viewer). On the 60 cell lattice, 8 px cells on the 480 panel, the creature at 3x the way mushroom HD
// builds it: the head is the family's 20 cell pose repeated exactly 3 times across and down (upscale(echoPing(ping), 3)),
// moved a col left so the portrait sits centred and 4 rows down, with the arm stubs taken off; everything else is painted
// on the fine lattice.
//   sitter     the box is the face, the family's visor band and slit eyes untouched; below a shallow U neckline trimmed in
//              ochre it wears a gown in its own feet teal, the shoulders falling away to both edges of the frame. Long dark
//              brown hair falls from a solid three row crown over the top of the box (the box's top row and corners stay
//              clear) down both sides to the shoulders, a slow wave on its outer edge, tapering at the ends; the antenna
//              stands up through the crown, as the family's. No part: a cell of teal down the crown's middle read as a
//              tick or a second stub antenna, and the rim fills any notch a cell wide.
//   hands      the painting's folded hands: ochre sleeves come in from off the frame, the near one down at a slant from
//              the left and the far one level from the right, and two teal mitts rest one over the other at the bottom
//              centre, the upper one stopping short so the lower shows as its own block beside it; each is outlined in
//              umber on the gown, with a cuff line at each wrist and an umber crease where the upper hand lies on the
//              lower. No finger lines: one across the upper tip split the hand in three like a crack, and one along it
//              opened the tip like a beak.
//   landscape  sfumato behind it, the horizon lower on the left than on the right as in the painting: a warm pale sky,
//              jagged blue green mountains that end on a clean edge and float over a pale lake on each side (a dither
//              at their feet, and a fringe on the hills, read as picket fences), ochre hills, a pale road winding up the
//              hills on the left, and on the right a small arched bridge across the lake where a river leaves it down
//              the hills, a cell of haze clear of the hair's rim (touching it, the dark shade under its deck ran on
//              out of the hair like a strap) and cut by the frame. Only cells off the figure take it, and a rim of
//              umber round the figure keeps the silhouette.
//   smile      the dominant state is the postcard: eyes on the viewer and the faint smile, soft corners lifted in the
//              gown teal. It comes and goes: when the eyes look away the mouth settles to a flat soft line, when they
//              come back it deepens to a dark smile with soft corners, and fades back to the faint one. The faint one
//              stays soft on purpose: a dark base under it (5 cells, or 3) was tried and, softened the way a metre off
//              softens it, reads as a short dash, a plain mouth, where the soft one keeps its curve. Its tone is close
//              to the face (about 1.75 to 1), so whether it still shows on the panel itself is to be checked on the
//              device; if it fades there, give the faint smile the dark base and keep the wide dark smile for the
//              deepened beat.
//   eyes       they follow someone walking past: the slits drift two cells left along the band (a cell at a time) and
//              hold, come back, a blink (half, shut, half) on the smile, then drift two cells right and hold, come back.
//   glint      a slow one at the end: the antenna tip lights, a four point star opens round it in ping, two cells a ray
//              and then three with the diagonals, the smile deepening with it, and closes back to the lit tip.
// Constants: 60 cells of 8 px; the creature at 3x, 1 col left and 4 rows down of the family frame; eye drift 2 cells,
// 200 ms out and 180 ms back a cell, held 1.3 s at the side; blink 70, 120, 70 ms; the postcard held 2.8 s (the loop
// anchor); glint 250, 200, 450, 200, 250 ms; 24 frames, 10.9 s; neckline row 39 at the centre, rising 2 rows to the
// sides; hair crown 3 rows, curtains 2 to 5 wide down to row 40; sleeves 6 across, mitts 5 across, the upper hand from
// its wrist at col 23 to its tip at col 30, the lower from col 37 to 28; the bridge 9 cells wide at row 20, col 53, so
// the frame shows 7 of them.
// Palette: 0..5 the ECHO palette unchanged (2 is also the deep smile; 5, the feet teal, is the gown and the soft
// mouth; 4, the ping, is the glint); 6 haze (the sky, the lakes, the road, the river), 7 the far mountains, 8 ochre
// (the hills, the sleeves, the neckline trim, the bridge), 9 umber (the hair, the rim, the cuffs, the hands' outline
// and the crease between them, the shade under the bridge's deck). Index 6 is not the duplicate ping here, so no frame
// goes through echoGlitch. Big tier: 24 frames of 3600 cells are 86400 bytes of firmware table, so it ships only on
// boards built with SPLASH_BIG. One closure, so echoMonaLisa is the only name it adds to this scope.
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {upscale, echoPing, ECHO_PALETTE} = L;

  const echoMonaLisa = (() => {
    const N = 60, K = 3;                                           // lattice; a 20 cell pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, GOWN = 5, HAZE = 6, FAR = 7, OCHRE = 8, UMBER = 9;
    const OX = -1, OY = 4;                                         // the family 3x frame moved a col left and 4 rows down

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const copy = g => g.map(row => row.slice());
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    const N4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const touches = (r, c, test) => N4.some(([a, b]) => inside(r + a, c + b) && test(r + a, c + b));
    // Distance from (y, x) to the segment p q, points as [row, col].
    const seg = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };
    // Sprites are rows of letters (e ochre, u umber, h haze); a dot leaves the cell alone.
    const INK = {e: OCHRE, u: UMBER, h: HAZE};
    const stamp = (g, art, r0, c0) => art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(g, r0 + dr, c0 + dc, INK[ch]); }));

    // ---- the landscape, behind everything ----
    // The far mountains' top row in every col (the middle stands behind the head, so it is never seen).
    const SKYLINE = [16, 15, 13, 12, 13, 15, 14, 15, 17, 18, 18, 20, 21, 21,
      21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 20, 19,
      17, 15, 12, 10, 8, 9, 11, 10, 9, 10, 12, 11, 13];
    const LAKE = [24, 19], HILLS = [27, 25];                       // [left, right]: the lake's first row, the hills' first row
    const ROAD = [[40, 1], [37, 4.5], [34, 6], [32, 3.5], [30, 3], [28.5, 6]];   // up the left hills, widening as it nears
    const RIVER = ['.hh.', '.hh.', 'hh..', 'hh..', '.hh.', '..hh'];             // down the right hills from the bridge
    const BRIDGE = ['eeeeeeeee', 'uuuuuuuuu', 'e.eee.eee', '...e...e.'];        // deck, its shade, the arches over the water
    const BG = (() => {
      const g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const k = c < 30 ? 0 : 1, top = SKYLINE[c];
        let v = HAZE;                                              // the sky, and the lake under the mountains
        if (r >= top && r < LAKE[k]) v = FAR;                      // the mountains, ending on a clean edge over the lake
        if (r >= HILLS[k]) v = OCHRE;                              // the hills
        g[r][c] = v;
      }
      for (let r = HILLS[0]; r < 42; r++) for (let c = 0; c < 15; c++) {
        for (let i = 0; i + 1 < ROAD.length; i++) if (seg(r + 0.5, c + 0.5, ROAD[i], ROAD[i + 1]) <= (r > 35 ? 0.95 : 0.6)) g[r][c] = HAZE;
      }
      stamp(g, RIVER, HILLS[1], 53);
      stamp(g, BRIDGE, 20, 53);
      return g;
    })();

    // ---- the sitter ----
    const BOX = [12 + OY, 15 + OX, 47 + OX];                       // the box: top row, left col, right col
    const VR = [18 + OY, 23 + OY], VC = [18 + OX, 44 + OX];         // the visor band's rows and cols
    const EYE_C = [21 + OX, 39 + OX];                              // each slit's left col, 3 across
    const MID = 31 + OX;                                           // the face's centre col
    const TIP = [3 + OY, 45 + OX];                                 // the antenna tip's top left cell, 3 x 3
    const MOUTH_ROW = 31;                                          // the mouth's bottom row
    const NECK = c => 39 - Math.round(2 * ((c - MID) / 16) ** 2);  // the neckline: row 39 at the centre, 37 at the sides
    const SHOULDER = 31, SLOPE = 1.1;                              // the gown's half width grows SLOPE a row from here
    const HAIR_END = 40;                                           // the curtains' last row
    const CROWN = [2, 0, -3];                                      // the crown's rows over the box, cols past each side
    const hairW = r => 3 + (r > 28 ? 1 : 0) + (Math.floor((r - BOX[0]) / 3) % 2) - (r === BOX[0] ? 1 : 0) - Math.max(0, r - (HAIR_END - 2));
    // The arms: a sleeve from off the frame to the wrist, a mitt from the wrist to the fingertips; the far one first.
    const SLEEVE_R = 2.9, HAND_R = 2.5;
    const ARMS = [[[54, 64], [53.5, 37], [53.5, 28]], [[43, -3], [50.5, 23], [51.5, 30]]];
    // Mouths, centred on MID: s the soft gown teal, k dark.
    const MOUTHS = {flat: ['sssssss'], faint: ['s.....s', '.sssss.'], smile: ['s.......s', '.kkkkkkk.']};
    const pose = ping => {
      const src = upscale(echoPing(ping), K), g = blank();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (src[r][c] && !(r >= 21 && r <= 32 && (c <= 14 || c >= 48))) put(g, r + OY, c + OX, src[r][c]);   // no arm stubs
      }
      return g;
    };

    // A frame. o: eyes, the slits' drift in cells (negative is left); lid 0 open, 1 half, 2 shut; mouth 'flat', 'faint'
    // or 'smile'; ping, the antenna tip lit; glint 1 or 2, the star's size (it lights the tip too).
    function frame(o) {
      const eyes = o.eyes || 0, lid = o.lid || 0;
      const P = pose(!!o.ping || !!o.glint), fig = blank();
      // the head above the neckline, the gown below it and out to the shoulders, the trim on the line
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (P[r][c] && (c < BOX[1] || c > BOX[2] || r < NECK(c))) fig[r][c] = P[r][c];
      for (let r = SHOULDER; r < N; r++) for (let c = 0; c < N; c++) {
        if (Math.abs(c - MID) <= 16.5 + (r - SHOULDER) * SLOPE && (c < BOX[1] || c > BOX[2] || r >= NECK(c))) fig[r][c] = GOWN;
      }
      for (let c = BOX[1]; c <= BOX[2]; c++) fig[NECK(c)][c] = OCHRE;
      // the hair: the curtains, then the crown over the box, the antenna standing through it
      for (let r = BOX[0]; r <= HAIR_END; r++) for (let k = 0; k < hairW(r); k++) { put(fig, r, BOX[1] - 1 - k, UMBER); put(fig, r, BOX[2] + 1 + k, UMBER); }
      CROWN.forEach((out, i) => { for (let c = BOX[1] - out; c <= BOX[2] + out; c++) put(fig, BOX[0] - 1 - i, c, UMBER); });
      for (let r = 0; r < BOX[0]; r++) for (let c = 0; c < N; c++) if (P[r][c]) fig[r][c] = P[r][c];
      // the face: the band, the slits drifted and lidded, the mouth
      for (let r = VR[0]; r <= VR[1]; r++) for (let c = VC[0]; c <= VC[1]; c++) fig[r][c] = VISOR;
      const lidTop = [VR[0], VR[0] + 3, VR[1] - 1][lid], wide = lid === 2 ? 1 : 0;   // shut: a line a cell wider each side
      for (const c0 of EYE_C) for (let r = lidTop; r <= VR[1]; r++) for (let c = c0 - wide; c < c0 + 3 + wide; c++) fig[r][c + eyes] = EYE;
      const M = MOUTHS[o.mouth || 'faint'];
      M.forEach((line, dr) => [...line].forEach((ch, dc) => {
        if (ch !== '.') put(fig, MOUTH_ROW - (M.length - 1) + dr, MID - (line.length - 1) / 2 + dc, ch === 'k' ? EYE : GOWN);
      }));
      // the arms; part numbers rise in drawing order: 1 and 2 the far sleeve and hand, 3 and 4 the near ones
      const part = blank();
      ARMS.forEach(([from, wrist, tip], k) => {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (seg(r + 0.5, c + 0.5, from, wrist) <= SLEEVE_R) { fig[r][c] = OCHRE; part[r][c] = 2 * k + 1; }
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (seg(r + 0.5, c + 0.5, wrist, tip) <= HAND_R) { fig[r][c] = BODY; part[r][c] = 2 * k + 2; }
      });
      // lines, all umber: a piece of the far arm where the near arm lies on it (on the lower hand, the crease; in the
      // gown teal it was too soft, and the two hands merged into one long mitt), a sleeve where its own hand comes out
      // of it (the cuff), and a hand where it lies on the gown
      const ink = copy(fig);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const p = part[r][c];
        if (!p) continue;
        if (touches(r, c, (y, x) => part[y][x] > p && (part[y][x] - 1) >> 1 !== (p - 1) >> 1)) ink[r][c] = UMBER;
        if (p % 2 && touches(r, c, (y, x) => part[y][x] === p + 1)) ink[r][c] = UMBER;
        if (!(p % 2) && touches(r, c, (y, x) => !part[y][x])) ink[r][c] = UMBER;
      }
      // over the landscape, then the rim: every landscape cell beside the figure goes umber
      const g = copy(BG);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fig[r][c]) g[r][c] = ink[r][c];
      const out = copy(g);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!fig[r][c] && touches(r, c, (y, x) => fig[y][x])) out[r][c] = UMBER;
      // the glint: the lit tip loses its outline and a star of ping opens round it
      if (o.glint) {
        const cr = TIP[0] + 1, cc = TIP[1] + 1;
        for (let c = TIP[1]; c <= TIP[1] + 2; c++) out[TIP[0] - 1][c] = g[TIP[0] - 1][c];
        for (let r = TIP[0]; r <= TIP[0] + 2; r++) for (const c of [TIP[1] - 1, TIP[1] + 3]) out[r][c] = g[r][c];
        for (let k = 2; k <= 1 + o.glint; k++) for (const [a, b] of N4) put(out, cr + a * k, cc + b * k, PING);
        if (o.glint === 2) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put(out, cr + 2 * a, cc + 2 * b, PING);
      }
      return out;
    }

    const frames = [], F = (hold, o = {}) => frames.push({hold, grid: frame(o)});
    // 1. The postcard: eyes on the viewer, the faint smile (the loop anchor, the dominant state).
    F(2800);
    // 2. Someone walks past on the left: the eyes drift after them and hold; looking away, the smile settles flat.
    F(200, {eyes: -1}); F(400, {eyes: -2}); F(900, {eyes: -2, mouth: 'flat'});
    // 3. The eyes come back to the viewer and the smile deepens; a blink on it; it fades back to the faint one.
    F(180, {eyes: -1, mouth: 'flat'}); F(180, {mouth: 'flat'}); F(300); F(1300, {mouth: 'smile'});
    F(70, {mouth: 'smile', lid: 1}); F(120, {mouth: 'smile', lid: 2}); F(70, {mouth: 'smile', lid: 1}); F(400, {mouth: 'smile'});
    F(500);
    // 4. The same to the right.
    F(200, {eyes: 1}); F(400, {eyes: 2}); F(900, {eyes: 2, mouth: 'flat'});
    F(180, {eyes: 1, mouth: 'flat'}); F(180, {mouth: 'flat'}); F(300);
    // 5. The slow glint, the smile deepening with it; the lit tip goes out on the loop back to the postcard.
    F(250, {ping: true}); F(200, {glint: 1}); F(450, {glint: 2, mouth: 'smile'}); F(200, {glint: 1, mouth: 'smile'}); F(250, {ping: true});

    return {
      name: 'ECHO · mona lisa', key: 'echo_mona_lisa', fwname: 'echo mona lisa', category: 'Idle', size: N,
      // Big tier, like the other HD cells: 24 frames of 3600 bytes (86400 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: "Proposal, culture, 60 cell lattice (8 px cells, the creature at 3x as in mushroom HD), after Leonardo's Mona Lisa (about 1503, public domain): the creature sits for it half length, the frame cutting it off under its folded hands, its box the face with the family's visor and slit eyes, long dark brown hair falling from a crown over its head to its shoulders with the antenna standing up through it, a gown in its own feet teal under a shallow ochre trimmed neckline, ochre sleeves coming in from both sides and two teal mitts folded one over the other at the bottom centre, the lower one showing beside the upper, in front of a sfumato landscape (a warm pale sky, jagged blue green mountains standing over a pale lake on each side, ochre hills, a pale road winding up on the left, a small arched bridge on the right where a river leaves the lake); it rests on the postcard, eyes on the viewer and a faint smile, then its eyes drift two cells left after someone walking past while the smile settles flat, come back to the viewer as the smile deepens, blink, drift right and back the same way, and end on a slow glint, the antenna tip lit with a four point star of ping opening and closing round it while it smiles; judge whether it reads as the Mona Lisa from a metre away, whether the faint smile still shows on the panel itself (it is soft teal on the teal face), whether the smile reads as coming and going rather than switching, whether the hair and the gown read as a costume on the creature, and whether it is still this creature.",
      // 0 transparent, 1 body (the face and the hands), 2 eyes and the deep smile, 3 visor, 4 ping (the antenna tip and the
      // glint), 5 the feet teal (the gown, the soft mouth), 6 haze (sky, lakes, road, river), 7 the far mountains,
      // 8 ochre (hills, sleeves, neckline trim, bridge), 9 umber (hair, rim, cuffs, the hands' outline and crease, the
      // shade under the bridge's deck)
      palette: [...ECHO_PALETTE.slice(0, 6), '#cbc8a0', '#7b9488', '#9a7536', '#2c2117'],
      frames,
    };
  })();

  L.register([echoMonaLisa]);
})(typeof window !== 'undefined' ? window : globalThis);
