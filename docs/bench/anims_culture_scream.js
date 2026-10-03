// Culture creatures: the ECHO creature steps into famous pictures (operator, 2026-10-02: "famous paintings, memes,
// popculture ... get crazy get creative"). The ECHO creature plays every role; a picture lends only its composition,
// its setting and its gesture, and a painting used here is in the public domain. Loaded after anims.js (bench: script
// tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {upscale, echoPing, ECHO_PALETTE} = L;

  // ---------- echo scream ----------
  // The Scream (Edvard Munch, 1893), played by the ECHO creature on a 60 cell lattice, 8 px cells on the 480 panel,
  // built the way mushroom HD is built: every pose is the family's 20 cell pose repeated exactly 3 times across and
  // down, so the silhouette, the visor band, the antenna and the legs are the family's own, and the new detail is drawn
  // on the fine lattice. The painting's composition in a close crop round its figure: the creature stands right of
  // centre on the bridge, the panel's bottom edge cutting it at the knees, in front of a sky of wavy red, orange and gold
  // bands; the bridge's railing, two rails with the fjord showing between them, drives the diagonal from behind the
  // creature up to the far end at the left edge, where the companions walk on: two tiny ECHO minis, seen from behind
  // with their antennas on the left and a dark teal strap across the back of each head. Under the horizon the fjord is
  // dark blue with black troughs. The landscape takes only cells that are empty and not beside the creature or the
  // pair, so a dark rim outlines them everywhere but at two edges of the panel: the bottom edge cuts the creature at
  // the knees, and the far mini stands against the left edge, where the bridge runs out of the picture. The creature
  // sits 5 cols right of the family frame, not 7: at 7 its right arm and the scream's right elbow ran into the panel's
  // right edge with no rim; at 5 they end on col 58 with col 59 dark in every frame, and the railing gives up 2 cols.
  //   calm      the sky drifts, one ping; on the last calm frame the bands begin to churn.
  //   startle   the slits pop to wide eyes (a dark ring round a pupil, in a band grown a row each way), the head grows a
  //             row and the antenna pings.
  //   hands     two frames: pale hands slide up the body's sides, then press the cheeks, fingers up, the forearms down
  //             to elbows low at the sides; the mouth opens round as the head grows.
  //   scream    2.2 s: the mouth an O 7 across and 12 tall, the head 6 rows taller (3 of forehead, 3 under the mouth)
  //             with the antenna riding up whole on top of it, its tip on row 8; the forehead and the antenna shudder
  //             along a wave while the face block holds still; the bands swell, churn faster and bend under a ripple
  //             that runs out from the mouth 3 cells a frame, and the water's troughs bend with it; on the third frame
  //             the pair far back turns round to stare, the nearer one's antenna pinging.
  //   calm      the mouth closes in two frames as the hands slide down and drop (the half way frame a quick 120 ms),
  //             and the slits come back for a still beat of 400 ms while the pair stares.
  //   sheepish  the antenna droops over the head, the eyes glance left at the staring pair, a blush comes up under the
  //             visor, a slow blink, a lopsided smile; the pair turns back, the antenna springs up with a meek ping, and
  //             it rests before the next scream.
  // Sky clock: on time, like mushroom HD's: every frame moves the waves by its hold times a rate, 1 in the calm and
  // rising with the ripple to 5 in the scream, scaled so one loop turns them exactly 3 times, so the drift keeps one
  // speed through the short frames (a ping, a blink) and the long rests alike, and the last frame runs into the first
  // like any other step (a 37th frame would be frame 0 cell for cell). The ripple runs 3 cells a frame, only from the
  // last calm frame to the first calm down frame, and the stretch, the arms and the pair are back in their frame 0
  // state by the end.
  // Constants: 60 cells of 8 px; the creature at 3x, 5 cols right of and 11 rows below the family frame (legs cut at row
  // 59, the antenna's tip on row 14 at rest and on row 8 at full stretch); horizon row 36; the rails' top edges at rows
  // 37 and 39.5 on col 0, falling 0.6 and 0.75 a col, 1 cell thick there and growing toward the creature; the pair at
  // cols 0 and 6, 5 by 7 and 6 by 8 cells; bands 3.2 rows; ripple wavelength 18 cells in the sky and 12 in the water;
  // sky clock rate 1 calm, 5 at the scream's full ripple, 3 turns a loop; scream 16 frames of 140 ms; 36 frames, 8.47 s.
  // Palette: 0..5 the ECHO palette unchanged (3 is also the hands and the pair's visors, 5 also the hands' edges and the
  // pair's feet and straps); 6 orange (sky bands and the rails), 7 red (sky bands and the blush), 8 the fjord's blue, 9 gold (sky
  // bands). Index 6 is not ping here, so no frame goes through echoGlitch. Big tier: 36 frames of 3600 cells are 129600
  // bytes of firmware table, so it ships only on boards built with SPLASH_BIG. One closure, so echoScream is the only
  // name it adds to this scope.
  const echoScream = (() => {
    const N = 60, K = 3;                                           // lattice; a 20 cell pose repeated K times across and down
    const BODY = 1, EYE = 2, VISOR = 3, PING = 4, DEEP = 5, ORANGE = 6, RED = 7, SEA = 8, GOLD = 9;
    const OX = 5, OY = 11;                                         // the family frame sits 5 cols right and 11 rows down
    const HIPS = 42 + OY;                                          // the first leg row on the panel
    const HORIZON = 36;                                            // sky rows 0..35, the fjord from row 36
    // The two rails: top edge row and thickness at col c, both growing toward the creature; the walkway under the lower.
    const RAILS = [{top: c => 37 + 0.6 * c, th: c => 1 + 0.1 * c}, {top: c => 39.5 + 0.75 * c, th: c => 1 + 0.05 * c}];
    const PAIR = [[31, 0], [34, 6]];                               // the pair far back: [top row, left col], far one first
    const VT = 18;                                                 // the family visor band's top row
    const MOUTH = [OY + 26, OX + 31];                              // the ripple's centre on the panel: the open mouth
    const SCREAM = 16, TURNS = 3;                                  // scream frames; wave turns a loop
    const RING = 2.6, CHURN = 5;                                   // the scream's ripple height; the sky clock's rate there

    const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
    const copy = g => g.map(row => row.slice());
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const put = (g, r, c, v) => { if (inside(r, c)) g[r][c] = v; return g; };
    // Distance from (y, x) to the segment p q; a cell centre inside an ellipse.
    const seg = (y, x, p, q) => {
      const vy = q[0] - p[0], vx = q[1] - p[1], L2 = vy * vy + vx * vx;
      const t = L2 ? Math.max(0, Math.min(1, ((y - p[0]) * vy + (x - p[1]) * vx) / L2)) : 0;
      return Math.hypot(y - p[0] - t * vy, x - p[1] - t * vx);
    };
    const ell = (r, c, cy, cx, ry, rx) => ((r + 0.5 - cy) / ry) ** 2 + ((c + 0.5 - cx) / rx) ** 2 <= 1;
    // Sprites are rows of letters (k dark, r red, v visor, b body, d legs' teal, p the antenna tip); a dot leaves the
    // cell alone.
    const INK = {k: EYE, r: RED, v: VISOR, b: BODY, d: DEEP, p: BODY};
    const stamp = (g, art, r0, c0) => { art.forEach((line, dr) => [...line].forEach((ch, dc) => { if (ch !== '.') put(g, r0 + dr, c0 + dc, INK[ch]); })); return g; };

    // The creature, on the family's 3x frame; place() shifts it onto the panel last.
    const pose = (ping = false) => upscale(echoPing(ping), K);
    // The family's arm stubs and hands off (rows 21..32, outside the body's cols 15..47), for the hands drawn raised.
    const noArms = g => { const b = copy(g); for (let r = 21; r <= 32; r++) for (let c = 0; c < N; c++) if (c <= 14 || c >= 48) b[r][c] = 0; return b; };
    // The head grows: e1 plain rows more forehead (copies of row 14), e2 plain rows more under the mouth (copies of row
    // 39); the legs stay planted, so the torso grows upward and the visor band rises e2 rows. The rows it pushes over
    // the family frame's top (at full stretch the antenna's tip, ping cell and all) come back as `over`, top row first,
    // and place() puts them on the open sky above, so the antenna keeps all 9 of its rows however far the head grows.
    function stretch(g, e1, e2) {
      if (!e1 && !e2) return {f: g, over: []};
      const rows = [];
      for (let r = 0; r <= 14; r++) rows.push(g[r]);
      for (let i = 0; i < e1; i++) rows.push(g[14]);
      for (let r = 15; r <= 39; r++) rows.push(g[r]);
      for (let i = 0; i < e2; i++) rows.push(g[39]);
      for (let r = 40; r <= 41; r++) rows.push(g[r]);
      const b = blank(), top = 42 - rows.length;                   // the family row the first row lands on
      for (let r = 42; r < N; r++) b[r] = g[r].slice();
      rows.forEach((row, i) => { if (top + i >= 0) b[top + i] = row.slice(); });
      return {f: b, over: rows.slice(0, Math.max(0, -top)).map(row => row.slice())};
    }
    // The antenna wilts into a hook: the stalk stands on rows 8..11, bends over the top (rows 5..7) toward the head and
    // hangs its tip down on rows 8..10, a row clear of the head. The gap between the tip and the stalk is one col, so it
    // stays rim and no sky shows through.
    function droop(g) {
      const b = copy(g);
      for (let r = 3; r <= 7; r++) for (let c = 45; c <= 47; c++) b[r][c] = 0;
      for (let r = 5; r <= 7; r++) for (let c = 41; c <= 47; c++) b[r][c] = BODY;
      for (let r = 8; r <= 10; r++) for (let c = 41; c <= 43; c++) b[r][c] = BODY;
      return b;
    }
    const band = (g, top, bot) => { for (let r = top; r <= bot; r++) for (let c = 18; c <= 44; c++) g[r][c] = VISOR; return g; };
    // The family's slit eyes, 3 by 6, slid dx cols along the band; the top `shut` rows of each go to visor: a blink.
    function slits(g, vt, dx = 0, shut = 0) {
      const b = band(copy(g), vt, vt + 5);
      for (let r = vt + shut; r <= vt + 5; r++) for (const c0 of [21, 39]) for (let c = c0; c < c0 + 3; c++) b[r][c + dx] = EYE;
      return b;
    }
    // Startled: the band grows a row each way and each eye is a dark ring 7 across and 8 tall round a pupil 1 by 2.
    function wide(g, vt) {
      const b = copy(g);
      for (let r = vt; r <= vt + 5; r++) for (let c = 18; c <= 44; c++) b[r][c] = BODY;
      band(b, vt - 1, vt + 6);
      for (const cx of [22.5, 40.5]) {
        const cy = vt + 3;
        for (let r = vt - 1; r <= vt + 6; r++) for (let c = Math.floor(cx - 4); c <= Math.ceil(cx + 4); c++) {
          if (ell(r, c, cy, cx, 4, 3.5) && !ell(r, c, cy, cx, 3, 2.5)) b[r][c] = EYE;
        }
        for (let r = vt + 2; r <= vt + 3; r++) b[r][Math.floor(cx)] = EYE;
      }
      return b;
    }
    // Mouths, centred on col 31: an O w across and h tall; a lopsided smile; a blush under each end of the band.
    const mouthO = (g, top, w, h) => { const b = copy(g); for (let r = top; r < top + h; r++) for (let c = 31 - w; c <= 31 + w; c++) if (ell(r, c, top + h / 2, 31.5, h / 2, w / 2)) b[r][c] = EYE; return b; };
    const SMIRK = ['.....k', 'kkkkk.'];
    const BLUSH = ['rrrr', 'rrrr'];
    // A hand pressed to the cheek, fingers up, and its forearm from an elbow low at the side: an upright oval 7 across and
    // 11 tall in the visor's pale teal, a dark teal edge wherever it lies on the body, two finger gaps down from its top.
    // At 1 it presses the cheek; at 0.5 it is half way up, straddling the body's edge. Left side, the right mirrored
    // about col 31; rows are counted from the band's top, vt.
    const HAND_AT = {1: {hc: [11, 16], elbow: [21, 11], wrist: [15, 15]}, 0.5: {hc: [18, 14.5], elbow: [25, 11], wrist: [22, 13.5]}};
    function hands(g, vt, u) {
      const b = copy(g), body = copy(g), {hc, elbow, wrist} = HAND_AT[u], ry = 5.5, rx = 3.6;
      for (const s of [-1, 1]) {
        const mc = c => (s < 0 ? c : 62 - c);
        const H = [vt + hc[0], mc(hc[1]) + 0.5], E = [vt + elbow[0], mc(elbow[1]) + 0.5], W = [vt + wrist[0], mc(wrist[1]) + 0.5];
        const arm = (r, c) => seg(r + 0.5, c + 0.5, E, W) <= 1.9;
        const hand = (r, c) => ell(r, c, H[0], H[1], ry, rx);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (arm(r, c) && !hand(r, c)) b[r][c] = BODY;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (hand(r, c)) b[r][c] = VISOR;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (!(hand(r, c) || arm(r, c))) continue;
          const onBody = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, d]) => inside(r + a, c + d) && body[r + a][c + d] && !hand(r + a, c + d) && !arm(r + a, c + d));
          if (onBody) b[r][c] = DEEP;
        }
        const top = Math.ceil(H[0] - ry);
        for (const dc of [-1, 1]) for (let r = top; r < top + 3; r++) { const c = Math.floor(H[1] + dc * rx * 0.42); if (hand(r, c)) b[r][c] = DEEP; }
      }
      return b;
    }
    // The shudder: torso rows slide sideways along a wave 22 rows long, amp cells at most; the face block (the band down to
    // the mouth's last row) moves as one, by the wave at its middle, so the eyes and the O never shear; the legs stay.
    // The rows over the frame's top (`over`, the antenna's tip) ride the same wave, counted on upward past row 0.
    function shudder(g, over, amp, ph, face) {
      const b = blank();
      for (let r = 42; r < N; r++) b[r] = g[r].slice();
      const at = r => Math.round(amp * Math.sin(2 * Math.PI * r / 22 + ph));
      const slide = (row, dx) => { const s = new Array(N).fill(0); row.forEach((v, c) => { if (v && c + dx >= 0 && c + dx < N) s[c + dx] = v; }); return s; };
      for (let r = 0; r < 42; r++) b[r] = slide(g[r], r >= face[0] && r <= face[1] ? at((face[0] + face[1]) >> 1) : at(r));
      return {f: b, over: over.map((row, i) => slide(row, at(i - over.length)))};
    }
    // Onto the panel, OX cols right and OY rows down; the rows over the frame's top land on the rows above OY.
    const place = (f, over) => {
      const g = blank();
      [...over, ...f].forEach((row, i) => row.forEach((v, c) => { if (v) put(g, i - over.length + OY, c + OX, v); }));
      return g;
    };

    // The pair far back on the bridge: two ECHO minis, from behind (the antenna on the left, a dark teal strap across the
    // back of the head where the visor sits in front) or turned round to stare.
    const MINIS = [
      {back: ['p....', 'b....', 'ddddd', 'bbbbb', 'bbbbb', 'bbbbb', 'd...d'], front: ['....p', '....b', 'vkvkv', 'bbbbb', 'bbbbb', 'bbbbb', 'd...d']},
      {back: ['p.....', 'b.....', 'dddddd', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'd.dd.d'], front: ['.....p', '.....b', 'vkvvkv', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'd.dd.d']},
    ];
    function pair(g, side, ping) {
      PAIR.forEach(([r0, c0], i) => {
        const art = MINIS[i][side];
        stamp(g, art, r0, c0);
        if (ping === i) put(g, r0, c0 + (side === 'back' ? 0 : art[0].length - 1), PING);
      });
      return g;
    }

    // The landscape.
    // Bands 3.2 rows deep in a run of colours from the top, their edges two sine waves across (30 and 13 cells long, the
    // second sheared down the rows) moved by the sky clock; in the scream they swell and a ripple 18 cells long runs out
    // from the mouth, bending them (s.ring is its height in rows, s.rho0 how far it has run).
    const BANDS = [RED, ORANGE, RED, ORANGE, GOLD, ORANGE, RED, ORANGE, GOLD, ORANGE, GOLD, ORANGE];
    const BAND_T = 3.2;
    const rhoAt = (r, c) => Math.hypot(r - MOUTH[0], (c - MOUTH[1]) * 0.8);
    function skyCell(r, c, s) {
      const k = s.ring / RING;
      let f = r + (1.7 + 0.5 * k) * Math.sin(2 * Math.PI * c / 30 - s.phi) + (0.9 + 0.1 * k) * Math.sin(2 * Math.PI * c / 13 + 0.45 * r + 2 * s.phi);
      if (s.ring) f += s.ring * Math.sin(2 * Math.PI * (rhoAt(r, c) - s.rho0) / 18);
      const n = Math.floor(f / BAND_T);
      return BANDS[((n % BANDS.length) + BANDS.length) % BANDS.length];
    }
    // The fjord: dark blue with black troughs, short dashes that lengthen down the rows and run with the sky clock; the
    // ripple bends them too.
    function seaCell(r, c, s) {
      const d = r - HORIZON;
      const bend = s.ring ? (s.ring / RING) * 2.4 * Math.sin(2 * Math.PI * (rhoAt(r, c) - s.rho0) / 12) : 0;
      return Math.sin(2 * Math.PI * c / (7 + d * 0.4) + d * 1.9 + 2 * s.phi + bend) > 0.72 ? 0 : SEA;
    }
    // Everything behind the creature and the pair, on cells that are empty and off their rim: between the legs and under
    // the lower rail the walkway (panel black), the rails, then the sky over the horizon and the fjord under it.
    function scene(g, s) {
      const rim = g.map((row, r) => row.map((v, c) => {
        if (v) return false;
        for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) if (inside(r + a, c + d) && g[r + a][c + d]) return true;
        return false;
      }));
      const [R0, R1] = RAILS;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (g[r][c] || rim[r][c]) continue;
        if (r >= HIPS && c >= 15 + OX && c <= 47 + OX) continue;
        const y = r + 0.5;
        if (y >= R1.top(c) + R1.th(c)) continue;
        if ((y >= R0.top(c) && y < R0.top(c) + R0.th(c)) || y >= R1.top(c)) { g[r][c] = ORANGE; continue; }
        g[r][c] = r < HORIZON ? skyCell(r, c, s) : seaCell(r, c, s);
      }
      return g;
    }

    // A frame. o: ping; face 'wide' (else the slits, slid look cols, the top shut rows closed); mouth ['O', w, h] or
    // 'smirk'; blush; hands 0.5 or 1 (else the family's own arms); st [e1, e2] the stretch; shake [amp, phase]; droop;
    // pair 'back' or 'front', pairPing (which mini's antenna pings). s: the sky clock phi, the ripple's ring and rho0.
    function frame(o, s) {
      const [e1, e2] = o.st || [0, 0], vt = VT - e2;
      let f = pose(!!o.ping);
      if (o.droop) f = droop(f);
      if (o.hands) f = noArms(f);
      let over;                                                    // the stretched rows over the frame's top
      ({f, over} = stretch(f, e1, e2));
      f = o.face === 'wide' ? wide(f, vt) : slits(f, vt, o.look || 0, o.shut || 0);
      if (o.blush) { stamp(f, BLUSH, vt + 7, 18); stamp(f, BLUSH, vt + 7, 41); }
      if (Array.isArray(o.mouth)) f = mouthO(f, vt + (o.mouth[2] >= 10 ? 9 : 10), o.mouth[1], o.mouth[2]);
      else if (o.mouth === 'smirk') stamp(f, SMIRK, vt + 10, 30);
      if (o.hands) f = hands(f, vt, o.hands);
      if (o.shake) ({f, over} = shudder(f, over, o.shake[0], o.shake[1], [vt - 1, vt + 21]));
      const g = place(f, over);
      pair(g, o.pair || 'back', o.pairPing);
      return scene(g, s);
    }

    // The loop: [hold ms, the frame's options, its ripple height (0 none)].
    const plan = [];
    const P = (hold, o, ring = 0) => plan.push({hold, o, ring});
    // Calm: the sky drifts, one ping; then the bands begin to churn.
    P(450, {}); P(450, {}); P(150, {ping: true}); P(450, {}); P(420, {}, 0.8);
    // The startle, and the hands fly up as the mouth opens.
    P(160, {ping: true, face: 'wide', st: [1, 0]}, 1.4);
    P(110, {face: 'wide', hands: 0.5, mouth: ['O', 3, 5], st: [1, 1]}, 2);
    P(110, {face: 'wide', hands: 1, mouth: ['O', 5, 8], st: [2, 2]}, 2.4);
    // The scream; on its third frame the pair far back turns round, the nearer one's antenna pinging.
    for (let i = 0; i < SCREAM; i++) {
      P(140, {face: 'wide', hands: 1, mouth: ['O', 7, 12], st: [3, 3], shake: [1, i * Math.PI / 2], pair: i >= 2 ? 'front' : 'back', pairPing: i === 2 ? 1 : undefined}, RING);
    }
    // Calming down: the mouth closes as the hands slide down and drop (the half way frame only a blink long), and the
    // slits come back for a still beat while the pair stares.
    P(200, {face: 'wide', hands: 1, mouth: ['O', 5, 8], st: [2, 2], pair: 'front'}, 1.4);
    P(120, {face: 'wide', hands: 0.5, mouth: ['O', 3, 5], st: [1, 1], pair: 'front'});
    P(400, {pair: 'front'});
    P(400, {pair: 'front', droop: true});
    // Sheepish: a glance at the staring pair, a blush, a slow blink, a lopsided smile; the pair turns back; the antenna
    // springs up with a meek ping; rest (it loops to the calm).
    P(500, {look: -3, blush: true, droop: true, pair: 'front'});
    P(120, {look: -3, shut: 3, blush: true, droop: true, pair: 'front'});
    P(260, {look: -3, shut: 5, blush: true, droop: true, pair: 'front'});
    P(120, {look: -3, shut: 3, blush: true, droop: true, pair: 'front'});
    P(600, {look: -3, blush: true, mouth: 'smirk', droop: true, pair: 'front'});
    P(450, {mouth: 'smirk', droop: true});
    P(160, {ping: true});
    P(600, {});

    // The sky clock runs on time, the way mushroom HD sums its holds: a frame moves the waves by its hold times a rate, 1
    // in the calm and rising with the ripple to CHURN at the scream's full height, all scaled so one loop turns them
    // exactly TURNS times. A frame shows the clock at its start, so the step into the next frame is the time this one
    // held: a 120 ms blink moves the sky a fifth of what a 600 ms rest does. The clock is kept as a fraction of a turn,
    // so at the loop's end (acc equal to total) it is 0 again exactly: the last frame runs into the first like any other
    // step, and a 37th frame would be frame 0 cell for cell. The ripple instead runs 3 cells a frame while it is up
    // (frames 4 to 24), so it never jumps half a wave on the one long frame that carries it.
    const rate = p => 1 + (CHURN - 1) * p.ring / RING;
    const total = plan.reduce((a, p) => a + p.hold * rate(p), 0);
    const clock = acc => 2 * Math.PI * ((TURNS * (acc / total)) % 1);
    let acc = 0, rho0 = 0;
    const frames = plan.map(p => {
      const phi = clock(acc);
      acc += p.hold * rate(p);
      if (p.ring) rho0 += 3;
      return {hold: p.hold, grid: frame(p.o, {phi, ring: p.ring, rho0})};
    });

    return {
      name: 'ECHO · scream', key: 'echo_scream', fwname: 'echo scream', category: 'Active', size: N,
      // Big tier, like the other HD cells: 36 frames of 3600 bytes (129600 bytes) ship only on boards built with SPLASH_BIG.
      tier: 'big',
      intent: 'Proposal, 60 cell lattice (8 px cells, the creature at 3x as in mushroom HD), after Munch\'s The Scream of 1893: the creature stands on the bridge, cut at the knees by the panel\'s bottom edge and outlined dark everywhere else, in front of a sky of wavy red, orange and gold bands that drift at one even speed, while the bridge\'s railing drives the diagonal from behind it up to the far end at the left edge, where two tiny ECHO minis walk on with their backs turned, a dark strap across each head, and the fjord under the horizon is dark blue with moving black troughs; the bands begin to churn, its slits pop wide with a ping, pale hands fly up to its cheeks, the mouth opens into a tall O and its head stretches six rows with the antenna riding up whole on top, and for 2.2 s it screams, its forehead and antenna shuddering while the face holds still, the bands churning faster, swelling and bending under ripples that run out from its mouth and the water\'s troughs bending with them, the two minis far back turning round to stare; then it calms, the mouth closing as the hands slide down and drop, a still beat, its antenna droops, it glances at the pair with a blush, blinks slowly and gives a lopsided smile, the pair turns back, the antenna springs up with a meek ping, and it rests before screaming again; judge whether the hands and the O read as the painting\'s gesture from a metre away, whether the railing and the pair read as the bridge, and whether the churned sky reads as the scream rippling out rather than as noise.',
      // 0 transparent, 1 body (and the pair), 2 eyes, the O and the pair's eyes, 3 visor (also the hands and the pair's
      // visors), 4 ping (the antenna tips), 5 legs (also the hands' edges and the pair's feet and straps), 6 orange (sky
      // bands, the rails), 7 red (sky bands, the blush), 8 the fjord's blue, 9 gold (sky bands)
      palette: [...ECHO_PALETTE.slice(0, 6), '#f08a24', '#d2381f', '#22408f', '#f6c445'],
      frames,
    };
  })();

  L.register([echoScream]);
})(typeof window !== 'undefined' ? window : globalThis);
