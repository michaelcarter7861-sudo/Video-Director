/**
 * TTS providers. All of them return audio + word timings so the timeline is always measured,
 * never guessed by the LLM.
 *
 *   kokoro  : local Kokoro-FastAPI (docker) — free, best quality, per-word timestamps
 *   freeapi : FreeLLMAPI /v1/audio/speech — fallback, timings estimated
 *   macos   : macOS `say` — offline fallback
 *   dummy   : deterministic tone voice — always works, used by tests/CI
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readWav, writeWav, synthVoice, trimSilence } from '../lib/wav.js';

export type TtsWord = { word: string; startMs: number; endMs: number };
export type TtsResult = {
  provider: string;
  wavPath: string;
  words: TtsWord[];
  durationMs: number;
  exact: boolean; // true when timings came from the TTS engine itself
};

export type TtsOptions = {
  text: string;
  outWav: string;
  voice: string;
  speed: number;
  lang: string;
};

const KOKORO_URL = process.env.KOKORO_URL ?? 'http://127.0.0.1:8880';
const FREEAPI_URL = process.env.FREELLMAPI_URL ?? 'http://127.0.0.1:3001';
const FREEAPI_KEY = process.env.FREELLMAPI_API_KEY ?? '';

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/* ------------------------------------------------------------------ kokoro */

type KokoroCaption = {
  audio: string;
  timestamps?: { word?: string; text?: string; start: number; end: number }[];
};

async function kokoro(opts: TtsOptions): Promise<TtsResult> {
  const res = await withTimeout(
    fetch(`${KOKORO_URL}/dev/captioned_speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: opts.text,
        voice: opts.voice,
        speed: opts.speed,
        response_format: 'wav',
        stream: false,
        lang_code: opts.lang,
      }),
    }),
    90_000,
    'kokoro',
  );
  if (!res.ok) throw new Error(`kokoro ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as KokoroCaption;
  const buf = Buffer.from(json.audio, 'base64');
  fs.mkdirSync(path.dirname(opts.outWav), { recursive: true });
  fs.writeFileSync(opts.outWav, buf);

  const words: TtsWord[] = (json.timestamps ?? []).map((t) => ({
    word: (t.word ?? t.text ?? '').trim(),
    startMs: Math.round(t.start * 1000),
    endMs: Math.round(t.end * 1000),
  })).filter((w) => w.word.length > 0);

  const wav = readWav(opts.outWav);
  return {
    provider: 'kokoro',
    wavPath: opts.outWav,
    words,
    durationMs: wav.durationMs,
    exact: words.length > 0,
  };
}

/* --------------------------------------------------------------- freeapi */

async function freeapi(opts: TtsOptions): Promise<TtsResult> {
  const res = await withTimeout(
    fetch(`${FREEAPI_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(FREEAPI_KEY ? { Authorization: `Bearer ${FREEAPI_KEY}` } : {}),
      },
      body: JSON.stringify({ model: 'auto', input: opts.text, voice: opts.voice, response_format: 'wav' }),
    }),
    120_000,
    'freellmapi-tts',
  );
  if (!res.ok) throw new Error(`freellmapi ${res.status}: ${await res.text()}`);
  fs.mkdirSync(path.dirname(opts.outWav), { recursive: true });
  fs.writeFileSync(opts.outWav, Buffer.from(await res.arrayBuffer()));
  const wav = readWav(opts.outWav);
  return {
    provider: 'freeapi',
    wavPath: opts.outWav,
    words: estimateWordTimings(opts.text, wav.durationMs),
    durationMs: wav.durationMs,
    exact: false,
  };
}

/* ---------------------------------------------------------------- macos */

function macos(opts: TtsOptions): TtsResult {
  const aiff = opts.outWav.replace(/\.wav$/, '.aiff');
  execFileSync('say', ['-v', opts.voice, '-r', String(Math.round(190 * opts.speed)), '-o', aiff, opts.text]);
  execFileSync('ffmpeg', ['-y', '-i', aiff, '-ar', '24000', '-ac', '1', opts.outWav]);
  const wav = readWav(opts.outWav);
  return {
    provider: 'macos',
    wavPath: opts.outWav,
    words: estimateWordTimings(opts.text, wav.durationMs),
    durationMs: wav.durationMs,
    exact: false,
  };
}

/* ---------------------------------------------------------------- dummy */

export function dummy(opts: TtsOptions): TtsResult {
  const words = estimateWordTimings(opts.text, estimateMs(opts.text, opts.speed));
  const samples = synthVoice(words, estimateMs(opts.text, opts.speed) + 120);
  const trimmed = trimSilence({ sampleRate: 24000, channels: 1, samples, durationMs: 0 }, 0.002, 30);
  fs.mkdirSync(path.dirname(opts.outWav), { recursive: true });
  writeWav(opts.outWav, trimmed.samples, 24000);
  return {
    provider: 'dummy',
    wavPath: opts.outWav,
    words,
    durationMs: trimmed.durationMs,
    // dummy timings ARE exact for the audio it generated
    exact: true,
  };
}

/* ------------------------------------------------------------- helpers */

export function estimateMs(text: string, speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 2.6 / Math.max(0.7, speed)) * 1000);
}

/** Distribute words across a known audio duration, weighted by length + punctuation pauses. */
export function estimateWordTimings(text: string, durationMs: number): TtsWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const weights = tokens.map((t) => {
    let w = Math.max(2, t.replace(/[^\w']/g, '').length);
    if (/[,;:]$/.test(t)) w += 2;
    if (/[.!?]$/.test(t)) w += 4;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return tokens.map((word, i) => {
    const dur = (weights[i]! / total) * durationMs;
    const startMs = Math.round(cursor);
    cursor += dur;
    return { word, startMs, endMs: Math.round(cursor) };
  });
}

export type PreferProvider = 'auto' | 'kokoro' | 'freeapi' | 'macos' | 'dummy';

export async function synthesize(opts: TtsOptions, prefer: PreferProvider = 'auto'): Promise<TtsResult> {
  const order: PreferProvider[] =
    prefer === 'auto' ? ['kokoro', 'freeapi', 'macos', 'dummy'] : [prefer, 'dummy'];
  const errors: string[] = [];
  for (const provider of order) {
    try {
      if (provider === 'dummy') return dummy(opts);
      if (provider === 'kokoro') return await kokoro(opts);
      if (provider === 'freeapi') return await freeapi(opts);
      if (provider === 'macos') return macos(opts);
    } catch (err) {
      errors.push(`${provider}: ${(err as Error).message}`);
    }
  }
  throw new Error(`all TTS providers failed:\n  ${errors.join('\n  ')}`);
}
