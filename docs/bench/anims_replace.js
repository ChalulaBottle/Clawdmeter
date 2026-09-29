// ECHO replacements for the stock Clawd set (operator, 2026-09-28: "replace all of those with
// variations of the ECHO creature, one by one, the code has to be different from the original").
// Each animation here is drawn from scratch on the ECHO creature, not skinned or traced from the
// claudepix frames, and carries `replaces`: the stock name it takes the place of. The exporter ships
// it under its own fwname; the stock entry leaves the firmware table and the rotation lists when the
// replacement lands (tools/add_echo_anims.py reads `replaces`).
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {G, clone, set, ECHO_PALETTE, echoBase} = L;
  const ECHO7 = ECHO_PALETTE.slice(0, 7);
  const empty = () => Array.from({length: G}, () => new Array(G).fill(0));

  // ---------- 1. echo dj (replaces "dance bounce dj") ----------
  // The creature behind a deck: two platters with a marker spinning round each, the right hand drops
  // to scratch on every fourth beat, an equaliser pumps under the deck, the body bobs on the beat and
  // the eyes go > < on the drop. Everything here is geometry on the ECHO base, nothing from claudepix.
  const DJ_PALETTE = [...ECHO7, '#1a2124', '#ff5fd2', '#eafffb'];   // 7 deck, 8 magenta light, 9 flash
  const DECK = 7, LIGHT = 8, FLASH = 9, BODY = 1, EYE = 2, VISOR = 3, PING = 4;
  const RING = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]];   // 3x3 platter rim, clockwise
  function dj(beat, {drop = false, scratch = false} = {}) {
    const up = beat % 2 === 1;
    const b = empty();
    // the creature, one row higher on the off beat; the deck in front hides its legs either way
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const v = echoBase[r][c]; if (!v) continue;
      set(b, r - (up ? 1 : 0), c, v);
    }
    set(b, 1 - (up ? 1 : 0), 15, beat % 4 === 0 ? PING : BODY);             // antenna ping on the one
    if (drop) {                                                             // > < eyes on the drop
      const top = 6 - (up ? 1 : 0);
      for (const c of [7, 13]) { set(b, top, c, VISOR); set(b, top + 1, c, VISOR); }
      set(b, top, 6, EYE); set(b, top + 1, 7, EYE); set(b, top, 8, EYE);
      set(b, top, 12, EYE); set(b, top + 1, 13, EYE); set(b, top, 14, EYE);
    }
    // the deck: rows 12..16, cols 1..18, with two platters and a light strip
    for (let r = 12; r <= 16; r++) for (let c = 1; c <= 18; c++) set(b, r, c, DECK);
    for (const c0 of [3, 14]) {
      for (const [dr, dc] of RING) set(b, 12 + dr, c0 + dc, BODY);
      set(b, 13, c0 + 1, VISOR);                                            // the label
      const [mr, mc] = RING[(beat * (c0 === 3 ? 1 : 3)) % RING.length];     // left spins slow, right fast
      set(b, 12 + mr, c0 + mc, FLASH);
    }
    for (let c = 7; c <= 12; c++) set(b, 15, c, (c + beat) % 3 === 0 ? LIGHT : DECK);   // chasing light
    if (scratch) { set(b, 10, 17, BODY); set(b, 11, 17, BODY); set(b, 12, 16, BODY); }   // hand down on the right platter
    // the equaliser under the deck: six bars, heights from the beat
    for (let i = 0; i < 6; i++) {
      const h = 1 + ((beat * 7 + i * 5) % 3);
      for (let k = 0; k < h; k++) set(b, 19 - k, 7 + i, k === h - 1 ? LIGHT : VISOR);
    }
    return b;
  }
  const echoDj = {
    name: 'ECHO · dj', key: 'echo_dj', fwname: 'echo dj', category: 'Active', replaces: 'dance bounce dj',
    intent: 'Replaces the stock bounce DJ with our own: the creature behind a deck, two platters spinning at different speeds, a scratch every fourth beat, an equaliser under the deck, a bob on every beat and > < eyes on the drop; judge the tempo and whether the deck reads at 20 cells.',
    palette: DJ_PALETTE,
    frames: [],
  };
  for (let beat = 0; beat < 32; beat++) {
    const drop = beat >= 16 && beat < 24;
    echoDj.frames.push({hold: 130, grid: dj(beat, {drop, scratch: beat % 4 === 3})});
  }

  L.register([echoDj]);
})(typeof window !== 'undefined' ? window : globalThis);
