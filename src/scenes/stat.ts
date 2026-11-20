/**
 * Stat — one big number that counts up, with label and a delta chip.
 */
import { drawBackground, hexToRgba, roundRect, withAlpha } from '../engine/draw.js';
import { easeOutExpo, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function stat(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.4 });

  const value = beat.visual.value ?? 0;
  const decimals = beat.visual.decimals ?? 0;
  const countP = easeOutExpo(progress(f, Math.max(12, env.dur * 0.5)));
  const shown = value * countP;

  const rawLabel = beat.onScreen || '';
  const label = rawLabel.split(/\s+/).filter(Boolean).length <= 4 ? rawLabel : '';
  const numText = `${beat.visual.prefix ?? ''}${shown.toFixed(decimals)}${beat.visual.suffix ?? ''}`;

  // ring behind the number
  const cx = w / 2;
  const cy = h * 0.44;
  const radius = Math.min(w, h) * 0.26;
  const ringP = easeOutExpo(progress(f, 30));

  ctx.save();
  ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.5);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringP * 0.999);
  ctx.stroke();
  ctx.restore();

  // number
  const size = fitNumber(ctx, numText, radius * 1.7, fonts.display.family, fonts.display.weight);
  ctx.fillStyle = p.fg;
  ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  withAlpha(ctx, progress(f, 8), () => {
    ctx.fillText(numText, cx, cy);
  });

  // label (short only — the karaoke caption already carries the full line)
  if (label) {
    withAlpha(ctx, progress(f, 14, 6), () => {
      ctx.font = `${fonts.body.weight} ${Math.round(w * 0.038)}px "${fonts.body.family}"`;
      ctx.fillStyle = p.fgMuted;
      ctx.fillText(label.toUpperCase(), cx, cy + radius * 0.78);
    });
  }

  // delta chip
  if (beat.visual.chartType) {
    withAlpha(ctx, progress(f, 10, 18), () => {
      const chip = beat.visual.chartType === 'bar' ? 'before' : 'after';
      ctx.font = `600 ${Math.round(w * 0.03)}px "${fonts.body.family}"`;
      const tw = ctx.measureText(chip).width;
      roundRect(ctx, cx - tw / 2 - 20, cy + radius * 0.9, tw + 40, 54, 27);
      ctx.fillStyle = hexToRgba(p.accentAlt, 0.16);
      ctx.fill();
      ctx.fillStyle = p.accentAlt;
      ctx.fillText(chip, cx, cy + radius * 0.9 + 27);
    });
  }
}

function fitNumber(
  ctx: Env['ctx'],
  text: string,
  maxW: number,
  family: string,
  weight: number,
): number {
  let size = 320;
  while (size > 48) {
    ctx.font = `${weight} ${size}px "${family}"`;
    if (ctx.measureText(text).width <= maxW) return size;
    size -= 8;
  }
  return 48;
}
