/**
 * Glitch — RGB-split headline with slice displacement and scanlines.
 * Use for pattern interrupts and "this is wrong" beats, sparingly (it burns attention).
 */
import { drawBackground, hexToRgba, layoutWords, roundRect } from '../engine/draw.js';
import { clamp, easeOutCubic, progress } from '../lib/easing.js';
import { jitter } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function glitch(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f, dur } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette });

  const text = (beat.onScreen || beat.words.map((x) => x.word).join(' ') || '').trim();
  const size = fit(ctx, text, w - env.canvas.sideMargin * 2, h * 0.34, fonts.display.family, fonts.display.weight);
  const { boxes, lineHeight } = layoutWords(ctx, text, {
    family: fonts.display.family,
    weight: fonts.display.weight,
    size,
    color: p.fg,
    align: 'left',
    maxWidth: w - env.canvas.sideMargin * 2,
    x: env.canvas.sideMargin,
    y: h * 0.36,
    uppercase: fonts.uppercaseDisplay,
  });

  // intensity decays: strong at the start of the beat, calm by the end
  const attack = clamp(1 - progress(f, Math.max(8, dur * 0.45)));
  const burst = attack * 18 + 2;
  const settled = progress(f, 10);

  ctx.textBaseline = 'top';
  ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;

  // accent bar
  ctx.fillStyle = p.accent;
  const barW = (w - env.canvas.sideMargin * 2) * 0.3 * easeOutCubic(progress(f, 12));
  roundRect(ctx, env.canvas.sideMargin, h * 0.30, barW, Math.round(h * 0.011), 6);
  ctx.fill();

  for (const [li, box] of boxes.entries()) {
    const room = Math.max(0, Math.min(env.canvas.sideMargin, w * 0.06));
    const dx = jitter(Math.floor(f / 2), li + 7, Math.min(burst, room));
    const dy = jitter(Math.floor(f / 3), li + 13, burst * 0.35);

    ctx.save();
    ctx.globalAlpha = clamp(settled * 1.6) * 0.9;
    // red and cyan ghosts
    ctx.fillStyle = hexToRgba(p.accent, 0.85);
    ctx.fillText(box.word, box.x + dx + 4, box.y + dy);
    ctx.fillStyle = hexToRgba(p.accentAlt, 0.85);
    ctx.fillText(box.word, box.x - dx - 4, box.y - dy);
    ctx.restore();

    ctx.globalAlpha = clamp(settled * 1.6);
    ctx.fillStyle = p.fg;
    ctx.fillText(box.word, box.x, box.y);
    ctx.globalAlpha = 1;
  }

  // scanline slices
  ctx.save();
  const slices = 5;
  for (let i = 0; i < slices; i++) {
    const y = (h * 0.34 + i * (lineHeight * boxes.length)) / slices + (i * h) / slices;
    const shift = jitter(Math.floor(f / 2), i + 31, burst * 1.6);
    ctx.fillStyle = hexToRgba(p.fg, 0.06);
    ctx.fillRect(shift, y, w, 3);
  }
  ctx.restore();

  // scanlines
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#000';
  for (let y = 0; y < h; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function fit(ctx: Env['ctx'], text: string, maxW: number, maxH: number, family: string, weight: number): number {
  // both axes: the width check is what stops long hook lines from bleeding off-canvas
  let size = 220;
  while (size > 40) {
    ctx.font = `${weight} ${size}px "${family}"`;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxW || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if (lines.length * size * 1.1 <= maxH && widest <= maxW) return size;
    size -= 6;
  }
  return 40;
}
