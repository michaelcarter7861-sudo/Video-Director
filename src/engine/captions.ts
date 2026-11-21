/**
 * Karaoke captions. Word-level timing comes from the TTS/aligner, never from the LLM.
 * Two lines max, 4 words per chunk, active word in accent — the format that survives
 * muted autoplay and the platform's bottom UI.
 */
import { hexToRgba, roundRect, type Ctx } from './draw.js';
import { clamp, easeOutCubic } from '../lib/easing.js';
import type { RenderBeat, TimedWord } from './types.js';
import type { FontPair, Palette, CanvasSpec } from '../brand/tokens.js';

const WORDS_PER_CHUNK = 4;
const MAX_CHUNK_CHARS = 26;

export type CaptionChunk = { words: TimedWord[]; startMs: number; endMs: number };

export function chunkWords(words: TimedWord[]): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];
  let current: TimedWord[] = [];
  let chars = 0;
  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      words: current,
      startMs: current[0]!.startMs,
      endMs: current[current.length - 1]!.endMs,
    });
    current = [];
    chars = 0;
  };
  for (const w of words) {
    const tooMany = current.length >= WORDS_PER_CHUNK;
    const tooLong = chars + w.word.length > MAX_CHUNK_CHARS;
    if (tooMany || tooLong) flush();
    current.push(w);
    chars += w.word.length + 1;
  }
  flush();
  return chunks;
}

export function drawCaptions(opts: {
  ctx: Ctx;
  beat: RenderBeat;
  frameInBeat: number;
  fps: number;
  palette: Palette;
  fonts: FontPair;
  canvas: CanvasSpec;
  width: number;
  height: number;
  style: 'karaoke' | 'line';
}): void {
  const { ctx, beat, frameInBeat, fps, palette: p, fonts, canvas, width: w, height: h, style } = opts;
  if (beat.words.length === 0) return;

  const chunks = chunkWords(beat.words);
  const ms = (frameInBeat / fps) * 1000;
  // beat audio starts at frame 0 of the beat
  const index = chunks.findIndex((c) => ms >= c.startMs && ms <= c.endMs + 120);
  const chunk = chunks[index === -1 ? (ms > (chunks.at(-1)?.endMs ?? 0) ? chunks.length - 1 : 0) : index];
  if (!chunk) return;

  const size = Math.round(w * (style === 'karaoke' ? 0.046 : 0.038));
  ctx.font = `800 ${size}px "${fonts.body.family}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const spaceW = ctx.measureText(' ').width;
  const widths = chunk.words.map((cw) => ctx.measureText(cw.word).width);
  const total = widths.reduce((a, b) => a + b, 0) + spaceW * (chunk.words.length - 1);

  const maxWidth = w - canvas.sideMargin * 2;
  const scale = Math.min(1, maxWidth / Math.max(1, total));
  const cx = w / 2;
  const cy = h * (1 - canvas.safeBottom) - size * 0.9;

  // plate so contrast is always >= 4.5:1
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = hexToRgba(p.bg, 0.72);
  const plateW = Math.min(maxWidth, total * scale) + size * 1.1;
  const plateH = size * 1.75;
  roundRect(ctx, cx - plateW / 2, cy - plateH / 2, plateW, plateH, size * 0.32);
  ctx.fill();
  ctx.restore();

  let x = cx - (total * scale) / 2;
  chunk.words.forEach((cw, i) => {
    const active = style === 'karaoke' ? ms >= cw.startMs - 40 && ms <= cw.endMs + 120 : false;
    const pop = active ? 1 + 0.06 * Math.sin(clamp((ms - cw.startMs) / 160) * Math.PI) : 1;
    const wordW = widths[i]! * scale;

    ctx.save();
    ctx.translate(x + wordW / 2, cy);
    ctx.scale(pop * scale, pop * scale);
    ctx.translate(-(x + wordW / 2), -cy);
    ctx.fillStyle = active ? p.accent : p.fg;
    ctx.fillText(cw.word, x + wordW / 2, cy);
    ctx.restore();

    x += wordW + spaceW * scale;
  });
}

/** Word-level highlight used by line-style captions (long form). */
export function lineCaptionAlpha(frameInBeat: number, dur: number): number {
  return easeOutCubic(clamp(frameInBeat / 8)) * easeOutCubic(clamp((dur - frameInBeat) / 8));
}
