/**
 * Audio assembly: voice + optional music bed with sidechain ducking, then loudness.
 * Music is optional — with no music file the voice track is used as-is.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { ffmpegPath } from '../lib/ffmpeg.js';

const run = promisify(execFile);

export async function mixMusic(opts: {
  voiceWav: string;
  musicFile: string;
  outWav: string;
  duckDb?: number;
  musicGainDb?: number;
}): Promise<string> {
  const { voiceWav, musicFile, outWav, duckDb = -14, musicGainDb = -18 } = opts;
  if (!fs.existsSync(musicFile)) throw new Error(`music file not found: ${musicFile}`);
  // music is looped to the voice length, then ducked against the voice with a sidechain compressor
  await run(ffmpegPath(), [
    '-y',
    '-i', voiceWav,
    '-stream_loop', '-1', '-i', musicFile,
    '-filter_complex',
    `[1:a]aformat=sample_fmts=fltp:channel_layouts=mono,volume=${musicGainDb}dB,volume=${duckDb}dB[m];` +
      `[0:a]aformat=sample_fmts=fltp:channel_layouts=mono,asplit=2[voice][side];` +
      `[m][side]sidechaincompress=threshold=0.06:ratio=8:attack=8:release=350[duck];` +
      `[voice][duck]amix=inputs=2:duration=first:weights=1 0.9,alimiter=limit=0.95[out]`,
    '-map', '[out]',
    '-ar', '24000', '-ac', '1',
    outWav,
  ], { maxBuffer: 8 * 1024 * 1024 });
  return outWav;
}

/** Generate a deterministic, royalty-free music bed (no assets, no license). */
export async function synthMusicBed(opts: {
  outFile: string;
  seconds: number;
  bpm?: number;
  mood?: 'tense-minimal' | 'calm' | 'drive';
}): Promise<string> {
  const { outFile, seconds, bpm = 96, mood = 'tense-minimal' } = opts;
  const beat = 60 / bpm;
  const freqs =
    mood === 'calm' ? [110, 164.81, 220, 329.63] : mood === 'drive' ? [82.41, 123.47, 164.81, 246.94] : [73.42, 110, 146.83, 220];
  const parts = freqs.map((f, i) => {
    const vol = mood === 'drive' ? 0.16 : 0.12;
    const mod = 0.4 + i * 0.15;
    return `${vol}*sin(2*PI*${f}*t)*(0.6+0.4*sin(2*PI*${(1 / (beat * 4)).toFixed(4)}*t))`;
  });
  // a soft pulse on the beat keeps edits feeling intentional
  // NOTE: aevalsrc treats ',' as an argument separator, so no pow(a,b) — expand to multiplication.
  const s1 = `abs(sin(2*PI*${(1 / beat).toFixed(4)}*t))*sin(2*PI*${(1 / beat).toFixed(4)}*t)`;
  const pulseExpr = `0.10*sin(2*PI*55*t)*${s1}*${s1}*${s1}`;
  const expr = [...parts, pulseExpr].join('+');
  await run(ffmpegPath(), [
    '-y', '-f', 'lavfi',
    '-i', `aevalsrc=${expr}:s=24000:d=${seconds.toFixed(3)}`,
    '-af', 'lowpass=f=2400,highpass=f=45,alimiter=limit=0.7',
    '-ac', '1', '-ar', '24000',
    outFile,
  ], { maxBuffer: 8 * 1024 * 1024 });
  return outFile;
}
