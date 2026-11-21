/**
 * Canvas drawing helpers. Pure functions of (ctx, state) — no globals, no time.
 */
import type { SKRSContext2D } from '@napi-rs/canvas';
import { font } from '../lib/fonts.js';
import { clamp, easeOutCubic, lerp } from '../lib/easing.js';
import type { Palette } from '../brand/tokens.js';

export type Ctx = SKRSContext2D;

export function hexToRgba(hex: string, alpha = 1): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha)})`;
}

export type TextOpts = {
  family: string;
  weight: number;
  size: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
};

/** Split text into lines that fit maxWidth. */
export function wrapText(ctx: Ctx, text: string, opts: TextOpts): string[] {
  ctx.font = font(opts.family, opts.weight, opts.size);
  const max = opts.maxWidth ?? Infinity;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= max || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function measureLines(ctx: Ctx, lines: string[], opts: TextOpts): number {
  const lh = opts.lineHeight ?? 1.15;
  return lines.length * opts.size * lh;
}

/** Draw wrapped text block. Returns the height used. */
export function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: TextOpts,
): number {
  const lines = wrapText(ctx, opts.uppercase ? text.toUpperCase() : text, opts);
  const lh = (opts.lineHeight ?? 1.15) * opts.size;
  ctx.font = font(opts.family, opts.weight, opts.size);
  ctx.fillStyle = opts.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = opts.align ?? 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lh);
  });
  return lines.length * lh;
}

/** Draw one word, letter-spaced (canvas has no letterSpacing in this build). */
export function drawTracked(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0) - tracking;
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y);
    cursor += widths[i]!;
  });
  ctx.textAlign = prevAlign;
  return total;
}

/** Word-level layout: useful for karaoke and word-by-word reveals. */
export type WordBox = { word: string; x: number; y: number; w: number; line: number };

export function layoutWords(
  ctx: Ctx,
  text: string,
  opts: TextOpts & { x: number; y: number; spaceWidth?: number },
): { boxes: WordBox[]; lines: string[]; lineHeight: number } {
  const lines = wrapText(ctx, text, opts);
  const lineHeight = (opts.lineHeight ?? 1.15) * opts.size;
  ctx.font = font(opts.family, opts.weight, opts.size);
  const space = opts.spaceWidth ?? ctx.measureText(' ').width;
  const boxes: WordBox[] = [];
  lines.forEach((line, li) => {
    const words = line.split(' ');
    const widths = words.map((w) => ctx.measureText(w).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    let cursor =
      opts.align === 'center' ? opts.x - total / 2 : opts.align === 'right' ? opts.x - total : opts.x;
    words.forEach((w, wi) => {
      boxes.push({ word: w, x: cursor, y: opts.y + li * lineHeight, w: widths[wi]!, line: li });
      cursor += widths[wi]! + space;
    });
  });
  return { boxes, lines, lineHeight };
}

/** Rounded rect path. */
export function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Background: flat bg + subtle grid + vignette. frame-stable (no flicker). */
export function drawBackground(
  ctx: Ctx,
  w: number,
  h: number,
  palette: Palette,
  opts: { grid?: boolean; vignette?: number; altTint?: number } = {},
): void {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);

  if (opts.altTint && opts.altTint > 0) {
    ctx.fillStyle = hexToRgba(palette.bgAlt, opts.altTint);
    ctx.fillRect(0, 0, w, h);
  }

  if (opts.grid) {
    ctx.strokeStyle = hexToRgba(palette.grid ?? palette.fgMuted, 0.16);
    ctx.lineWidth = 1.5;
    const step = Math.round(w / 12);
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  const vig = opts.vignette ?? 0;
  if (vig > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, hexToRgba('#000000', vig));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Deterministic film grain: same frame -> same noise. */
export function drawGrain(ctx: Ctx, w: number, h: number, amount: number, frame: number): void {
  if (amount <= 0) return;
  const count = Math.round((w * h) / 9000);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = pseudo(i * 3 + frame * 7919) * w;
    const y = pseudo(i * 7 + frame * 104729) * h;
    const a = amount * pseudo(i * 11 + frame * 31);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function pseudo(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Slide + fade entrance for a block of content. */
export type Entrance = { dy: number; alpha: number; scale: number };

export function entrance(p: number, distance = 60, from: 'below' | 'above' | 'left' | 'none' = 'below'): Entrance {
  const e = easeOutCubic(clamp(p));
  const alpha = clamp(p * 2.2);
  if (from === 'none') return { dy: 0, alpha, scale: 1 };
  return {
    dy: from === 'above' ? lerp(-distance, 0, e) : lerp(distance, 0, e),
    alpha,
    scale: lerp(0.96, 1, e),
  };
}

/** Vector check mark — the OFL latin subsets have no ✓ glyph, so draw it. */
export function drawCheck(ctx: Ctx, x: number, y: number, size: number, color: string, lineWidth = 5): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.5);
  ctx.lineTo(x + size * 0.38, y + size * 0.95);
  ctx.lineTo(x + size, y);
  ctx.stroke();
  ctx.restore();
}

export function withAlpha(ctx: Ctx, alpha: number, draw: () => void): void {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  draw();
  ctx.restore();
}

/** Solid bar behind text so contrast never fails (QA gate: 4.5:1 vs its plate). */
export function textPlate(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  roundRect(ctx, x - 18, y - 14, w + 36, h + 28, 14);
  ctx.fill();
}
