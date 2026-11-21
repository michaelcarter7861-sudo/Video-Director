/**
 * DotGrid — a matrix of dots that ripples in, with a headline. Procedural, zero assets.
 * Great for "the system", "scale", "network" beats.
 */
import { drawBackground, hexToRgba, wrapText } from '../engine/draw.js';
import { clamp, easeOutCubic, progress } from '../lib/easing.js';
import { Rng } from '../lib/rng.js';
import type { Env } from '../engine/types.js';

export function dotGrid(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f, dur } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.4 });

  const seed = beat.visual.seed ?? (beat.index + 1) * 3571;
  const cols = Math.max(8, Math.round(w / 64));
  const rows = Math.max(10, Math.round(h / 64));
  const gapX = w / cols;
  const gapY = h / rows;
  const rng = new Rng(seed);
  const phase = rng.float(0, Math.PI * 2);
  const t = f / Math.max(1, dur);

  // ripple reveal from the centre
  const maxDist = Math.hypot(w / 2, h / 2);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = gapX * col + gapX / 2;
      const y = gapY * row + gapY / 2;
      const dist = Math.hypot(x - w / 2, y - h / 2);
      const wave = Math.sin(dist / 90 - t * 6 + phase);
      const reveal = clamp((1 - dist / maxDist) * 1.6 * easeOutCubic(progress(f, Math.max(10, dur * 0.35))) + wave * 0.12);
      if (reveal <= 0.02) continue;
      const r = 2.2 + 4.2 * reveal;
      ctx.fillStyle = hexToRgba(wave > 0.55 ? p.accent : p.fgMuted, 0.16 + reveal * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // headline plate so contrast never fails
  const text = (beat.onScreen || beat.words.map((x) => x.word).join(' ')).trim();
  if (text) {
    const size = Math.round(w * 0.055);
    const lines = wrapText(ctx, text, {
      family: fonts.display.family,
      weight: fonts.display.weight,
      size,
      color: p.fg,
      maxWidth: w - env.canvas.sideMargin * 2,
      lineHeight: 1.12,
    });
    const blockH = lines.length * size * 1.12;
    const top = h * 0.46 - blockH / 2;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, top - size * 0.45, w, blockH + size * 0.9);
    ctx.restore();

    ctx.fillStyle = p.fg;
    ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * size * 1.12));
    ctx.textAlign = 'left';
  }
}
