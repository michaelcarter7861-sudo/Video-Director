/**
 * Binary resolution. Uses npm-shipped static binaries so the project works on machines
 * without a system ffmpeg (and in CI). Override with FFMPEG_PATH / FFPROBE_PATH.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

let cachedFfmpeg: string | null = null;
let cachedFfprobe: string | null = null;

export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (cachedFfmpeg) return cachedFfmpeg;
  const installer = require('@ffmpeg-installer/ffmpeg') as { path: string };
  if (!fs.existsSync(installer.path)) throw new Error(`ffmpeg binary not found at ${installer.path}`);
  cachedFfmpeg = installer.path;
  return cachedFfmpeg;
}

export function ffprobePath(): string {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  if (cachedFfprobe) return cachedFfprobe;
  const probe = require('ffprobe-static') as { path: string };
  if (!fs.existsSync(probe.path)) throw new Error(`ffprobe binary not found at ${probe.path}`);
  cachedFfprobe = probe.path;
  return cachedFfprobe;
}
