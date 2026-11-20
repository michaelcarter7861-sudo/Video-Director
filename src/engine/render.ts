/**
 * The compositor. Given a RenderInput, draw frame N to a canvas and stream PNG frames
 * into ffmpeg. No browser, no DOM, no Remotion. Fully deterministic.
 */
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RenderInput, RenderBeat } from './types.js';
import { getScene } from '../scenes/index.js';
import { drawCaptions } from './captions.js';
import { drawGrain, hexToRgba, roundRect, type Ctx } from './draw.js';
import { clamp, easeInOutCubic } from '../lib/easing.js';
import { loadFonts } from '../lib/fonts.js';
import { ffmpegPath } from '../lib/ffmpeg.js';

export type RenderOptions = {
  outFile: string;
  /** render only these frames (draft previews) */
  frames?: number[];
  onProgress?: (frame: number, total: number) => void;
  quality?: 'draft' | 'final';
};

export function drawFrame(ctx: Ctx, input: RenderInput, frame: number): void {
  const { width: w, height: h, palette: p, fonts, fps } = input;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  const beat = findBeat(input, frame);
  if (beat) {
    const localF = frame - beat.fromFrame;
    const scene = getScene(beat.visual.type);
    ctx.save();
    // Idle motion layer: a 0-3% push-in + sub-pixel drift across the beat.
    // Guarantees no frozen frames, and motion-graphics holds never feel dead.
    const t = localF / Math.max(1, beat.durationInFrames - 1);
    const zoom = 1 + 0.028 * t;
    const dx = Math.sin(t * Math.PI * 0.5) * 6;
    const dy = -Math.cos(t * Math.PI * 0.5) * 4;
    ctx.translate(w / 2 + dx, h / 2 + dy);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);
    try {
      scene({
        ctx,
        width: w,
        height: h,
        palette: p,
        fonts,
        canvas: input.canvas,
        fps,
        spec: input as never, // only style/brand fields are read by scenes
        beat,
        f: localF,
        dur: beat.durationInFrames,
        globalFrame: frame,
      });
    } catch (err) {
      ctx.restore();
      throw new Error(`scene "${beat.visual.type}" failed on beat ${beat.id} frame ${localF}: ${(err as Error).message}`);
    }
    ctx.restore();

    // transition veil at beat boundaries (deterministic, 6 frames)
    const trans = transitionAlpha(localF, beat.durationInFrames);
    if (trans > 0) {
      ctx.fillStyle = hexToRgba(p.bg, trans);
      ctx.fillRect(0, 0, w, h);
    }

    if (input.style.captionStyle !== 'none') {
      drawCaptions({
        ctx,
        beat,
        frameInBeat: localF,
        fps,
        palette: p,
        fonts,
        canvas: input.canvas,
        width: w,
        height: h,
        style: input.style.captionStyle === 'karaoke' ? 'karaoke' : 'line',
      });
    }
  }

  if (input.style.progressBar) drawProgress(ctx, input, frame);
  drawGrain(ctx, w, h, input.style.grain, frame);
  drawSafeAreaDebug(ctx, input);
  ctx.restore();
}

function findBeat(input: RenderInput, frame: number): RenderBeat | undefined {
  return input.beats.find((b) => frame >= b.fromFrame && frame < b.fromFrame + b.durationInFrames);
}

function transitionAlpha(localF: number, dur: number): number {
  const fadeFrames = 5;
  const inA = 1 - easeInOutCubic(clamp(localF / fadeFrames));
  const outA = 1 - easeInOutCubic(clamp((dur - 1 - localF) / fadeFrames));
  // only fade at the very start/end of a beat, and only slightly (motion-graphics hard cuts stay crisp)
  return Math.min(inA, outA) * 0.85;
}

function drawProgress(ctx: Ctx, input: RenderInput, frame: number): void {
  const { width: w, height: h, palette: p } = input;
  const y = h - Math.round(h * 0.035);
  const pad = input.canvas.sideMargin;
  const barW = w - pad * 2;
  const t = clamp(frame / Math.max(1, input.totalFrames - 1));
  ctx.fillStyle = hexToRgba(p.fgMuted, 0.28);
  roundRect(ctx, pad, y, barW, 6, 3);
  ctx.fill();
  ctx.fillStyle = p.accent;
  roundRect(ctx, pad, y, Math.max(6, barW * t), 6, 3);
  ctx.fill();
}

let debugSafeArea = process.env.SAFE_AREA_DEBUG === '1';
export function setSafeAreaDebug(on: boolean): void {
  debugSafeArea = on;
}

function drawSafeAreaDebug(ctx: Ctx, input: RenderInput): void {
  if (!debugSafeArea) return;
  const { width: w, height: h, canvas } = input;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,0,0.75)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(canvas.sideMargin, h * canvas.safeTop, w - canvas.sideMargin * 2, h * (1 - canvas.safeTop - canvas.safeBottom));
  ctx.restore();
}

/* ------------------------------------------------------------------ output */

export async function renderVideo(input: RenderInput, opts: RenderOptions): Promise<{ outFile: string; frames: number }> {
  loadFonts();
  const canvas = createCanvas(input.width, input.height);
  const ctx = canvas.getContext('2d') as unknown as Ctx;
  fs.mkdirSync(path.dirname(opts.outFile), { recursive: true });

  const frames = opts.frames ?? Array.from({ length: input.totalFrames }, (_, i) => i);
  const crf = opts.quality === 'draft' ? 30 : 19;
  const preset = opts.quality === 'draft' ? 'veryfast' : 'medium';

  const args = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(input.fps),
    '-i', '-',
    ...(input.audioPath ? ['-i', input.audioPath] : []),
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(input.fps),
    ...(input.audioPath ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-movflags', '+faststart',
    opts.outFile,
  ];

  const ff = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ff.stderr.on('data', (d) => {
    stderr += String(d);
    if (stderr.length > 20000) stderr = stderr.slice(-20000);
  });

  const finished = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-3000)}`));
    });
  });

  for (const [i, frame] of frames.entries()) {
    drawFrame(ctx, input, frame);
    const png = canvas.toBuffer('image/png');
    if (!ff.stdin.write(png)) {
      await new Promise<void>((r) => ff.stdin.once('drain', () => r()));
    }
    opts.onProgress?.(i + 1, frames.length);
  }
  ff.stdin.end();
  await finished;
  return { outFile: opts.outFile, frames: frames.length };
}

/** Render a single frame to PNG — the cheapest feedback loop (inspection, thumbnails, QA). */
export function renderStill(input: RenderInput, frame: number, outFile: string): string {
  loadFonts();
  const canvas = createCanvas(input.width, input.height);
  const ctx = canvas.getContext('2d') as unknown as Ctx;
  drawFrame(ctx, input, frame);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, canvas.toBuffer('image/png'));
  return outFile;
}

/** Contact sheet of N stills — one image the agent/human can review in a glance. */
export function renderContactSheet(input: RenderInput, outFile: string, columns = 3): string {
  loadFonts();
  const frames = pickFrames(input.totalFrames, columns * columns);
  const thumbW = Math.round(input.width / 3.2);
  const thumbH = Math.round(input.height / 3.2);
  const gap = 12;
  const rows = Math.ceil(frames.length / columns);
  const sheet = createCanvas(columns * thumbW + gap * (columns + 1), rows * thumbH + gap * (rows + 1));
  const sctx = sheet.getContext('2d') as unknown as Ctx;
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, sheet.width, sheet.height);

  const frameCanvas = createCanvas(input.width, input.height);
  const fctx = frameCanvas.getContext('2d') as unknown as Ctx;

  frames.forEach((frame, i) => {
    drawFrame(fctx, input, frame);
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = gap + col * (thumbW + gap);
    const y = gap + row * (thumbH + gap);
    sctx.drawImage(frameCanvas, x, y, thumbW, thumbH);
    sctx.fillStyle = 'rgba(0,0,0,0.6)';
    sctx.fillRect(x, y, 96, 28);
    sctx.fillStyle = '#fff';
    sctx.font = '600 18px sans-serif';
    sctx.textBaseline = 'top';
    sctx.fillText(`f${frame}`, x + 10, y + 6);
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, sheet.toBuffer('image/png'));
  return outFile;
}

export function pickFrames(total: number, count: number): number[] {
  const n = Math.max(1, Math.min(count, total));
  return Array.from({ length: n }, (_, i) => Math.min(total - 1, Math.round((i * (total - 1)) / Math.max(1, n - 1))));
}
