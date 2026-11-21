/**
 * Abstract — procedural motion background with a headline. Used for loop/CTA beats,
 * transitions and anywhere a "breathing" frame is needed without stock footage.
 */
import { drawBackground, drawTracked, hexToRgba, withAlpha } from '../engine/draw.js';
import { clamp, easeInOutCubic, progress } from '../lib/easing.js';
import { Rng } from '../lib/rng.js';
import type { Env } from '../engine/types.js';

export function abstract(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f, dur } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.5 });

  const seed = beat.visual.seed ?? (beat.index + 1) * 7919;
  const rng = new Rng(seed);
  const orbitCount = 5 + rng.int(0, 3);
  const t = f / Math.max(1, dur);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < orbitCount; i++) {
    const r = Math.min(w, h) * (0.18 + i * 0.075);
    const speed = 0.6 + i * 0.22;
    const angle = t * Math.PI * 2 * speed + rng.float(0, Math.PI * 2);
    const cx = w / 2 + Math.cos(angle) * (r * 0.42);
    const cy = h * 0.46 + Math.sin(angle * 0.9) * (r * 0.3);
    const radius = r * (0.5 + 0.08 * Math.sin(angle * 2));

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const color = i % 2 === 0 ? p.accent : p.accentAlt;
    grad.addColorStop(0, hexToRgba(color, 0.16));
    grad.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // scanning lines — cheap "system running" feeling
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = p.fg;
  ctx.lineWidth = 1;
  const lineStep = 6;
  const offset = (f * 2) % lineStep;
  for (let y = -lineStep; y < h; y += lineStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + offset);
    ctx.lineTo(w, y + offset);
    ctx.stroke();
  }
  ctx.restore();

  const title = beat.onScreen || beat.words.map((x) => x.word).join(' ');
  if (title) {
    // fit the headline inside the frame; never let it bleed off the edges
    let size = Math.round(w * (title.length > 30 ? 0.07 : 0.09));
    const maxW = w - env.canvas.sideMargin * 2;
    ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;
    while (size > 28 && ctx.measureText(title).width > maxW) {
      size -= 4;
      ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;
    }
    const inP = easeInOutCubic(progress(f, 16));
    const outP = easeInOutCubic(progress(f, 12, dur - 12));
    const alpha = clamp(inP - outP);
    withAlpha(ctx, alpha, () => {
      ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;
      ctx.fillStyle = p.fg;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const y = h * 0.5 + (1 - inP) * 40;
      const lines = title.split(' ').length > 4 ? splitIntoTwoLines(title) : [title];
      lines.forEach((line, i) => {
        drawTracked(ctx, fonts.uppercaseDisplay ? line.toUpperCase() : line, w / 2, y + (i - (lines.length - 1) / 2) * size * 1.15, 1.5, 'center');
      });
    });
  }
}

function splitIntoTwoLines(text: string): string[] {
  const words = text.split(' ');
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}
