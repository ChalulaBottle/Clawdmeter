#!/usr/bin/env node
/**
 * Writes the bench animations (docs/bench/anims.js) as claudepix-format JSON
 * into tools/echo_anims/, one file per animation plus _index.json, so
 * tools/convert_to_c.js --in tools/echo_anims can emit a header block and
 * tools/anim_gif.py can render GIFs for docs/media.
 *
 * Usage: node tools/bench_to_json.js [--out DIR]
 */
const fs = require('fs');
const path = require('path');
const BENCH_DIR = path.join(__dirname, '..', 'docs', 'bench');
const BENCH = require(path.join(BENCH_DIR, 'anims.js'));
// Extra creature files register themselves into BENCH.anims (see anims.js, BENCH_LIB.register).
for (const f of fs.readdirSync(BENCH_DIR).filter(n => /^anims_.*\.js$/.test(n)).sort()) require(path.join(BENCH_DIR, f));

const args = process.argv.slice(2);
const i = args.indexOf('--out');
const OUT = path.resolve(i >= 0 ? args[i + 1] : path.join(__dirname, 'echo_anims'));
fs.mkdirSync(OUT, { recursive: true });

const index = [];
for (const a of BENCH.anims) {
  if (a.reference) continue;   // stock animations already live in the firmware under their own names
  const json = {
    filename: a.key + '.html',
    // firmware name: short, space separated, what the host's "a" field sends (splash_set_anim)
    name: a.fwname || a.name.replace(/\s*·\s*/g, ' ').toLowerCase(),
    category: a.category,
    description: a.intent,
    palette: a.palette,
    frame_count: a.frames.length,
    // spinner cells bake in at export, phase = frame index (bench draws it from its own clock)
    frames: a.frames.map((f, i) => ({ hold: f.hold, grid: a.spinner ? BENCH.spinnerAt(f.grid, i) : f.grid })),
  };
  fs.writeFileSync(path.join(OUT, a.key + '.json'), JSON.stringify(json, null, 1));
  index.push({ filename: json.filename, name: json.name, category: json.category, frame_count: json.frame_count, palette_size: a.palette.length });
  console.log(`${a.key}: ${a.frames.length} frames, palette ${a.palette.length}`);
}
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 2));
console.log(`wrote ${index.length} animations to ${OUT}`);
