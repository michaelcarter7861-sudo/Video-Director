/**
 * Minimal WAV io + silence trimming + synthetic tone generation.
 * Used by: TTS providers (write vo.wav), dummy voice (offline), timeline (measure), QA.
 */
import fs from 'node:fs';

export type WavData = {
  sampleRate: number;
  channels: number;
  samples: Float32Array; // mono mix-down
  durationMs: number;
};

export function readWav(file: string): WavData {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a WAV file`);
  }
  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`WAV missing fmt/data chunk: ${file}`);

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(data.length / (bytesPerSample * fmt.channels));
  const mono = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = (i * fmt.channels + c) * bytesPerSample;
      if (fmt.bitsPerSample === 16) sum += data.readInt16LE(p) / 32768;
      else if (fmt.bitsPerSample === 32) sum += data.readFloatLE(p);
      else if (fmt.bitsPerSample === 8) sum += (data.readUInt8(p) - 128) / 128;
      else throw new Error(`unsupported bit depth ${fmt.bitsPerSample}`);
    }
    mono[i] = sum / fmt.channels;
  }

  return {
    sampleRate: fmt.sampleRate,
    channels: 1,
    samples: mono,
    durationMs: Math.round((frameCount / fmt.sampleRate) * 1000),
  };
}

export function writeWav(file: string, samples: Float32Array, sampleRate = 24000): void {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

/** Trim leading/trailing silence (below -50 dBFS for >80ms) so beats don't drag. */
export function trimSilence(wav: WavData, threshold = 0.003, minSilenceMs = 80): WavData {
  const { samples, sampleRate } = wav;
  const silent = (i: number) => Math.abs(samples[i] ?? 0) < threshold;
  let start = 0;
  while (start < samples.length && silent(start)) start++;
  let end = samples.length - 1;
  while (end > start && silent(end)) end--;
  const pad = Math.round((minSilenceMs / 1000) * sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length - 1, end + pad);
  const slice = samples.subarray(start, end + 1);
  return {
    sampleRate,
    channels: 1,
    samples: slice,
    durationMs: Math.round((slice.length / sampleRate) * 1000),
  };
}

/**
 * Deterministic stand-in voice: a soft syllable-modulated tone per word.
 * This is what `--voice dummy` renders with when no TTS backend is reachable.
 * It gives real audio + exact word timings so the whole pipeline is testable offline.
 */
export function synthVoice(
  words: { word: string; startMs: number; endMs: number }[],
  totalMs: number,
  sampleRate = 24000,
): Float32Array {
  const n = Math.max(1, Math.round((totalMs / 1000) * sampleRate));
  const out = new Float32Array(n);
  words.forEach((w, wi) => {
    const s0 = Math.floor((w.startMs / 1000) * sampleRate);
    const s1 = Math.min(n, Math.floor((w.endMs / 1000) * sampleRate));
    const len = Math.max(1, s1 - s0);
    const base = 138 + (wi % 4) * 9; // stable per word index, no Math.random
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / sampleRate;
      const env = Math.min(1, (i - s0) / (sampleRate * 0.02)) * Math.min(1, (s1 - i) / (sampleRate * 0.03));
      const f0 = base * (1 + 0.06 * Math.sin(2 * Math.PI * 5.5 * t));
      const s =
        0.16 * Math.sin(2 * Math.PI * f0 * t) +
        0.07 * Math.sin(2 * Math.PI * f0 * 2 * t) +
        0.03 * Math.sin(2 * Math.PI * f0 * 3 * t);
      out[i]! += s * env * 0.8;
    }
    void len;
  });
  return out;
}

export function concatWav(parts: { samples: Float32Array; sampleRate: number }[], gapMs = 0): {
  samples: Float32Array;
  sampleRate: number;
} {
  const sampleRate = parts[0]?.sampleRate ?? 24000;
  const gap = Math.round((gapMs / 1000) * sampleRate);
  const total = parts.reduce((acc, p) => acc + p.samples.length + gap, 0);
  const out = new Float32Array(total);
  let cursor = 0;
  for (const p of parts) {
    out.set(p.samples, cursor);
    cursor += p.samples.length + gap;
  }
  return { samples: out, sampleRate };
}
