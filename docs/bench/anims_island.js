// Island crossplay creatures (operator, 2026-09-28: "the creature will also be travelling through doors
// with the purple aura, for The Island concept as well"). The Island's scenes each carry a purple
// portal door (#ff5fd2, see the_island dev/bg-scenes and dev/clawd-crossing); these are the ECHO
// creature's side of the same world. Drawn from scratch on the ECHO base.
//
// Loaded after anims.js (bench: script tag; export: tools/bench_to_json.js globs anims_*.js).
(function (root) {
  const L = root.BENCH_LIB;
  const {G, set, ECHO_PALETTE, echoBase} = L;
  const ECHO7 = ECHO_PALETTE.slice(0, 7);
  const empty = () => Array.from({length: G}, () => new Array(G).fill(0));

  // The 10 x 10 mini: 2x2 majority of the ECHO base, eyes win a tie so the mini keeps them.
  const MINI = (() => {
    const m = [];
    for (let r = 0; r < G; r += 2) {
      const row = [];
      for (let c = 0; c < G; c += 2) {
        const v = [echoBase[r][c], echoBase[r][c + 1], echoBase[r + 1][c], echoBase[r + 1][c + 1]].filter(Boolean);
        if (!v.length) { row.push(0); continue; }
        const n = {}; let best = v[0];
        for (const x of v) { n[x] = (n[x] || 0) + 1; if (n[x] > n[best]) best = x; }
        if ((n[2] || 0) >= 1) best = 2;
        row.push(best);
      }
      m.push(row);
    }
    return m;
  })();
  const MINI_COLS = (() => { let lo = G, hi = 0; for (const row of MINI) row.forEach((v, c) => { if (v) { lo = Math.min(lo, c); hi = Math.max(hi, c); } }); return [lo, hi]; })();

  // ---------- echo door ----------
  // A purple door stands on the floor at the right. The creature walks in from the middle, the door
  // swings open to a magenta glow inside a breathing neon purple aura, the creature steps through
  // (every cell that reaches the doorway is gone, so it vanishes into the light), the door shuts and
  // pulses, opens again, and the creature walks back out to the middle. The Island's purple door entry.
  const DOOR_PALETTE = [...ECHO7, '#ff5fd2', '#b44dff', '#3a1060'];   // 7 portal magenta, 8 neon purple aura, 9 shut door
  const PORTAL = 7, AURA = 8, SHUT = 9, PING = 4, BODY = 1;
  const DOOR = {c0: 15, c1: 18, r0: 6, r1: 16};                         // frame cols 15 and 18, opening 16..17
  function door(g, open, auraPhase) {
    for (let r = DOOR.r0; r <= DOOR.r1; r++) for (let c = DOOR.c0; c <= DOOR.c1; c++) {
      const edge = r === DOOR.r0 || c === DOOR.c0 || c === DOOR.c1;
      set(g, r, c, edge ? PORTAL : (open ? PORTAL : SHUT));
    }
    if (open) for (let r = DOOR.r0 + 1; r <= DOOR.r1; r += 2) set(g, r, 16 + (r % 4 === 1 ? 1 : 0), AURA);   // shimmer in the light
    const halo = [[DOOR.r0 - 1, 15], [DOOR.r0 - 1, 16], [DOOR.r0 - 1, 17], [DOOR.r0 - 1, 18]];
    for (let r = DOOR.r0; r <= DOOR.r1; r++) halo.push([r, 14], [r, 19]);
    halo.forEach(([r, c], i) => { if ((i + auraPhase) % 2 === 0 || open) set(g, r, c, AURA); });
    for (let c = 0; c < G; c++) if (!g[17][c]) set(g, 17, c, 5);                                    // the floor
  }
  function scene(x, {open = false, phase = 0, bob = 0, ping = false, show = true} = {}) {
    const g = empty();
    if (show) MINI.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const cc = x + c - MINI_COLS[0], rr = 7 + r + bob;
      if (cc >= DOOR.c0) return;                                                                      // through the doorway: gone
      set(g, rr, cc, v === BODY && r === 0 && ping ? PING : v);
    }));
    door(g, open, phase);
    return g;
  }
  const echoDoor = {
    name: 'ECHO · door', key: 'echo_door', fwname: 'echo door', category: 'Mode',
    intent: 'Proposal, Island crossplay. The creature walks to a purple door on the floor, it opens to magenta light inside a breathing neon purple aura, the creature steps through and is gone (eyes go with it, by design), the door shuts and pulses, then opens and the creature walks back out; judge whether stepping through reads as going somewhere else.',
    palette: DOOR_PALETTE,
    frames: [],
  };
  {
    const f = echoDoor.frames;
    let ph = 0;
    const push = (hold, x, o = {}) => f.push({hold, grid: scene(x, Object.assign({phase: ph++}, o))});
    push(900, 3, {ping: false}); push(140, 3, {ping: true}); push(500, 3);
    for (let x = 4; x <= 8; x++) push(150, x, {bob: x % 2 ? -1 : 0});                // walks to the door
    push(260, 8, {open: true}); push(200, 8, {open: true});                          // it opens
    for (let x = 9; x <= 15; x++) push(130, x, {open: true, bob: x % 2 ? -1 : 0});   // steps through
    push(260, 15, {open: true, show: false});
    push(300, 0, {show: false}); push(300, 0, {show: false}); push(300, 0, {show: false});   // shut, pulsing
    push(240, 15, {open: true, show: false});
    for (let x = 14; x >= 3; x--) push(120, x, {open: x >= 8, bob: x % 2 ? -1 : 0}); // walks back out
    push(700, 3, {ping: true});
  }

  L.register([echoDoor]);
})(typeof window !== 'undefined' ? window : globalThis);
