/**
 * Review page. One static HTML file per project: video, stills, QA gates, critique, publish pack.
 * No server, no build step — open the file, approve or reject in about 60 seconds.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Director } from '../schema/director.js';
import type { QaReport } from './qa.js';
import type { Critique } from './critic.js';
import type { TimingReport } from '../engine/types.js';
import type { PublishPack } from './publish.js';
import type { DistinctnessReport } from './distinct.js';

export type ReviewInput = {
  spec: Director;
  timing: TimingReport;
  qa: QaReport;
  critique?: Critique;
  publish: PublishPack;
  videoRelPath: string;
  stillsRel: string[];
  contactSheetRel?: string;
  thumbRel?: string;
  distinctness?: DistinctnessReport;
  outFile: string;
};

export function writeReviewPage(input: ReviewInput): string {
  const { spec, timing, qa, critique, publish } = input;
  const failed = qa.gates.filter((g) => !g.pass);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.id)} — review</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b0f; --panel:#14141b; --fg:#f5f5f7; --muted:#8e8e93; --ok:#3ddc97; --bad:#ff3b30; --accent:#ffb020; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding:24px 28px; border-bottom:1px solid #23232c; display:flex; gap:16px; align-items:baseline; flex-wrap:wrap; }
  h1 { font-size:20px; margin:0; letter-spacing:-0.02em; }
  .pill { font-size:12px; padding:4px 10px; border-radius:999px; background:#23232c; color:var(--muted); }
  .pill.ok { background:rgba(61,220,151,.15); color:var(--ok); }
  .pill.bad { background:rgba(255,59,48,.15); color:var(--bad); }
  main { display:grid; grid-template-columns: 420px 1fr; gap:28px; padding:28px; align-items:start; }
  @media (max-width: 980px) { main { grid-template-columns:1fr; } }
  video { width:100%; border-radius:14px; background:#000; }
  .card { background:var(--panel); border:1px solid #23232c; border-radius:14px; padding:18px; margin-bottom:18px; }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 12px; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  td, th { text-align:left; padding:6px 0; border-bottom:1px solid #20202a; vertical-align:top; }
  th { color:var(--muted); font-weight:500; }
  code { font-family: ui-monospace, "JetBrains Mono", monospace; font-size:12.5px; color:var(--accent); }
  .stills { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; }
  .stills img { width:100%; border-radius:8px; border:1px solid #23232c; display:block; }
  .gates { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:8px; }
  .gate { display:flex; gap:8px; font-size:13px; padding:6px 0; }
  .gate .mark { font-weight:700; }
  .ok-text { color:var(--ok); } .bad-text { color:var(--bad); }
  .muted { color:var(--muted); }
  .kit { display:flex; gap:10px; flex-wrap:wrap; }
  .kit a { color:var(--fg); text-decoration:none; border:1px solid #2b2b36; padding:8px 12px; border-radius:10px; font-size:13px; }
  .kit a:hover { border-color:var(--accent); }
  .row { display:flex; justify-content:space-between; gap:12px; }
  .title-variant { padding:8px 10px; background:#0f0f16; border-radius:8px; margin-bottom:6px; font-size:13.5px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(spec.publish.title || spec.id)}</h1>
  <span class="pill">${spec.format} · ${spec.aspect} · ${timing.actualSec}s · ${spec.style.templateFamily ?? 'auto'}</span>
  <span class="pill ${qa.pass ? 'ok' : 'bad'}">qa ${qa.pass ? 'pass' : `fail (${failed.length})`}</span>
  ${critique ? `<span class="pill ${critique.verdict === 'ship' ? 'ok' : 'bad'}">critic: ${critique.verdict}</span>` : ''}
  ${input.distinctness ? `<span class="pill ${input.distinctness.pass ? 'ok' : 'bad'}">distinct: ${input.distinctness.pass ? 'yes' : 'no'}</span>` : ''}
</header>
<main>
  <div>
    <video src="${escapeHtml(input.videoRelPath)}" controls playsinline preload="metadata"></video>
    <div class="card" style="margin-top:18px">
      <h2>Approve</h2>
      <div class="kit">
        <a href="${escapeHtml(input.videoRelPath)}" download>download mp4</a>
        <a href="#" onclick="navigator.clipboard.writeText(document.getElementById('approve-line').textContent);return false;">copy approve/reject</a>
      </div>
      <p id="approve-line" class="muted" style="font-size:13px;margin-bottom:0">APPROVE ${escapeHtml(spec.id)} / REJECT ${escapeHtml(spec.id)}: &lt;one line reason&gt;</p>
    </div>
    ${input.thumbRel ? `<div class="card"><h2>Thumbnail</h2><img src="${escapeHtml(input.thumbRel)}" style="width:100%;border-radius:10px"></div>` : ''}
    <div class="card">
      <h2>Titles</h2>
      ${publish.titleVariants.map((t) => `<div class="title-variant">${escapeHtml(t)}</div>`).join('')}
      <h2 style="margin-top:16px">Tags</h2>
      <p class="muted" style="font-size:13px;margin:0">${publish.tags.map((t) => escapeHtml(t)).join(' · ')}</p>
      <h2 style="margin-top:16px">Disclosure</h2>
      <p class="muted" style="font-size:13px;margin:0">synthetic voice: ${publish.disclosure.syntheticVoice} · AI visuals: ${publish.disclosure.aiGeneratedVisuals}</p>
    </div>
  </div>

  <div>
    <div class="card">
      <h2>QA gates</h2>
      <div class="gates">
        ${qa.gates.map((g) => `<div class="gate"><span class="mark ${g.pass ? 'ok-text' : 'bad-text'}">${g.pass ? '✓' : '✗'}</span><span>${escapeHtml(g.label)} <span class="muted">— ${escapeHtml(g.value)} (want ${escapeHtml(g.expected)})</span></span></div>`).join('')}
      </div>
    </div>

    ${critique ? `<div class="card">
      <h2>Critic (${critique.source})</h2>
      ${critique.issues.length === 0 ? '<p class="muted" style="margin:0">no issues</p>' : `<table><tr><th>beat</th><th>severity</th><th>problem</th></tr>${critique.issues.map((i) => `<tr><td><code>${escapeHtml(i.beatId)}</code></td><td class="${i.severity === 'high' ? 'bad-text' : ''}">${i.severity}</td><td>${escapeHtml(i.problem)}</td></tr>`).join('')}</table>`}
      ${critique.patches.length > 0 ? `<h2 style="margin-top:16px">Suggested patches</h2><table><tr><th>beat</th><th>field</th><th>change</th></tr>${critique.patches.map((p) => `<tr><td><code>${escapeHtml(p.beatId)}</code></td><td>${escapeHtml(p.field)}</td><td>${escapeHtml(String(p.from))} → <code>${escapeHtml(String(p.to))}</code></td></tr>`).join('')}</table>` : ''}
      ${critique.notes.length > 0 ? `<p class="muted" style="font-size:13px">${critique.notes.map(escapeHtml).join(' · ')}</p>` : ''}
    </div>` : ''}

    ${input.distinctness ? `<div class="card">
      <h2>Distinctness (palette + structure, threshold ${input.distinctness.threshold})</h2>
      <table><tr><th>pair</th><th>avg distance</th><th>structure only</th></tr>${input.distinctness.pairs.map((p) => `<tr><td>${escapeHtml(p.a)} ↔ ${escapeHtml(p.b)}</td><td class="${p.distinct ? 'ok-text' : 'bad-text'}">${p.distance}</td><td class="muted">${p.structureOnly}</td></tr>`).join('')}</table>
      ${input.distinctness.advice.map((a) => `<p class="muted" style="font-size:13px">${escapeHtml(a)}</p>`).join('')}
    </div>` : ''}

    <div class="card">
      <h2>Timing</h2>
      <table><tr><th>beat</th><th>role</th><th>visual</th><th>requested</th><th>measured</th><th>final</th></tr>
      ${timing.beats.map((b) => {
        const fmt = spec.beats.find((x) => x.id === b.id);
        return `<tr><td><code>${escapeHtml(b.id)}</code></td><td>${escapeHtml(fmt?.role ?? '')}</td><td>${escapeHtml(fmt?.visual.type ?? '')}</td><td class="muted">${b.requestedMaxSec}s</td><td class="muted">${(b.measuredMs / 1000).toFixed(2)}s</td><td class="${b.capped ? 'bad-text' : ''}">${b.finalSec}s</td></tr>`;
      }).join('')}
      </table>
    </div>

    <div class="card">
      <h2>Stills</h2>
      <div class="stills">${input.stillsRel.map((s) => `<img src="${escapeHtml(s)}" alt="still">`).join('')}</div>
    </div>

    <div class="card">
      <h2>Licences</h2>
      <table><tr><th>asset</th><th>source</th><th>licence</th></tr>
      ${publish.licenses.map((l) => `<tr><td>${escapeHtml(l.asset)}</td><td class="muted">${escapeHtml(l.source)}</td><td>${escapeHtml(l.license)}</td></tr>`).join('')}
      </table>
    </div>
  </div>
</main>
</body>
</html>`;
  fs.mkdirSync(path.dirname(input.outFile), { recursive: true });
  fs.writeFileSync(input.outFile, html);
  return input.outFile;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
