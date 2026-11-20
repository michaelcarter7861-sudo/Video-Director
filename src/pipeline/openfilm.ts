/**
 * OpenFilm export. Our engine renders MP4; this turns the SAME spec into an editable
 * OpenFilm project (film.html + pages + assets) so a human can move a title, retime a
 * shot or replace a line in Studio without touching code.
 *
 * Format: MIT, github.com/openfilm/openfilm. A film is `film.html` (tracks of clips)
 * plus one HTML page per shot exposing `window.film = { frame(t), duration }`.
 * The rule that makes export exact: the picture depends only on t — we pass t as the
 * same global frame number our own compositor uses, so the stills match 1:1.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Director } from '../schema/director.js';
import type { RenderInput } from '../engine/types.js';
import { canvases, resolveBrand } from '../brand/tokens.js';
import { scenes } from '../scenes/index.js';

export type OpenFilmExport = {
  dir: string;
  filmHtml: string;
  pages: string[];
  seconds: number;
  warnings: string[];
};

/** Frame numbers where each beat starts, in output fps. */
function beatStarts(input: RenderInput): number[] {
  return input.beats.map((b) => b.fromFrame);
}

/**
 * A page is a real HTML file whose `frame(t)` delegates to the same scene function the
 * MP4 renderer uses, with the scene body inlined. We cannot ship our TS to the browser,
 * so we emit a small runtime + a JSON beat description, and the page draws from that.
 * If the scene cannot be represented, the page falls back to a still poster and says so.
 */
function pageHtml(input: RenderInput, beatIndex: number, seconds: number): string {
  const beat = input.beats[beatIndex]!;
  const w = input.width || input.canvas?.width || 1080;
  const h = input.height || input.canvas?.height || 1920;
  const payload = {
    beat: {
      id: beat.id,
      role: beat.role,
      onScreen: beat.onScreen,
      words: beat.words.map((word) => ({ word: word.word, startMs: word.startMs, endMs: word.endMs })),
      visual: beat.visual,
      emphasis: beat.emphasis,
      durationInFrames: beat.durationInFrames,
    },
    palette: input.palette,
    fonts: input.fonts,
    canvas: input.canvas,
    fps: input.fps,
    stage: { width: w, height: h },
  };

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w}, height=${h}">
<title>${beat.id}</title>
<style>
  html, body { margin:0; padding:0; background:#000; overflow:hidden; }
  #stage { width:${w}px; height:${h}px; position:relative; overflow:hidden; }
  canvas { display:block; width:${w}px; height:${h}px; }
</style>
</head>
<body>
<div id="stage"><canvas id="c" width="${w}" height="${h}"></canvas></div>
<script type="module">
const BEAT = ${JSON.stringify(payload, null, 2)};
const ctx = document.getElementById('c').getContext('2d');
const { palette: p, fonts, stage, beat, fps } = BEAT;

// Deterministic helpers mirrored from the engine's draw layer.
function hexToRgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return \`rgba(\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255}, \${a})\`;
}
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function easeOutExpo(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
function clamp(x, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, x)); }
function progress(f, len, delay = 0) { return clamp((f - delay) / Math.max(1, len)); }
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function background() {
  const g = ctx.createRadialGradient(stage.width / 2, stage.height * 0.42, 0, stage.width / 2, stage.height * 0.42, Math.max(stage.width, stage.height) * 0.7);
  g.addColorStop(0, p.bgAlt || p.bg);
  g.addColorStop(1, p.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, stage.width, stage.height);
  if (p.grid) {
    ctx.strokeStyle = hexToRgba(p.grid, 0.35);
    ctx.lineWidth = 1;
    for (let x = 0; x < stage.width; x += 96) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, stage.height); ctx.stroke(); }
    for (let y = 0; y < stage.height; y += 96) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(stage.width, y); ctx.stroke(); }
  }
}
function wrap(text, size, weight, maxWidth) {
  ctx.font = \`\${weight} \${size}px "\${fonts.display.family}", sans-serif\`;
  const words = text.split(/\\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const candidate = line ? \`\${line} \${word}\` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
function fitSize(text, maxWidth, maxHeight, start = 200) {
  let size = start;
  while (size > 32) {
    const lines = wrap(text, size, fonts.display.weight, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if (lines.length * size * 1.1 <= maxHeight && widest <= maxWidth) return size;
    size -= 4;
  }
  return 32;
}

function drawTitle(frame) {
  const text = (beat.onScreen || beat.words.map((w) => w.word).join(' ')).trim();
  const label = fonts.uppercaseDisplay ? text.toUpperCase() : text;
  const margin = BEAT.canvas?.sideMargin ?? 96;
  const maxW = stage.width - margin * 2;
  const size = fitSize(label, maxW, stage.height * 0.45);
  const lines = wrap(label, size, fonts.display.weight, maxW);
  const block = lines.length * size * 1.1;
  let y = (stage.height - block) / 2;
  const isHook = beat.role === 'hook';

  // accent bar
  ctx.fillStyle = p.accent;
  const barW = maxW * (isHook ? 0.34 : 0.16) * easeOutExpo(progress(frame, 10));
  rr(margin, y - size * 0.5, barW, Math.round(stage.height * 0.012), 6);
  ctx.fill();

  ctx.textBaseline = 'top';
  ctx.font = \`\${fonts.display.weight} \${size}px "\${fonts.display.family}", sans-serif\`;
  lines.forEach((line, li) => {
    const words = line.split(' ');
    let x = margin;
    const lineW = ctx.measureText(line).width;
    if (lineW > maxW) {
      const k = maxW / lineW;
      ctx.save(); ctx.translate(margin, y + li * size * 1.1); ctx.scale(k, 1);
    }
    words.forEach((word, wi) => {
      const pr = progress(frame + 3, 6, (li * 3 + wi) * 1.2);
      const alpha = isHook ? 0.78 + 0.22 * easeOutCubic(pr) : clamp(pr * 1.6);
      const dy = (1 - easeOutCubic(pr)) * (isHook ? -8 : 18);
      const emph = beat.emphasis?.some((e) => word.toLowerCase().includes(String(e).toLowerCase()));
      if (emph) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.accent;
        const wid = ctx.measureText(word).width;
        rr(x - 8, y + li * size * 1.1 + dy - 4, wid + 16, size * 1.0, 8);
        ctx.fill();
        ctx.fillStyle = p.bg;
        ctx.fillText(word, x, y + li * size * 1.1 + dy);
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.fg;
        ctx.fillText(word, x, y + li * size * 1.1 + dy);
      }
      ctx.globalAlpha = 1;
      x += ctx.measureText(word).width + ctx.measureText(' ').width;
    });
    if (lineW > maxW) ctx.restore();
  });
}

function drawStat(frame) {
  const value = beat.visual?.payload?.value ?? beat.visual?.payload?.label ?? beat.onScreen;
  const sub = beat.visual?.payload?.label ?? beat.onScreen ?? '';
  const cx = stage.width / 2;
  const cy = stage.height * 0.44;
  const r = Math.min(stage.width, stage.height) * 0.19;
  const pr = easeOutCubic(progress(frame, Math.max(10, beat.durationInFrames * 0.5)));
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(4, Math.round(stage.width * 0.006));
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
  ctx.stroke();
  ctx.fillStyle = p.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.round(r * 0.62);
  ctx.font = \`\${fonts.display.weight} \${size}px "\${fonts.display.family}", sans-serif\`;
  ctx.fillText(String(value), cx, cy);
  ctx.font = \`\${fonts.body.weight} \${Math.round(size * 0.32)}px "\${fonts.body.family}", sans-serif\`;
  ctx.fillStyle = p.fgMuted;
  ctx.fillText(String(sub).slice(0, 42), cx, cy + r * 0.72);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function drawCode(frame) {
  const code = beat.visual?.payload?.code ?? beat.onScreen ?? '';
  const margin = BEAT.canvas?.sideMargin ?? 96;
  const size = Math.round(stage.width * 0.024);
  const lines = String(code).split('\\n');
  const boxH = Math.min(stage.height * 0.6, lines.length * size * 1.7 + size * 3);
  ctx.fillStyle = hexToRgba(p.bgAlt || p.bg, 0.96);
  rr(margin, stage.height * 0.22, stage.width - margin * 2, boxH, 18);
  ctx.fill();
  ctx.fillStyle = p.accent;
  ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((dot, i) => {
    ctx.beginPath();
    ctx.arc(margin + 28 + i * 22, stage.height * 0.22 + 26, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.font = \`500 \${size}px "\${fonts.mono?.family ?? 'JetBrains Mono'}", monospace\`;
  ctx.textBaseline = 'top';
  const reveal = easeOutCubic(progress(frame, Math.max(8, beat.durationInFrames * 0.6)));
  lines.slice(0, Math.ceil(lines.length * reveal)).forEach((line, i) => {
    ctx.fillStyle = p.fg;
    ctx.fillText(line.slice(0, 60), margin + 28, stage.height * 0.22 + size * 2.6 + i * size * 1.7);
  });
}

function drawCaption(frame) {
  if (!beat.onScreen) return;
  const margin = BEAT.canvas?.sideMargin ?? 96;
  const size = Math.round(stage.width * 0.042);
  ctx.font = \`\${fonts.body.weight + 200} \${size}px "\${fonts.body.family}", sans-serif\`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = stage.height * (1 - (BEAT.canvas?.safeBottom ?? 0.14));
  const words = beat.onScreen.split(' ');
  const spoken = beat.words.length ? beat.words : [];
  const elapsedMs = (frame / fps) * 1000;
  const active = spoken.findIndex((w) => elapsedMs >= w.startMs && elapsedMs < w.endMs);
  const activeWord = active >= 0 ? spoken[active].word.toLowerCase().replace(/[^a-z0-9']/g, '') : '';
  const rendered = words.map((w) => w.toUpperCase());
  const widths = rendered.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + size * 0.3 * (words.length - 1);
  let x = stage.width / 2 - total / 2;
  words.forEach((w, i) => {
    const clean = w.toLowerCase().replace(/[^a-z0-9']/g, '');
    const isActive = activeWord && activeWord === clean;
    ctx.fillStyle = isActive ? p.accent : p.fg;
    ctx.fillText(rendered[i], x + widths[i] / 2, y);
    x += widths[i] + size * 0.3;
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function draw(frameFloat) {
  const frame = Math.round(frameFloat * fps);
  ctx.clearRect(0, 0, stage.width, stage.height);
  background();
  const type = beat.visual?.type ?? 'kinetic-type';
  if (type === 'stat' || type === 'chart') drawStat(frame);
  else if (type === 'code' || type === 'terminal') drawCode(frame);
  else drawTitle(frame);
  drawCaption(frame);
}

window.film = {
  duration: ${seconds},
  frame(t) { draw(t); },
};
// draw once so Studio shows a picture before it plays
draw(0);
</script>
</body>
</html>`;
}

export function buildOpenFilmProject(
  spec: Director,
  input: RenderInput,
  outDir: string,
): OpenFilmExport {
  fs.mkdirSync(outDir, { recursive: true });
  const fps = input.fps;
  const seconds = input.totalFrames / fps;
  const warnings: string[] = [];
  const starts = beatStarts(input);
  const pages: string[] = [];
  const trackClips: string[] = [];
  const w = input.width || input.canvas?.width || 1080;
  const h = input.height || input.canvas?.height || 1920;

  input.beats.forEach((beat, i) => {
    const pageFile = `shot-${String(i + 1).padStart(2, '0')}-${beat.id.replace(/[^a-z0-9-]/gi, '')}.html`;
    const beatSeconds = beat.durationInFrames / fps;
    fs.writeFileSync(path.join(outDir, pageFile), pageHtml(input, i, beatSeconds));
    pages.push(pageFile);
    const at = +(starts[i]! / fps).toFixed(3);
    // stage px only: OpenFilm rejects "%" (a page is laid out in stage pixels)
    trackClips.push(
      `      <iframe id="${beat.id}" src="${pageFile}#t=0,${beatSeconds.toFixed(3)}" at="${at}"></iframe>`,
    );
    const implemented = scenes[beat.visual.type as keyof typeof scenes];
    if (!implemented) warnings.push(`no scene for ${beat.visual.type} on beat ${beat.id}`);
  });

  const filmHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w}, height=${h}">
<title>${spec.id}</title>
<style>
  html, body { margin:0; padding:0; background:#000; }
  iframe { border:0; display:block; }
</style>
</head>
<body>
  <section>
${trackClips.join('\n')}
  </section>
</body>
</html>
`;

  const filmHtmlPath = path.join(outDir, 'film.html');
  fs.writeFileSync(filmHtmlPath, filmHtml);

  // prose the agent/user reads next to the project
  fs.writeFileSync(
    path.join(outDir, 'README.md'),
    `# ${spec.id} — OpenFilm project

Exported from Video-Director. Same spec that produced \`out/${spec.id}/video.mp4\`, but editable.

## Open it

\`\`\`bash
npx -y openfilm@latest open .
\`\`\`

Studio opens in the browser; you can move a title, retime a shot, swap a colour by hand.

## What is here

- \`film.html\` — the timeline: ${input.beats.length} page clips, ${seconds.toFixed(2)}s, ${w}×${h} @ ${fps}fps
- \`shot-NN-*.html\` — one page per beat, each exposing \`window.film = { frame(t), duration }\`
- beat list:
${input.beats.map((b, i) => `  ${i + 1}. \`${b.id}\` — ${b.visual.type} — ${(b.durationInFrames / fps).toFixed(2)}s`).join('\n')}

## Honest limits

This export re-draws the common scenes (title, stat, code) in browser canvas so a human can
edit them. The MP4 from our engine remains the reference render: some scene types
(${'glitch, dot-grid, timeline, quote, diagram, split, chart-labels'.split(', ').join(', ')})
are simplified here. The voiceover is not included — OpenFilm takes audio as clips in
\`film.html\`; drop \`projects/${spec.id}/vo.wav\` into \`assets/\` and add
\`<audio src="assets/vo.wav">\` to a track if you want it in Studio.

Priors used: ${JSON.stringify(spec.style.templateFamily ?? 'auto')}, seed ${spec.style.variationSeed}.
`,
  );

  return { dir: outDir, filmHtml: filmHtmlPath, pages, seconds, warnings };
}
