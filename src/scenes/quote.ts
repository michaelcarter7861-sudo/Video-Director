/**
 * Quote — a pull quote with an oversized quotation mark and attribution.
 * For testimony, docs, and "the official position" beats.
 */
import { drawBackground, hexToRgba, wrapText } from '../engine/draw.js';
import { clamp, easeOutCubic, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function quote(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.5 });

  const text = beat.onScreen || beat.visual.left || beat.words.map((x) => x.word).join(' ');
  const attribution = beat.visual.right ?? '';
  const family = fonts.display.family;
  const weight = fonts.display.weight;
  const maxW = w - env.canvas.sideMargin * 2 - w * 0.05;

  // giant quote mark
  const markP = easeOutCubic(progress(f, 14));
  ctx.save();
  ctx.globalAlpha = 0.16 * markP;
  ctx.fillStyle = p.accent;
  ctx.font = `700 ${Math.round(w * 0.42)}px "${family}"`;
  ctx.textBaseline = 'top';
  ctx.fillText('“', env.canvas.sideMargin - w * 0.02, h * 0.18);
  ctx.restore();

  let size = Math.round(w * 0.088);
  while (size > 30) {
    ctx.font = `${weight} ${size}px "${family}"`;
    const lines = wrapText(ctx, text, { family, weight, size, color: p.fg, maxWidth: maxW, lineHeight: 1.18 });
    if (lines.length * size * 1.18 <= h * 0.34) break;
    size -= 6;
  }
  const lines = wrapText(ctx, text, { family, weight, size, color: p.fg, maxWidth: maxW, lineHeight: 1.18 });
  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.fillStyle = p.fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const top = h * 0.4 - (lines.length * size * 1.18) / 2;
  lines.forEach((line, i) => {
    const pr = easeOutCubic(progress(f, 8, i * 4));
    ctx.save();
    ctx.globalAlpha = clamp(pr * 1.4);
    ctx.fillText(line, env.canvas.sideMargin, top + i * size * 1.18 + (1 - pr) * 14);
    ctx.restore();
  });

  if (attribution) {
    const pr = easeOutCubic(progress(f, 12, lines.length * 4 + 4));
    ctx.save();
    ctx.globalAlpha = clamp(pr * 1.3);
    const y = top + lines.length * size * 1.18 + size * 0.5;
    ctx.fillStyle = p.accent;
    ctx.fillRect(env.canvas.sideMargin, y + 8, 54, 5);
    ctx.fillStyle = p.fgMuted;
    ctx.font = `600 ${Math.round(w * 0.032)}px "${fonts.body.family}"`;
    ctx.fillText(attribution, env.canvas.sideMargin + 74, y);
    ctx.restore();
  }

  // corner rule
  ctx.strokeStyle = hexToRgba(p.fgMuted, 0.35);
  ctx.lineWidth = 2;
  ctx.strokeRect(env.canvas.sideMargin / 2, h * 0.26, w - env.canvas.sideMargin, h * 0.36);
}
