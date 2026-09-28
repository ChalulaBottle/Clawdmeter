// ECHO creature, the thinking and working set. Five cells registered into the bench through
// BENCH_LIB (anims.js holds the lattice rules and the shared helpers; this file only adds cells).
//
//   echo think spin  both eyes roll clockwise round their own 2x2 corner of the visor, in step,
//                    while the visor breathes echo to ping
//   echo think deep  the visor band goes dark so the eyes glow; a slower roll, one colour per turn
//   echo work        seated at a two row slate desk; the hands tap in bursts, each press flicks the visor
//   echo write       the creature steps two cells left; a one cell cursor types three lines of
//                    1 cell text beside it, then the page clears
//   echo read        the eyes sweep the visor one cell at a time and snap back at each line end
//
// Every frame is echoBase (shifted two cells left for write) repainted through one face factory:
// visor band rows 6..7 cols 6..14, the eye cells inside it, the antenna tip at (1,15). Only the
// listed extras (desk and forearms for work, the text block for write) add cells, so the silhouette
// is the creature's in every frame. The antenna tip rests unlit (body colour) as in "echo idle"
// and lights only on an event.
// Name note: "echo think" and key echo_think already belong to the skinned stock work_think cell
// in anims.js, so the spinning eyes register as "echo think spin".
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {G, rows, clone, set, BASE, blink, shut, ECHO_PALETTE, echoBase, echoPing, echoGlitch, bbox, eyeGeom, skinFrame, spinnerAt, STOCK} = L;

  // Palette indices shared by every cell here: the first six ECHO tokens, in ECHO_PALETTE order
  // (transparent, body 17836f, dark 06090b, echo 35e0c0, ping 6fe9ff, feet 0f5a4c). X1 and X2 are
  // the two per cell extras (breath tones, flash and amber, desk, cursor).
  const BODY = 1, DARK = 2, ECHO = 3, PING = 4, X1 = 6, X2 = 7;
  const PAL = ECHO_PALETTE.slice(0, 6);

  // Face geometry of echoBase.
  const VISOR_ROWS = [6, 7], VISOR_C0 = 6, VISOR_C1 = 14, EYE_COLS = [7, 13], TIP_R = 1, TIP_C = 15;

  // The one face factory: repaint the visor band, paint the eye cells, set the antenna tip.
  // dx moves the whole face with a shifted body (write).
  function face(g, {visor = ECHO, eye = DARK, eyes = sweepEyes(0), tip = BODY, dx = 0} = {}) {
    const b = clone(g);
    for (const r of VISOR_ROWS) for (let c = VISOR_C0; c <= VISOR_C1; c++) set(b, r, c + dx, visor);
    for (const [r, c] of eyes) set(b, r, c + dx, eye);
    set(b, TIP_R, TIP_C + dx, tip);
    return b;
  }
  // Eyes as whole 1x2 bars moved sideways by o; o in -1..1 keeps both inside the visor.
  function sweepEyes(o) { const e = []; for (const c of EYE_COLS) e.push([6, c + o], [7, c + o]); return e; }
  // Half shut (a blink): the top cell of each eye goes back to visor, only row 7 stays dark.
  function halfEyes(o) { return EYE_COLS.map(c => [7, c + o]); }
  // Spinning eyes: each eye is a two cell bar walking clockwise round the four cells of its 2x2 block
  // (cols 7..8 and 13..14, rows 6..7). Phase 0 is the resting 1x2 eye, 1 the top pair (looking up),
  // 2 the right pair, 3 the bottom pair. Both blocks sit right of their eye, so the eyes move in step.
  const RING2 = [[0, 0], [0, 1], [1, 1], [1, 0]];   // TL, TR, BR, BL: clockwise
  function orbitEyes(phase) {
    const k = ((phase % 4) + 4) % 4, pair = [RING2[(k + 3) % 4], RING2[k]];
    const e = []; for (const c of EYE_COLS) for (const [dr, dc] of pair) e.push([6 + dr, c + dc]);
    return e;
  }
  // Move every cell sideways; cells pushed off the lattice are dropped, never wrapped.
  function shiftX(g, dx) {
    const b = g.map(() => new Array(G).fill(0));
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) { const s = c - dx; if (s >= 0 && s < G) b[r][c] = g[r][s]; }
    return b;
  }
  const F = (hold, grid) => ({hold, grid});

  // 1. echo think spin. Eight steps are two turns of the eyes; the first step is the rest on the
  // normal face. The visor tone rides a slow triangle (echo, two breath tones, ping and back) and
  // the antenna tip lights for the two peak steps.
  const SPIN_STEP = 450, SPIN_REST = 1200;
  const thinkSpin = (() => {
    const T1 = X1, T2 = X2;
    const TONE = [ECHO, ECHO, T1, T2, PING, PING, T2, T1];
    return {
      name: 'ECHO · think spin', key: 'echo_think_spin', fwname: 'echo think spin', category: 'Active',
      intent: 'Proposal. Thinking: both eyes roll clockwise in step round their own 2x2 corner of the visor (450 ms a step, a 1.2 s rest on the normal face every two turns) while the visor breathes echo to ping and the antenna lights at the peak; judge whether the slow roll reads as thinking rather than dizzy.',
      palette: [...PAL, '#48e3d5', '#5ce6ea'],
      frames: TONE.map((visor, s) => F(s === 0 ? SPIN_REST : SPIN_STEP,
        face(echoBase, {visor, eyes: orbitEyes(s), tip: visor === PING ? PING : BODY}))),
    };
  })();

  // 2. echo think deep. Same roll, slower, on a dark visor band (index 2, not 0, so the band keeps
  // its cells) with glowing eyes: one colour per turn, the turn starting with a longer hold on the
  // resting eye shape; the antenna tip carries the current colour.
  const DEEP_STEP = 650, DEEP_TURN = 1000;
  const thinkDeep = (() => {
    const FLASH = X1, AMBER = X2;
    const frames = [];
    for (const eye of [ECHO, PING, FLASH, AMBER]) for (let p = 0; p < 4; p++)
      frames.push(F(p === 0 ? DEEP_TURN : DEEP_STEP, face(echoBase, {visor: DARK, eye, eyes: orbitEyes(p), tip: eye})));
    return {
      name: 'ECHO · think deep', key: 'echo_think_deep', fwname: 'echo think deep', category: 'Active',
      intent: 'Proposal. Deep thinking: the visor band goes dark on purpose so the eyes can glow, and they roll slower (650 ms a step, 1 s at the start of each turn) in a new colour every turn, echo, ping, flash, amber, with the antenna tip matching; judge whether the dark visor still reads as the ECHO face.',
      palette: [...PAL, '#eafffb', '#e0b25a'],
      frames,
    };
  })();

  // 3. echo work. A two row desk in the site's own edge and line tokens (top 2c4045, front 1d2b2f)
  // across rows 12..13 in front of the lower body, short legs at its ends, the creature's legs under
  // it. A hand is down when its forearm cell at row 11 (cols 3 and 17) touches the desk top, up when
  // it hangs at row 10 as in echoBase. A keystroke is a lift (140 ms) then a press that flicks the
  // visor to ping (100 ms). Bursts of three and two keystrokes, one blink and one antenna ping per cycle.
  const work = (() => {
    const TOP = X1, FRONT = X2;
    const desk = clone(echoBase);
    for (let c = 1; c <= 18; c++) { set(desk, 12, c, TOP); set(desk, 13, c, FRONT); }
    for (let r = 14; r <= 16; r++) { set(desk, r, 1, FRONT); set(desk, r, 18, FRONT); }
    const pose = (left, right, o = {}) => {
      const b = face(desk, o);
      if (left) set(b, 11, 3, BODY);
      if (right) set(b, 11, 17, BODY);
      return b;
    };
    const rest = (o = {}) => pose(true, true, o);
    const key = hand => [F(140, pose(hand !== 'L', hand !== 'R')), F(100, rest({visor: PING}))];
    return {
      name: 'ECHO · work', key: 'echo_work', fwname: 'echo work', category: 'Active',
      intent: 'Proposal. Working: seated at a two row slate desk, the hands tap in bursts of three and two keystrokes and every press flicks the visor to ping for 100 ms, then both hands rest on the desk for most of the cycle; judge the rest between bursts, not the burst.',
      palette: [...PAL, '#2c4045', '#1d2b2f'],
      frames: [
        F(900, rest()), F(120, rest({eyes: halfEyes(0)})), F(600, rest()),
        ...key('L'), ...key('R'), ...key('L'), F(700, rest()),
        ...key('R'), ...key('L'), F(140, rest({tip: PING})), F(760, rest()),
      ],
    };
  })();

  // 4. echo write. The creature steps two cells left, which frees a 5 by 5 page to its lower right
  // (rows 12, 14, 16, cols 15..19, just under the right hand). The cursor (flash) sits at the
  // insertion point: it blinks on the empty page, advances one cell per 450 ms as 1 cell text (echo)
  // appears, spaces included, wraps or returns at each line end, blinks over the full page, then the
  // page clears as the antenna pings. The eyes look at the page while writing (one cell right).
  const write = (() => {
    const CURSOR = X1, TEXT = ECHO, DX = -2;
    const body = shiftX(echoBase, DX);
    const ROWS = [12, 14, 16], C0 = 15, CHAR = 450;
    const LINES = [[1, 1, 1, 0, 1], [1, 1, 0, 1], [1, 1, 1]];
    // n cells typed (spaces count), cursor [r, c] or null
    function page(n, cursor, {look = 1, half = false, tip = BODY} = {}) {
      const b = face(body, {dx: DX, eyes: half ? halfEyes(look) : sweepEyes(look), tip});
      let k = 0;
      LINES.forEach((line, li) => line.forEach((on, p) => { if (k++ < n && on) set(b, ROWS[li], C0 + p, TEXT); }));
      if (cursor) set(b, cursor[0], cursor[1], CURSOR);
      return b;
    }
    const START = [ROWS[0], C0], frames = [];
    frames.push(F(500, page(0, START, {look: 0})), F(450, page(0, null, {look: 0})),
                F(500, page(0, START, {look: 0})), F(450, page(0, null, {look: 0})));
    let n = 0;
    LINES.forEach((line, li) => {
      for (let p = 0; p < line.length; p++) {
        n++;
        let cur = [ROWS[li], C0 + p + 1];
        if (cur[1] >= G) cur = li + 1 < LINES.length ? [ROWS[li + 1], C0] : null;   // a full line wraps
        frames.push(F(CHAR, page(n, cur)));
      }
      if (li + 1 < LINES.length && C0 + line.length < G) frames.push(F(500, page(n, [ROWS[li + 1], C0])));   // return
    });
    const END = [ROWS[2], C0 + LINES[2].length];
    frames.push(F(500, page(n, null)), F(500, page(n, END)), F(500, page(n, null)),
                F(120, page(n, END, {half: true})), F(400, page(n, END)));
    frames.push(F(450, page(0, null, {look: 0, tip: PING})));   // clear
    return {
      name: 'ECHO · write', key: 'echo_write', fwname: 'echo write', category: 'Active',
      intent: 'Proposal. Writing: the creature steps two cells left and a one cell cursor types three lines of 1 cell text on a small page beside it, 450 ms a character, blinks over the full page, then the page clears as the antenna pings; judge whether the growing lines read as writing at a glance.',
      palette: [...PAL, '#eafffb'],
      frames,
    };
  })();

  // 5. echo read. The eyes fix three times per line, left, centre, right (700, 650, 850 ms), and
  // jump back for the next line; after the third line a blink with an antenna ping turns the page.
  const read = (() => {
    const line = () => [F(700, face(echoBase, {eyes: sweepEyes(-1)})), F(650, face(echoBase, {eyes: sweepEyes(0)})),
                        F(850, face(echoBase, {eyes: sweepEyes(1)}))];
    return {
      name: 'ECHO · read', key: 'echo_read', fwname: 'echo read', category: 'Active',
      intent: 'Proposal. Reading: both eyes step left to right across the visor one cell at a time (700, 650, 850 ms) and jump back at each line end, and after every third line a blink and an antenna ping turn the page; judge whether the sweep reads as reading rather than looking around.',
      palette: PAL.slice(),
      frames: [...line(), ...line(), ...line(), F(140, face(echoBase, {eyes: halfEyes(0), tip: PING}))],
    };
  })();

  L.register([thinkSpin, thinkDeep, work, write, read]);
})(typeof window !== 'undefined' ? window : globalThis);
