/**
 * Split — before/after, wrong/right, old/new. Two panels slide in from opposite sides.
 */
import { drawBackground, hexToRgba, roundRect, withAlpha, wrapText } from '../engine/draw.js';
import { easeOutCubic, easeOutExpo, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function split(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette });

  const vertical = h > w;
  const pad = env.canvas.sideMargin;
  const gap = 28;
  const leftText = beat.visual.left ?? beat.onScreen;
  const rightText = beat.visual.right ?? beat.words.map((x) => x.word).join(' ');

  const panelW = vertical ? w - pad * 2 : (w - pad * 2 - gap) / 2;
  const panelH = vertical ? (h * 0.44 - gap) / 2 : h * 0.46;

  const panels = [
    { text: leftText, color: p.fgMuted, accent: false, dy: -1, dx: -1, x: vertical ? pad : pad, y: vertical ? h * 0.2 : h * 0.22 },
    { text: rightText, color: p.fg, accent: true, dy: 1, dx: 1, x: vertical ? pad : pad + panelW + gap, y: vertical ? h * 0.2 + panelH + gap : h * 0.22 },
  ];

  panels.forEach((panel, i) => {
    const pr = easeOutExpo(progress(f, 18, i * 6));
    if (pr <= 0) return;
    const offX = vertical ? 0 : (1 - pr) * 200 * panel.dx;
    const offY = vertical ? (1 - pr) * 160 * panel.dy : 0;

    withAlpha(ctx, Math.min(1, pr * 1.4), () => {
      ctx.save();
      ctx.translate(offX, offY);

      ctx.fillStyle = panel.accent ? hexToRgba(p.accent, 0.1) : hexToRgba(p.bgAlt, 0.9);
      roundRect(ctx, panel.x, panel.y, panelW, panelH, 26);
      ctx.fill();
      ctx.strokeStyle = panel.accent ? p.accent : hexToRgba(p.fgMuted, 0.45);
      ctx.lineWidth = panel.accent ? 5 : 2;
      ctx.stroke();

      // tag
      ctx.fillStyle = panel.accent ? p.accent : hexToRgba(p.fgMuted, 0.85);
      ctx.font = `700 ${Math.round(w * 0.026)}px "${fonts.mono.family}"`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(panel.accent ? 'AFTER' : 'BEFORE', panel.x + 26, panel.y + 22);

      // text
      const size = fitSplit(ctx, panel.text, panelW - 52, panelH * 0.5, fonts.display.family, fonts.display.weight);
      const lines = wrapText(ctx, panel.text, {
        family: fonts.display.family,
        weight: fonts.display.weight,
        size,
        color: panel.color,
        maxWidth: panelW - 52,
        lineHeight: 1.1,
      });
      ctx.fillStyle = panel.accent ? p.fg : p.fgMuted;
      ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;
      lines.forEach((line, li) => {
        ctx.fillText(line, panel.x + 26, panel.y + panelH * 0.42 + li * size * 1.1);
      });
      ctx.restore();
    });
  });

  // divider arrow
  const arrowP = easeOutCubic(progress(f, 16, 10));
  withAlpha(ctx, arrowP, () => {
    ctx.fillStyle = p.accent;
    if (vertical) {
      const cy = h * 0.2 + panelH + gap / 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 22, cy - 10);
      ctx.lineTo(w / 2 + 22, cy - 10);
      ctx.lineTo(w / 2, cy + 18);
      ctx.closePath();
      ctx.fill();
    } else {
      const cx = pad + panelW + gap / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 12, h * 0.22 + panelH / 2 - 18);
      ctx.lineTo(cx - 12, h * 0.22 + panelH / 2 + 18);
      ctx.lineTo(cx + 16, h * 0.22 + panelH / 2);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function fitSplit(
  ctx: Env['ctx'],
  text: string,
  maxW: number,
  maxH: number,
  family: string,
  weight: number,
): number {
  let size = 120;
  while (size > 30) {
    const lines = wrapText(ctx, text, { family, weight, size, color: '#fff', maxWidth: maxW, lineHeight: 1.1 });
    if (lines.length * size * 1.1 <= maxH) return size;
    size -= 4;
  }
  return 30;
}
