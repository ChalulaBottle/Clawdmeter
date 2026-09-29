// Opus ultra (operator, 2026-09-28, on ultra braille: "I want a ultramode like this", for the ultracode
// tiers fable, opus and sonnet). The ultra braille sphere (anims.js, 3x Ultra braille) redrawn as Opus:
// bright and powerful.
// 60 cell lattice, 8 px cells on the 480 px panel.
//
// The Opus tier creature (anims_models.js: body one step brighter, flash white visor, antenna tip beating)
// blinks its tip, glitches, and burns down into light: the dissolve's last survivors glow mint, then white.
// The light gathers into a core that swells into a globe of braille dots (2 x 2 cells each, 27 cells in
// radius, one past ultra braille's 26) lit from the front: white where a dot faces the viewer, then mint,
// teal and the Opus body teal toward the limb; the back side neon purple, the far back dimmed to a dusk
// purple and thinned. The colours stay put in view while the dots stream through them, as in ultra
// braille, so it reads as one glowing orb.
// A thin halo ring of single cell dots rides the equator and turns the other way (a gyroscope): a dim teal
// track carrying six comets, white heads and ping tails. Where the ring crosses in front of the globe it
// cuts a dark channel through the dots, so it reads as in front; behind the globe it is hidden. The axis
// nods once a turn, and at the top of every nod, once per full turn, the globe beats white for one frame,
// with an afterglow frame after it. Then the ring folds back into the equator, the globe shrinks to its
// core, and the creature comes back out of the light.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  if (typeof require !== 'undefined' && !root.BENCH_LIB) require('./anims.js');
  const L = root.BENCH_LIB;
  const {G, echoPing, echoGlitch} = L;

  // 1 to 5 are the Opus tier creature exactly (anims_models.js: body #1fa88c, eyes, flash visor #eafffb,
  // ping tip #6fe9ff, feet #17836f), so echoBase drawn under this palette is the Opus creature as it is.
  // 6 mint #90f0dd (the Opus visor mid), 7 ECHO teal, 8 neon purple (the back side), 9 dusk (far back).
  const PALETTE = ['transparent', '#1fa88c', '#06090b', '#eafffb', '#6fe9ff', '#17836f',
                   '#90f0dd', '#35e0c0', '#b44dff', '#5a2680'];
  const BODY = 1, WHITE = 3, PING = 4, MINT = 6, TEAL = 7, NEON = 8, DUSK = 9;

  const N = 60, CX = 30, CY = 30;                       // lattice, and its centre in cell units
  const blank = () => Array.from({length: N}, () => new Array(N).fill(0));
  const put = (g, r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v; };
  function up3(g20) {                                   // exact 3x of a 20 cell frame
    const b = blank();
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (g20[r][c]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b[r * 3 + i][c * 3 + j] = g20[r][c];
    return b;
  }

  // The creature.
  // echoGlitch paints its split visor in index 6, the family's ping in ECHO_PALETTE; here 6 is mint, so the
  // split is moved to 4 to keep the ping accent.
  const tipOn = up3(echoPing(true)), tipOff = up3(echoPing(false));
  const glitch = up3(echoGlitch().map(r => r.map(v => (v === 6 ? PING : v))));
  // Burn: the cells a fixed diagonal lattice spares at level k (ultra braille's dissolve); from level 3 the
  // survivors glow, mint at 3 and white at 4, so the creature goes out as light and comes back from it.
  function burn(g60, k) {
    const b = blank();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = g60[r][c];
      if (v && ((r * 7 + c * 3) % 5) >= k) b[r][c] = k >= 4 ? WHITE : k === 3 ? MINT : v;
    }
    return b;
  }

  // The globe.
  const PTS = (() => {                                  // Fibonacci sphere, unit radius, as ultra braille
    const n = 240, pts = [], phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), t = phi * i; pts.push([Math.cos(t) * rad, y, Math.sin(t) * rad]); }
    return pts;
  })();
  // A dot's colour from how squarely it faces the viewer (z after the turn and tilt, 1 = dead centre).
  // flash 2 is the white beat, flash 1 its afterglow (the lit side all white and mint).
  function shade(z, flash) {
    if (flash === 2) return WHITE;
    if (z < 0) return z < -0.35 ? DUSK : NEON;
    if (flash === 1) return z > 0.45 ? WHITE : MINT;
    return z > 0.86 ? WHITE : z > 0.62 ? MINT : z > 0.3 ? TEAL : BODY;
  }
  // The globe turned to angle (radians) about its axis, radius R in cells, the top of the axis tipped
  // toward the viewer by tilt; ring is {r, phase} (radius in cells, turn in radians) or null.
  function globe(angle, R, tilt, ring, flash = 0) {
    const b = blank();
    const ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(tilt), st = Math.sin(tilt);
    const dots = PTS.map(([x, y, z]) => {
      const x1 = x * ca - z * sa, z1 = x * sa + z * ca;         // turn about the vertical axis
      return {x: x1, y: y * ct - z1 * st, z: y * st + z1 * ct}; // tip the top toward the viewer
    }).sort((p, q) => p.z - q.z);                               // back first, so the front paints last
    for (const p of dots) {
      const r = Math.round(CY - p.y * R), c = Math.round(CX + p.x * R);
      if (p.z < -0.35 && ((r + c) & 1)) continue;                // the far back thins out, as in ultra braille
      const v = shade(p.z, flash);
      for (let i = -1; i <= 0; i++) for (let j = -1; j <= 0; j++) put(b, r + i, c + j, v);   // 2 x 2, centred
    }
    if (ring) halo(b, R, ct, st, ring, flash);
    return b;
  }
  // The halo: RING_N single cell dots on the equator circle. Per COMET dots (60 degrees, six round the
  // ring): two white heads, four ping tail dots, nine dim track dots. The phase runs against the globe's
  // turn and the heads lead, so on the front arc the comets travel right while the globe's face travels left.
  const RING_N = 90, COMET = 15;
  function halo(b, R, ct, st, {r: rr, phase}, flash) {
    const back = [], front = [];
    for (let i = 0; i < RING_N; i++) {
      const psi = phase + i * 2 * Math.PI / RING_N;
      const x1 = Math.cos(psi), z1 = Math.sin(psi);
      const col = CX + x1 * rr, row = CY + z1 * st * rr, z = z1 * ct;
      const k = i % COMET, lit = k < 6;
      const cell = {r: Math.floor(row), c: Math.floor(col)};
      if (z < 0) {                                               // behind: hidden by the globe, neon outside it
        if (Math.hypot(col - CX, row - CY) < R + 1) continue;
        back.push(Object.assign(cell, {v: flash === 2 ? WHITE : lit ? NEON : DUSK}));
      } else {
        front.push(Object.assign(cell, {v: flash === 2 ? WHITE : k < 2 ? WHITE : lit ? PING : BODY, cut: Math.hypot(col - CX, row - CY) < R + 1}));
      }
    }
    for (const q of back) put(b, q.r, q.c, q.v);
    for (const q of front) if (q.cut) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) put(b, q.r + i, q.c + j, 0);   // the dark channel
    for (const q of front) put(b, q.r, q.c, q.v);
  }

  // The cycle.
  const STEP = Math.PI / 12;                            // 15 degrees a frame: 24 frames a turn
  // The globe turns at 27, one cell past ultra braille's 26, and the grow and shrink ramps step 4 cells a
  // frame to it. The ring rides at 29.9, as far out as the lattice allows (cols 0 and 59 at the sides), to
  // keep the clearance from the limb it had beside a globe of 26.
  const GROW = [11, 15, 19, 23], R_SPIN = 27, R_RING = 29.9;
  const SPIN = 32, FLASH_AT = [3, 27];                  // spin frames of the two beats, one full turn apart
  const RING_IN = [27.4, 28.6];                         // the ring lifts off the equator over two frames
  const ultraOpus = {
    name: 'Opus · ultra', key: 'ultra_opus', fwname: 'opus ultra', category: 'Mode', size: N,
    intent: 'Proposal, 60 cells. Ultra braille as Opus: the Opus creature (brighter body, white visor) beats its antenna, glitches and burns down into light, which swells into a large globe of braille dots (radius 27, one cell past ultra braille) lit from the front, white at the centre through mint and teal to the limb, the back side neon purple; a thin halo ring of dots on the equator turns the other way like a gyroscope, six white headed comets on a dim track, and once every full turn the globe beats white; then the ring folds in, the globe shrinks and the creature steps back out of the light; judge whether the ring reads as turning against the globe, and whether it says Opus next to the rainbow original.',
    palette: PALETTE,
    frames: [],
  };
  {
    const f = ultraOpus.frames;
    f.push({hold: 800, grid: tipOn});                   // frames[0]: the bench shows it for a glitch frame when glitch is off
    f.push({hold: 200, grid: tipOff});
    f.push({hold: 200, grid: tipOn});
    f.push({hold: 160, grid: tipOff});
    f.push({hold: 60, grid: glitch, glitch: true});
    for (let k = 1; k <= 4; k++) f.push({hold: 70, grid: burn(tipOn, k)});
    // One rotation index t across grow, spin and shrink, so the turn never stutters. The axis nods once a
    // turn and peaks on the beats (t = 4 + FLASH_AT), the ring most open when the globe flashes.
    const tiltAt = t => 0.45 + 0.12 * Math.cos((t - GROW.length - FLASH_AT[0]) * 2 * Math.PI / 24);
    const angleAt = t => t * STEP;
    const ringAt = s => ({r: s < RING_IN.length ? RING_IN[s] : s >= SPIN - RING_IN.length ? RING_IN[SPIN - 1 - s] : R_RING, phase: 0.4 - s * STEP});
    let t = 0;
    for (const R of GROW) { f.push({hold: 70, grid: globe(angleAt(t), R, tiltAt(t), null)}); t++; }
    for (let s = 0; s < SPIN; s++, t++) {
      const beat = FLASH_AT.includes(s) ? 2 : FLASH_AT.includes(s - 1) ? 1 : 0;
      f.push({hold: beat === 2 ? 70 : beat === 1 ? 80 : 90, grid: globe(angleAt(t), R_SPIN, tiltAt(t), ringAt(s), beat)});
    }
    for (const R of GROW.slice().reverse()) { f.push({hold: 70, grid: globe(angleAt(t), R, tiltAt(t), null)}); t++; }
    for (let k = 4; k >= 1; k--) f.push({hold: 70, grid: burn(tipOn, k)});
    f.push({hold: 700, grid: tipOn});
    f.push({hold: 200, grid: tipOff});
    f.push({hold: 700, grid: tipOn});
    f.push({hold: 60, grid: glitch, glitch: true});
    f.push({hold: 300, grid: tipOff});
  }

  L.register([ultraOpus]);
})(typeof window !== 'undefined' ? window : globalThis);
