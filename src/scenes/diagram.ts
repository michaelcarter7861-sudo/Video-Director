/**
 * Diagram — node/edge flow that draws itself in draw order.
 * Good for "the 3-step system" beats that every tech explainer has.
 */
import { drawBackground, hexToRgba, roundRect, withAlpha } from '../engine/draw.js';
import { easeInOutCubic, easeOutCubic, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function diagram(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.3, grid: true });

  const nodes = beat.visual.nodes ?? [];
  const edges = beat.visual.edges ?? [];
  const vertical = h > w;

  // positions: vertical stack for 9:16, horizontal row for 16:9
  const positions = new Map<string, { x: number; y: number }>();
  const pad = env.canvas.sideMargin;
  nodes.forEach((n, i) => {
    const t = nodes.length === 1 ? 0.5 : i / (nodes.length - 1);
    positions.set(n, vertical
      ? { x: w / 2, y: h * 0.34 + t * h * 0.3 }
      : { x: pad + t * (w - pad * 2), y: h * 0.5 });
  });

  const nodeW = vertical ? w - pad * 2 : (w - pad * 2) / Math.max(2, nodes.length) - 24;
  const nodeH = vertical ? 108 : 132;

  // edges first (behind nodes)
  edges.forEach(([from, to], i) => {
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) return;
    const pr = easeInOutCubic(progress(f, 20, 6 + i * 8));
    if (pr <= 0) return;

    withAlpha(ctx, 0.9, () => {
      const startY = vertical ? a.y + nodeH / 2 : a.y;
      const endY = vertical ? b.y - nodeH / 2 : b.y;
      const startX = vertical ? a.x : a.x + nodeW / 2;
      const endX = vertical ? b.x : b.x - nodeW / 2;
      const midY = startY + (endY - startY) * pr;
      const midX = startX + (endX - startX) * pr;

      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, midY);
      } else {
        ctx.moveTo(startX, startY);
        ctx.lineTo(midX, endY);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // arrow head
      if (pr > 0.85) {
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(startX - 12, midY - 6);
          ctx.lineTo(startX + 12, midY - 6);
          ctx.lineTo(startX, midY + 14);
        } else {
          ctx.moveTo(midX + 6, endY - 12);
          ctx.lineTo(midX + 6, endY + 12);
          ctx.lineTo(midX - 14, endY);
        }
        ctx.closePath();
        ctx.fill();
      }
    });
  });

  nodes.forEach((n, i) => {
    const pos = positions.get(n)!;
    const pr = easeOutCubic(progress(f, 14, i * 6));
    if (pr <= 0) return;
    withAlpha(ctx, pr, () => {
      const scale = 0.92 + 0.08 * pr;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(scale, scale);
      ctx.translate(-pos.x, -pos.y);

      ctx.fillStyle = p.bgAlt;
      roundRect(ctx, pos.x - nodeW / 2, pos.y - nodeH / 2, nodeW, nodeH, 20);
      ctx.fill();
      ctx.strokeStyle = i === nodes.length - 1 ? p.accent : hexToRgba(p.fgMuted, 0.5);
      ctx.lineWidth = i === nodes.length - 1 ? 4 : 2;
      ctx.stroke();

      ctx.fillStyle = i === nodes.length - 1 ? p.accent : p.fgMuted;
      ctx.font = `700 ${Math.round(w * 0.026)}px "${fonts.mono.family}"`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1).padStart(2, '0'), pos.x - nodeW / 2 + 22, pos.y);

      ctx.fillStyle = p.fg;
      ctx.font = `${fonts.display.weight} ${Math.round(w * (vertical ? 0.042 : 0.03))}px "${fonts.display.family}"`;
      ctx.textAlign = 'center';
      ctx.fillText(n, pos.x + 14, pos.y);
      ctx.restore();
    });
  });

  if (beat.onScreen) {
    ctx.fillStyle = p.fg;
    ctx.font = `${fonts.display.weight} ${Math.round(w * 0.05)}px "${fonts.display.family}"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(beat.onScreen, env.canvas.sideMargin, h * 0.22);
  }
}
