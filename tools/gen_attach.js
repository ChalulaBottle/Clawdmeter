// Builds docs/attach.html for the Clawdmeter ECHO edition site from the verified research
// (tools/attach_data.json, the verified output of the research workflow wf_c28c46b0-f49). Same tokens and classes as docs/index.html.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'attach_data.json');
const out = path.join(__dirname, '..', 'docs', 'attach.html');
const { page: P } = JSON.parse(fs.readFileSync(src, 'utf8'));

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cls = d => ({ 'plug in': 'live', 'driver': 'pending', 'satellite': 'sat', 'not on this board': 'no' })[d] || '';
const itemCount = P.groups.reduce((n, g) => n + g.items.length, 0);

const paths = P.paths.map(p => `
      <div class="panel">
        <h3>${esc(p.name)}</h3>
        <dl class="spec">
          <dt>Pins</dt><dd>${esc(p.pins)}</dd>
          <dt>Already on it</dt><dd>${esc(p.already_on_it)}</dd>
          <dt>Spare</dt><dd>${esc(p.spare)}</dd>
          <dt>Confidence</dt><dd>${esc(p.confidence)}</dd>
        </dl>
      </div>`).join('');

const groups = P.groups.map((g, gi) => `
<section class="band ${gi % 2 ? 'dark' : 'work'}" id="${esc(g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
  <main>
    <p class="kick">Catalog · ${gi + 1} of ${P.groups.length}</p>
    <h2>${esc(g.name)}</h2>
    <p class="muted" style="max-width:70ch">${esc(g.intro)}</p>
    <div class="grid3" style="margin-top:22px">${g.items.map(it => `
      <div class="panel item">
        <h3>${esc(it.name)}<span class="state ${cls(it.difficulty)}">${esc(it.difficulty)}</span></h3>
        <dl class="spec">
          <dt>Interface</dt><dd>${esc(it.interface)}</dd>
          <dt>Enables</dt><dd>${esc(it.enables)}</dd>${it.driver ? `
          <dt>Driver</dt><dd>${esc(it.driver)}</dd>` : ''}${it.price ? `
          <dt>Price</dt><dd>${esc(it.price)}</dd>` : ''}
        </dl>
        <p class="note">${esc(it.note)}</p>
      </div>`).join('')}
    </div>
  </main>
</section>`).join('');

const radio = P.radio;
const modules = P.modules;
const nav = P.groups.map(g => `<a href="#${esc(g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${esc(g.name)}</a>`).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>What can attach</title>
<meta name="description" content="Everything that can attach to the ECHO_LabDaemon hub (Waveshare ESP32-S3-Touch-LCD-4 V4): every physical path, ${itemCount} parts and satellites with difficulty and the real catch, passive scanning from the hub, and how other projects compile in as modules.">
<style>
:root{
  --echo:#35e0c0;--echo-deep:#17836f;--ping:#6fe9ff;--warn:#e0b25a;--alert:#e0665a;
  --on-echo:#03110e;--flash:#eafffb;
  --bg:#06090b;--bg2:#080d10;--surf:#0c1214;--surf2:#111a1d;--surf3:#162226;
  --line:#1d2b2f;--line-soft:#141e21;--edge:#2c4045;
  --text:#d8e6e6;--muted:#7d9698;--dim:#48605f;
  --head:Bahnschrift,"SF Compact Condensed","Segoe UI Semibold",system-ui,sans-serif;
  --mono:ui-monospace,"Cascadia Code","Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace;
  --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
  --cut:13px;
}
@media (prefers-color-scheme: light){
  :root:not([data-theme="dark"]){
    --bg:#f2f6f5;--bg2:#e9efee;--surf:#ffffff;--surf2:#f4f8f7;--surf3:#e6edec;
    --line:#cfdad8;--line-soft:#dde6e4;--edge:#a9bbb8;
    --text:#0f1a1a;--muted:#4a5f5e;--dim:#7d9291;--echo:#0e8a74;--echo-deep:#0a5f51;--warn:#8a6a1c;
  }
}
:root[data-theme="dark"]{
  --bg:#06090b;--bg2:#080d10;--surf:#0c1214;--surf2:#111a1d;--surf3:#162226;
  --line:#1d2b2f;--line-soft:#141e21;--edge:#2c4045;--text:#d8e6e6;--muted:#7d9698;--dim:#48605f;--echo:#35e0c0;--echo-deep:#17836f;--warn:#e0b25a;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--sans)}
main{max-width:1040px;margin:0 auto;padding:0 16px}
.kick{font:600 12px/1 var(--mono);letter-spacing:.28em;text-transform:uppercase;color:var(--echo);margin:0 0 14px}
h1,h2,h3{font-family:var(--head);text-transform:uppercase;letter-spacing:.02em;margin:0}
h1{font-size:clamp(34px,7vw,64px);line-height:.98;font-weight:800}
h2{font-size:clamp(22px,4vw,32px);font-weight:800;margin-bottom:14px}
h3{font-size:17px;font-weight:800;margin-bottom:6px}
p{margin:0 0 12px}
strong{color:var(--flash)}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]) strong{color:var(--text)} }
.muted{color:var(--muted)}
.band{padding:64px 0}
.band.dark{background:var(--bg2)}
.band.work{background:var(--bg)}
.hero{padding:88px 0 56px}
.hero .lede{font-size:18px;max-width:70ch;margin:18px 0 26px;color:var(--text)}
.erow{display:flex;flex-wrap:wrap;gap:10px;margin:0}
.btn{display:inline-block;font:700 13px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;
  padding:14px 18px;color:var(--text);background:var(--surf2);border:1px solid var(--edge);text-decoration:none;
  clip-path:polygon(0 8px,8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)}
.btn.primary{background:var(--echo);color:var(--on-echo);border-color:var(--echo)}
.btn:hover{filter:brightness(1.08)}
.btn:focus-visible{outline:2px solid var(--ping);outline-offset:2px}
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:38px}
.count{padding:16px 18px;background:var(--surf);border:1px solid var(--line);position:relative;
  clip-path:polygon(0 var(--cut),var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%)}
.count .fig{font:800 34px/1 var(--head);color:var(--flash)}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]) .count .fig{color:var(--text)} }
.count .cap{font:600 11px/1.4 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-top:8px}
.panel{padding:22px 24px;background:linear-gradient(155deg,var(--surf2),var(--surf));border:1px solid var(--line);position:relative;
  clip-path:polygon(0 var(--cut),var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%)}
.panel::before,.panel::after,.count::before,.count::after{content:"";position:absolute;width:10px;height:10px;border-color:var(--edge);border-style:solid}
.panel::before,.count::before{top:6px;left:6px;border-width:1px 0 0 1px}
.panel::after,.count::after{bottom:6px;right:6px;border-width:0 1px 1px 0}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.grid3>*,.grid2>*,.strip>*{min-width:0}
.state{font:700 11px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;padding:5px 8px;background:var(--surf3);color:var(--muted);display:inline-block;margin-left:8px;vertical-align:middle}
.state.live{color:var(--echo)}
.state.pending{color:var(--warn)}
.state.sat{color:var(--ping)}
.state.no{color:var(--alert)}
.item h3{font-size:15px;line-height:1.3}
.item .note{font:500 13px/1.55 var(--mono);color:var(--warn);margin:12px 0 0}
.help{font:500 13px/1.6 var(--mono);color:var(--warn)}
.help ul,.plain ul{list-style:none;padding:0;margin:8px 0 0}
.help li::before{content:"⠿  ";color:var(--warn)}
.plain{font-size:15px}
.plain li{padding:10px 0;border-top:1px solid var(--line-soft)}
.plain li:first-child{border-top:0}
.plain li b{display:block;font:600 12px/1.6 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--echo)}
dl.spec{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 18px;margin:0;font-size:14px}
dl.spec dt{font:600 11px/1.6 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
dl.spec dd{margin:0;min-width:0;overflow-wrap:anywhere}
pre{margin:0;padding:18px;background:var(--surf);border:1px solid var(--line);font:13px/1.5 var(--mono);overflow:auto;color:var(--text)}
code{font-family:var(--mono);font-size:.92em;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font:600 11px/1.6 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px 8px 0;border-bottom:1px solid var(--line)}
td{padding:10px 10px 10px 0;border-bottom:1px solid var(--line-soft);vertical-align:top}
.nav{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:18px;font:600 12px/1.6 var(--mono);letter-spacing:.14em;text-transform:uppercase}
.nav a{color:var(--muted);text-decoration:none}
.nav a:hover{color:var(--echo)}
.sources{columns:2;column-gap:28px;font-size:13px}
.sources li{break-inside:avoid;padding:4px 0}
.sources a{color:var(--muted);text-decoration:none;overflow-wrap:anywhere}
.sources a:hover{color:var(--echo)}
footer{padding:56px 0 72px;background:var(--bg2);border-top:1px solid var(--line-soft)}
footer p{font-size:14px;color:var(--muted);max-width:76ch}
@media (max-width:820px){ .strip,.grid3{grid-template-columns:1fr 1fr} .grid2{grid-template-columns:1fr} .sources{columns:1} }
@media (max-width:520px){ .strip,.grid3{grid-template-columns:1fr} .band{padding:48px 0} dl.spec{grid-template-columns:1fr;gap:2px 0} dl.spec dd{margin-bottom:10px} }
</style>
</head>
<body>

<section class="band dark hero">
  <main>
    <p class="kick">ECHO · ECHO_LabDaemon · The hub</p>
    <h1>${esc(P.headline)}</h1>
    <p class="lede">${esc(P.lede)}</p>
    <div class="erow">
      <a class="btn primary cdk cdk-flash" href="index.html">Back to the project</a>
      <a class="btn cdk cdk-flash" href="https://github.com/ChalulaBottle/ECHO_LabDaemon" target="_blank" rel="noopener noreferrer">On GitHub</a>
    </div>
    <div class="strip">
      <div class="count"><div class="fig">${P.paths.length}</div><div class="cap">ways in: headers, slots, radio</div></div>
      <div class="count"><div class="fig">${itemCount}</div><div class="cap">parts, modules and satellites</div></div>
      <div class="count"><div class="fig">${P.caveats.length}</div><div class="cap">things to check before wiring</div></div>
      <div class="count"><div class="fig">${P.sources.length}</div><div class="cap">sources, all linked below</div></div>
    </div>
    <nav class="nav">${nav}<a href="#scan">Scanning</a><a href="#modules">Compiling in</a><a href="#caveats">Read first</a><a href="#sources">Sources</a></nav>
  </main>
</section>

<section class="band work" id="paths">
  <main>
    <p class="kick">Where things plug in</p>
    <h2>Every way into the board</h2>
    <p class="muted" style="max-width:70ch">Checked against the V4.0 schematic and Waveshare's V4 code. Where the wiki disagreed, the schematic won, and the confidence line says what was measured and what was derived.</p>
    <div class="grid2" style="margin-top:22px">${paths}
    </div>
  </main>
</section>
${groups}
<section class="band ${P.groups.length % 2 ? 'dark' : 'work'}" id="scan">
  <main>
    <p class="kick">Scanning from the hub</p>
    <h2>Bluetooth and Wi-Fi scanning, on this chip</h2>
    <div class="grid2" style="margin-top:22px">
      <div class="panel"><h3>BLE scanning</h3><p class="muted">${esc(radio.ble_scan)}</p></div>
      <div class="panel"><h3>Wi-Fi access point scanning</h3><p class="muted">${esc(radio.wifi_scan)}</p></div>
      <div class="panel"><h3>Passive sniffing and Kismet</h3><p class="muted">${esc(radio.sniffer_kismet)}</p></div>
      <div class="panel"><h3>ESP-NOW for satellites</h3><p class="muted">${esc(radio.espnow)}</p></div>
    </div>
    <div class="panel" style="margin-top:14px"><h3>The picture tears if the radio stalls PSRAM</h3><p class="muted">${esc(radio.tearing)}</p></div>
    <div class="help" style="margin-top:22px">
      <p>Left out on purpose, and it stays out:</p>
      <ul>${radio.excluded.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
  </main>
</section>

<section class="band ${P.groups.length % 2 ? 'work' : 'dark'}" id="modules">
  <main>
    <p class="kick">Compiling other projects in</p>
    <h2>One device, many tools: how that actually works</h2>
    <div class="grid2" style="margin-top:22px">
      <div class="panel"><h3>Why whole projects do not merge</h3><p class="muted">${esc(modules.why_merging_is_hard)}</p></div>
      <div class="panel"><h3>What works: modules</h3><p class="muted">${esc(modules.what_works)}</p></div>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div><h3 style="margin:14px 0 10px">The whole API</h3><pre><code>${esc(modules.api_sketch)}</code></pre></div>
      <div class="panel"><h3>How a build picks its modules</h3><p class="muted">${esc(modules.build_selection)}</p></div>
    </div>
    <h3 style="margin:28px 0 10px">Order of work and honest hours</h3>
    <table>
      <thead><tr><th>Module</th><th>Hours</th><th>Note</th></tr></thead>
      <tbody>${modules.first_modules.map(m => `
        <tr><td><strong>${esc(m.name)}</strong></td><td><code>${esc(m.hours)}</code></td><td class="muted">${esc(m.note)}</td></tr>`).join('')}
      </tbody>
    </table>
  </main>
</section>

<section class="band ${P.groups.length % 2 ? 'dark' : 'work'}" id="caveats">
  <main>
    <p class="kick">Read before wiring</p>
    <h2>The catches, in order of how much they can cost you</h2>
    <div class="plain"><ul>${P.caveats.map((c, i) => `<li><b>${String(i + 1).padStart(2, '0')}</b>${esc(c)}</li>`).join('')}</ul></div>
  </main>
</section>

<section class="band ${P.groups.length % 2 ? 'work' : 'dark'}" id="sources">
  <main>
    <p class="kick">Sources</p>
    <h2>Where every claim above comes from</h2>
    <ul class="sources">${P.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul>
  </main>
</section>

<footer>
  <main>
    <p class="kick">Credit</p>
    <p>ECHO_LabDaemon is created and designed by Digital Orukami, inspired by Clawdmeter by Hermann Björgvin. Board documentation, schematic and reference code from Waveshare; no licence is granted beyond what upstream grants. Research compiled ${new Date().toISOString().slice(0, 10)} by Digital Orukami with Claude; derived figures are marked as such in the text and are not bench measurements.</p>
  </main>
</footer>
</body>
</html>
`;
fs.writeFileSync(out, html);
console.log('wrote', out, html.length, 'bytes;', itemCount, 'items');
