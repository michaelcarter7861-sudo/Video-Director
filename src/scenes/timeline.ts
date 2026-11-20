/**
 * Timeline — horizontal event axis that draws itself left to right.
 * For "then vs now", roadmaps, version history, tech evolution.
 */
import { drawBackground, hexToRgba, roundRect, withAlpha } from '../engine/draw.js';
import { easeInOutCubic, easeOutCubic, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function timeline(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f, dur } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.3 });

  const nodes = beat.visual.nodes ?? [];
  const vertical = h > w;
  const pad = env.canvas.sideMargin;
  const drawP = easeInOutCubic(progress(f, Math.max(18, dur * 0.4)));

  if (vertical) {
    const x = pad + w * 0.06;
    const top = h * 0.3;
    const bottom = h * 0.72;
    // spine
    ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + (bottom - top) * drawP);
    ctx.stroke();

    nodes.forEach((label, i) => {
      const t = nodes.length === 1 ? 0 : i / (nodes.length - 1);
      const y = top + (bottom - top) * t;
      const appear = easeOutCubic(progress(f, 10, 6 + i * 8));
      if (appear <= 0) return;
      withAlpha(ctx, appear, () => {
        ctx.fillStyle = i === nodes.length - 1 ? p.accent : p.bgAlt;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = i === nodes.length - 1 ? p.accent : p.fgMuted;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = p.fg;
        ctx.font = `${fonts.display.weight} ${Math.round(w * 0.042)}px "${fonts.display.family}"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 46, y);
      });
    });
  } else {
    const y = h * 0.56;
    const left = pad + w * 0.04;
    const right = w - pad - w * 0.04;
    ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + (right - left) * drawP, y);
    ctx.stroke();

    nodes.forEach((label, i) => {
      const t = nodes.length === 1 ? 0 : i / (nodes.length - 1);
      const x = left + (right - left) * t;
      const appear = easeOutCubic(progress(f, 10, 6 + i * 8));
      if (appear <= 0) return;
      withAlpha(ctx, appear, () => {
        ctx.fillStyle = i === nodes.length - 1 ? p.accent : p.bgAlt;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = i === nodes.length - 1 ? p.accent : p.fgMuted;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = p.fg;
        ctx.font = `${fonts.display.weight} ${Math.round(w * 0.024)}px "${fonts.display.family}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const lines = label.split(' ');
        lines.forEach((line, li) => ctx.fillText(line, x, y + 34 + li * w * 0.032));
      });
    });
  }

  if (beat.onScreen) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = p.fg;
    ctx.font = `${fonts.display.weight} ${Math.round(w * 0.05)}px "${fonts.display.family}"`;
    ctx.fillText(beat.onScreen, pad, h * 0.2);
    ctx.fillStyle = p.accent;
    roundRect(ctx, pad, h * 0.2 + w * 0.07, w * 0.16, 6, 3);
    ctx.fill();
  }
}
