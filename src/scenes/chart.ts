/**
 * Chart — bar or line chart that builds up frame by frame, with an animated callout.
 * Deliberately hand-drawn on canvas (no chart lib) so output is deterministic and tiny.
 */
import { drawBackground, hexToRgba, roundRect, withAlpha } from '../engine/draw.js';
import { easeOutCubic, easeOutExpo, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function chart(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.3, grid: false });

  const data = beat.visual.data ?? [];
  const type = beat.visual.chartType ?? 'bar';
  const plot = {
    x: env.canvas.sideMargin + w * 0.06,
    y: h * 0.34,
    w: w - (env.canvas.sideMargin + w * 0.06) * 2,
    h: h * 0.34,
  };

  const max = Math.max(...data.map((d) => d.value), 1);
  const build = easeOutCubic(progress(f, Math.max(16, env.dur * 0.45)));

  // axes
  withAlpha(ctx, 0.9, () => {
    ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();

    // horizontal guide lines
    ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.35);
    for (let i = 1; i <= 3; i++) {
      const y = plot.y + plot.h - (plot.h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  if (type === 'bar') {
    const n = Math.max(1, data.length);
    const slot = plot.w / n;
    const barW = Math.min(slot * 0.52, 150);
    data.forEach((d, i) => {
      const p0 = easeOutExpo(progress(f, 16, i * 5));
      const barH = (d.value / max) * plot.h * build * p0;
      const x = plot.x + slot * i + (slot - barW) / 2;
      const y = plot.y + plot.h - barH;
      const color = i === data.length - 1 ? p.accent : hexToRgba(p.accentAlt, 0.85);

      ctx.fillStyle = color;
      roundRect(ctx, x, y, barW, barH, Math.min(14, barW / 4));
      ctx.fill();

      ctx.fillStyle = p.fg;
      ctx.font = `600 ${Math.round(w * 0.026)}px "${fonts.body.family}"`;
      ctx.fillText(String(Math.round(d.value)), x + barW / 2, y - Math.round(w * 0.04));

      ctx.fillStyle = p.fgMuted;
      ctx.font = `600 ${Math.round(w * 0.03)}px "${fonts.body.family}"`;
      ctx.fillText(d.label, x + barW / 2, plot.y + plot.h + 22);
    });
  } else {
    // line chart
    const step = data.length > 1 ? plot.w / (data.length - 1) : plot.w;
    const pts = data.map((d, i) => ({
      x: plot.x + i * step,
      y: plot.y + plot.h - (d.value / max) * plot.h,
    }));
    const visibleCount = Math.max(2, Math.ceil(pts.length * build));
    const shown = pts.slice(0, visibleCount);

    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    shown.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.stroke();

    // area fill
    const grad = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
    grad.addColorStop(0, hexToRgba(p.accent, 0.28));
    grad.addColorStop(1, hexToRgba(p.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(shown[0]!.x, plot.y + plot.h);
    shown.forEach((pt) => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(shown[shown.length - 1]!.x, plot.y + plot.h);
    ctx.closePath();
    ctx.fill();

    shown.forEach((pt) => {
      ctx.fillStyle = p.bg;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 5;
      ctx.stroke();
    });

    data.forEach((d, i) => {
      ctx.fillStyle = p.fgMuted;
      ctx.font = `500 ${Math.round(w * 0.024)}px "${fonts.body.family}"`;
      ctx.fillText(d.label, plot.x + i * step, plot.y + plot.h + 18);
    });
  }

  // headline + callout
  if (beat.onScreen) {
    ctx.textAlign = 'left';
    ctx.fillStyle = p.fg;
    ctx.font = `${fonts.display.weight} ${Math.round(w * 0.055)}px "${fonts.display.family}"`;
    ctx.fillText(beat.onScreen, env.canvas.sideMargin, h * 0.24);
  }

  const best = data.reduce<{ label: string; value: number } | undefined>((a, b) => (!a || b.value > a.value ? b : a), undefined);
  if (best) {
    withAlpha(ctx, progress(f, 10, 20), () => {
      const text = `${best.label}: ${Math.round(best.value)}`;
      ctx.textAlign = 'left';
      ctx.font = `600 ${Math.round(w * 0.03)}px "${fonts.body.family}"`;
      const tw = ctx.measureText(text).width;
      roundRect(ctx, env.canvas.sideMargin, h * 0.24 + w * 0.08, tw + 44, 66, 33);
      ctx.fillStyle = hexToRgba(p.accent, 0.18);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, env.canvas.sideMargin + 22, h * 0.24 + w * 0.08 + 34);
    });
  }
}
