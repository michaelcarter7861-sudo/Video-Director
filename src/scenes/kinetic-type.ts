/**
 * KineticType — full-bleed text with word-by-word or slam entrance.
 * The workhorse for hooks and payoff lines in the tech niche.
 */
import {
  drawBackground,
  drawText,
  hexToRgba,
  layoutWords,
  roundRect,
  withAlpha,
  wrapText,
  type Ctx,
} from '../engine/draw.js';
import { clamp, easeOutBack, easeOutCubic, easeOutExpo, progress, spring } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function kineticType(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f, dur } = env;
  const text = (beat.onScreen || beat.words.map((x) => x.word).join(' ') || '').trim();
  const motion = beat.visual.motion;
  const isHook = beat.role === 'hook';

  drawBackground(ctx, w, h, p, {
    vignette: env.spec.style.vignette,
    grid: beat.visual.type === 'kinetic-type' && isHook,
  });

  // Accent bar that slides in with the hook — brand signature, cheap to render.
  const barP = easeOutExpo(progress(f, 10));
  withAlpha(ctx, 1, () => {
    ctx.fillStyle = p.accent;
    const barH = Math.round(h * 0.012);
    const barW = Math.round(w * (isHook ? 0.34 : 0.16) * barP);
    roundRect(ctx, env.canvas.sideMargin, h * 0.30, barW, barH, barH / 2);
    ctx.fill();
  });

  const size = fitSize(ctx, text, w - env.canvas.sideMargin * 2, h * (isHook ? 0.42 : 0.34), fonts.display.family, fonts.display.weight);
  const opts = {
    family: fonts.display.family,
    weight: fonts.display.weight,
    size,
    color: p.fg,
    align: 'left' as const,
    maxWidth: w - env.canvas.sideMargin * 2,
    lineHeight: 1.08,
    uppercase: fonts.uppercaseDisplay,
  };

  const label = fonts.uppercaseDisplay ? text.toUpperCase() : text;
  const { boxes, lineHeight } = layoutWords(ctx, label, {
    ...opts,
    x: env.canvas.sideMargin,
    y: h * 0.34,
  });

  ctx.textBaseline = 'top';
  ctx.font = `${fonts.display.weight} ${size}px "${fonts.display.family}"`;

  boxes.forEach((box, i) => {
    let alpha = 1;
    let dy = 0;
    let dx = 0;
    let scale = 1;

    if (isHook) {
      // hook is the thumbnail: never start from invisible
      const pr = progress(f + 3, 6, i * 1.2);
      alpha = 0.78 + 0.22 * easeOutCubic(pr);
      scale = 1 + 0.06 * (1 - easeOutBack(pr, 2));
      dy = (1 - easeOutBack(pr, 1.6)) * -14;
    } else if (motion === 'slam') {
      const pr = progress(f, 8, i * 2);
      alpha = clamp(pr * 1.6);
      scale = 1 + 0.35 * (1 - easeOutBack(pr, 2.2));
      dy = (1 - easeOutBack(pr, 1.8)) * -30;
    } else if (motion === 'reveal-word') {
      const pr = progress(f, 7, i * 3);
      alpha = clamp(pr * 1.4);
      dy = (1 - easeOutCubic(pr)) * 24;
    } else if (motion === 'wipe') {
      const pr = progress(f, dur * 0.35, i * 1.5);
      alpha = clamp(pr * 2);
      dx = (1 - easeOutExpo(pr)) * 120;
    } else if (motion === 'zoom') {
      const pr = progress(f, 14);
      alpha = clamp(pr * 1.4);
      scale = 1 + 0.04 * (1 - easeOutCubic(pr));
    } else if (motion === 'rise') {
      const pr = progress(f, 12, i * 2.5);
      alpha = clamp(pr * 1.4);
      dy = (1 - easeOutCubic(pr)) * 48;
    }

    // exit
    const exitP = progress(f, 8, dur - 8);
    alpha *= 1 - easeOutCubic(exitP) * 0.9;

    const isEmphasis = beat.emphasis.some((e) => box.word.toLowerCase().includes(e.toLowerCase()));
    ctx.save();
    ctx.globalAlpha = clamp(alpha);
    const cx = box.x + box.w / 2 + dx;
    const cy = box.y + lineHeight / 2 + dy;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    if (isEmphasis) {
      ctx.fillStyle = p.accent;
      roundRect(ctx, box.x - 8, box.y - 4, box.w + 16, lineHeight * 0.98, 8);
      ctx.fill();
      ctx.fillStyle = p.bg;
    } else {
      ctx.fillStyle = p.fg;
    }
    ctx.textAlign = 'left';
    ctx.fillText(box.word, box.x, box.y);
    ctx.restore();
  });

  // secondary line: the spoken words in muted type, so silent autoplay still reads the point
  if (false && isHook && beat.words.length > 0) {
    const sub = beat.words.map((x) => x.word).join(' ');
    const subAlpha = easeOutCubic(progress(f, 18, 8));
    withAlpha(ctx, subAlpha * 0.85, () => {
      drawText(ctx, sub, env.canvas.sideMargin, h * 0.34 + lineHeight * boxes.length + 36, {
        family: fonts.body.family,
        weight: fonts.body.weight,
        size: Math.round(w * 0.033),
        color: p.fgMuted,
        maxWidth: w - env.canvas.sideMargin * 2,
        lineHeight: 1.3,
      });
    });
  }

  // thin accent underline sweep
  const sweep = easeOutCubic(progress(f, 20, 6));
  if (sweep > 0) {
    withAlpha(ctx, 0.9, () => {
      ctx.fillStyle = hexToRgba(p.accentAlt, 0.85);
      ctx.fillRect(env.canvas.sideMargin, h * 0.30 - 26, (w - env.canvas.sideMargin * 2) * sweep * 0.5, 4);
    });
  }

  // subtle idle motion so static beats don't feel frozen
  const breathe = 1 + 0.006 * spring(f, 30, 0.12, 3);
  void breathe;
}

/** Largest font size (within bounds) that keeps the text block inside maxW x maxH. */
export function fitSize(
  ctx: Ctx,
  text: string,
  maxW: number,
  maxH: number,
  family: string,
  weight: number,
  start = 260,
  min = 44,
): number {
  let size = start;
  while (size > min) {
    const lines = wrapText(ctx, text, { family, weight, size, color: '#fff', maxWidth: maxW, lineHeight: 1.08 });
    const blockH = lines.length * size * 1.08;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if (blockH <= maxH && widest <= maxW) return size;
    size -= 6;
  }
  return min;
}
