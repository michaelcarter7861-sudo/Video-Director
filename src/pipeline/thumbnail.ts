/**
 * Thumbnail. Frame 0 is often not the best click candidate, so we score candidate frames
 * on a cheap "readability" proxy — edge density, contrast, and how much of the frame is
 * bright text — and emit PNG + JPG (YouTube wants JPEG, 1280x720 for 16:9).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderStill, pickFrames } from '../engine/render.js';
import { ffmpegPath } from '../lib/ffmpeg.js';
import type { RenderInput } from '../engine/types.js';

const run = promisify(execFile);

export type Thumb = { frame: number; score: number; png: string; jpg: string };

export async function bestThumbnail(input: RenderInput, outDir: string): Promise<Thumb> {
  fs.mkdirSync(outDir, { recursive: true });
  const candidates = pickFrames(input.totalFrames, 8);
  let best: { frame: number; score: number; file: string } | null = null;

  for (const frame of candidates) {
    const file = path.join(outDir, `cand-${frame}.png`);
    renderStill(input, frame, file);
    const score = await scoreFrame(file);
    if (!best || score > best.score) best = { frame, score, file };
  }
  // clean up losers
  for (const frame of candidates) {
    if (frame !== best!.frame) fs.rmSync(path.join(outDir, `cand-${frame}.png`), { force: true });
  }

  const png = path.join(outDir, 'thumb.png');
  const jpg = path.join(outDir, 'thumb.jpg');
  fs.copyFileSync(best!.file, png);
  fs.rmSync(best!.file, { force: true });
  // platform-safe JPEG (1280px wide keeps YouTube/Shorts happy)
  await run(ffmpegPath(), ['-y', '-i', png, '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '2', jpg]);
  return { frame: best!.frame, score: +best!.score.toFixed(3), png, jpg };
}

/** Higher is better: busy-but-not-noisy frames with strong contrast win. */
export async function scoreFrame(file: string): Promise<number> {
  const img = await loadImage(file);
  const w = 160;
  const h = Math.max(1, Math.round((img.height / img.width) * w));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = (0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!) / 255;
  }
  const mean = grey.reduce((a, b) => a + b, 0) / grey.length;
  const variance = grey.reduce((a, b) => a + (b - mean) ** 2, 0) / grey.length;

  // edge energy (Sobel-lite) rewards frames with structure, not flat backgrounds
  let edges = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = grey[i + 1]! - grey[i - 1]!;
      const gy = grey[i + w]! - grey[i - w]!;
      edges += Math.hypot(gx, gy);
    }
  }
  edges /= w * h;

  // bright-text coverage: pixels far from the mean in the upper two thirds
  let bright = 0;
  for (let y = 0; y < h * 0.66; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(grey[y * w + x]! - mean) > 0.45) bright++;
    }
  }
  bright /= w * h * 0.66;

  const contrast = Math.min(1, Math.sqrt(variance) * 3.2);
  const edgeScore = Math.min(1, edges * 26);
  return contrast * 0.42 + edgeScore * 0.33 + Math.min(1, bright * 4) * 0.25;
}
