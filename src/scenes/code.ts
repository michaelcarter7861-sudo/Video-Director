/**
 * Code — a code panel that types itself out, line by line, with highlighted lines.
 * Highlighting is a tiny deterministic tokenizer (no shiki, no network).
 */
import { drawBackground, hexToRgba, roundRect, withAlpha, type Ctx } from '../engine/draw.js';
import { clamp, easeOutCubic, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

type Token = { text: string; kind: 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'fn' | 'punct' };

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'await', 'async',
  'import', 'from', 'export', 'default', 'class', 'new', 'type', 'interface', 'extends', 'implements',
  'try', 'catch', 'throw', 'switch', 'case', 'break', 'continue', 'of', 'in', 'as', 'satisfies',
  'def', 'elif', 'lambda', 'with', 'yield', 'None', 'True', 'False', 'elif', 'then', 'fi', 'do', 'done',
]);

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\/\/.*$|#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b|(\s+)|([^\s\w])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1]) tokens.push({ text: m[1], kind: 'comment' });
    else if (m[2]) tokens.push({ text: m[2], kind: 'string' });
    else if (m[3]) tokens.push({ text: m[3], kind: 'number' });
    else if (m[4]) {
      const word = m[4];
      const nextChar = line[re.lastIndex];
      tokens.push({
        text: word,
        kind: KEYWORDS.has(word) ? 'keyword' : nextChar === '(' ? 'fn' : 'plain',
      });
    } else if (m[5]) tokens.push({ text: m[5], kind: 'plain' });
    else if (m[6]) tokens.push({ text: m[6], kind: 'punct' });
  }
  return tokens;
}

export function code(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.5 });

  const codeText = beat.visual.code ?? beat.onScreen ?? '';
  const lines = codeText.replace(/\t/g, '  ').split('\n');
  const highlight = new Set(beat.visual.highlight ?? []);
  const panel = {
    x: env.canvas.sideMargin,
    y: h * 0.27,
    w: w - env.canvas.sideMargin * 2,
    h: Math.min(h * 0.56, 96 + lines.length * Math.round(w * 0.05)),
  };

  const panelAlpha = easeOutCubic(progress(f, 10));
  withAlpha(ctx, panelAlpha, () => {
    ctx.fillStyle = p.bgAlt;
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 22);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();

    // window chrome
    const dotY = panel.y + 24;
    [p.accent, p.accentAlt, p.fgMuted].forEach((c, i) => {
      ctx.fillStyle = hexToRgba(c, 0.9);
      ctx.beginPath();
      ctx.arc(panel.x + 26 + i * 22, dotY, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = hexToRgba(p.fgMuted, 0.8);
    ctx.font = `500 18px "${fonts.mono.family}"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(beat.visual.lang ?? 'ts', panel.x + 110, dotY);
  });

  const longest = Math.max(...lines.map((l) => l.length), 1);
  // fit the longest line inside the panel; 0.62em per mono char is a safe estimate
  const maxSize = Math.round((panel.w - 110) / (longest * 0.62));
  const size = Math.max(18, Math.min(Math.round(w * 0.032), maxSize));
  ctx.font = `400 ${size}px "${fonts.mono.family}"`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const lineH = size * 1.6;
  const startY = panel.y + 56;
  const totalChars = lines.reduce((a, l) => a + l.length, 0);
  const totalFramesTyping = Math.min(env.dur * 0.65, totalChars * 0.5);
  let charsShown = Math.round((progress(f, totalFramesTyping) * totalChars));

  lines.forEach((line, li) => {
    const y = startY + li * lineH;
    if (y > panel.y + panel.h - 20) return;
    const isHi = highlight.has(li + 1);
    const lineAlpha = li < 3 ? 1 : clamp(li * 3 - (charsShown > 0 ? 0 : 10));

    if (isHi) {
      ctx.fillStyle = hexToRgba(p.accent, 0.14);
      ctx.fillRect(panel.x + 8, y - 6, panel.w - 16, lineH - 4);
      ctx.fillStyle = p.accent;
      ctx.fillRect(panel.x + 8, y - 6, 4, lineH - 4);
    }

    // line number
    ctx.fillStyle = hexToRgba(p.fgMuted, 0.65 * lineAlpha);
    ctx.font = `400 ${Math.round(size * 0.8)}px "${fonts.mono.family}"`;
    ctx.fillText(String(li + 1).padStart(2, ' '), panel.x + 24, y + 2);

    let x = panel.x + 76;
    ctx.font = `400 ${size}px "${fonts.mono.family}"`;
    for (const token of tokenize(line)) {
      if (charsShown <= 0) break;
      const visible = token.text.slice(0, Math.max(0, charsShown));
      charsShown -= token.text.length;
      if (!visible) continue;
      ctx.fillStyle = colorFor(token.kind, p);
      ctx.fillText(visible, x, y);
      x += ctx.measureText(visible).width;
    }
  });

  // blinking cursor on the last visible line
  if (Math.floor(f / 8) % 2 === 0) {
    ctx.fillStyle = p.accent;
    ctx.fillRect(panel.x + 76 + 4, startY + Math.min(lines.length - 1, 12) * lineH, size * 0.6, size * 1.2);
  }

  // caption above the panel
  if (beat.onScreen) {
    ctx.fillStyle = p.fg;
    ctx.font = `${fonts.display.weight} ${Math.round(w * 0.055)}px "${fonts.display.family}"`;
    ctx.textAlign = 'left';
    ctx.fillText(beat.onScreen, env.canvas.sideMargin, h * 0.19);
  }
}

function colorFor(kind: Token['kind'], p: Env['palette']): string {
  switch (kind) {
    case 'keyword':
      return p.accent;
    case 'string':
      return p.accentAlt;
    case 'comment':
      return hexToRgba(p.fgMuted, 0.9);
    case 'number':
      return p.accentAlt;
    case 'fn':
      return p.fg;
    case 'punct':
      return hexToRgba(p.fg, 0.75);
    default:
      return p.fg;
  }
}

export function drawLineNumbers(ctx: Ctx): void {
  void ctx;
}
