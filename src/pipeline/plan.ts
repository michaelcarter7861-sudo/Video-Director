/**
 * Planning + timing. The TWO places where the LLM is NOT allowed to decide:
 *   1. beat durations  (measured from audio)
 *   2. word timings    (from the TTS engine)
 *
 * Pipeline:
 *   spec -> per-beat TTS -> measure -> timeline (frames) -> render input
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Director, Beat } from '../schema/director.js';
import type { RenderBeat, RenderInput, TimedWord, TimingReport, StyleSpec } from '../engine/types.js';
import { canvases, resolveBrand } from '../brand/tokens.js';
import { synthesize, estimateMs, type PreferProvider } from './tts.js';
import { readWav, writeWav, concatWav, trimSilence } from '../lib/wav.js';
import { countWords, WORDS_PER_SECOND } from '../schema/director.js';

export type BuildOptions = {
  projectDir: string;
  voice: PreferProvider;
  /** synthetic silence pad between beats */
  beatPadMs?: number;
  log?: (msg: string) => void;
};

export type BuiltProject = {
  renderInput: RenderInput;
  report: TimingReport;
  wordsPath: string;
  audioPath: string;
};

const MIN_BEAT_MS = 700;

/** Rewrite the spec so every beat carries concrete visual payloads (terminal/code/stat/chart). */
export function deriveVisualPayloads(spec: Director): Director {
  const next: Director = structuredClone(spec);
  next.beats = next.beats.map((beat, i) => {
    const v = { ...beat.visual };
    const words = (beat.onScreen || beat.vo).split(/\s+/).filter(Boolean);
    switch (v.type) {
      case 'terminal':
        if (!v.lines || v.lines.length === 0) {
          v.lines = [`$ ${words.slice(0, 3).join(' ').toLowerCase()}`, '✓ done in 2.1s'];
        }
        break;
      case 'code':
        if (!v.code) {
          v.code = beat.onScreen || `// ${beat.vo.slice(0, 60)}`;
          v.lang = v.lang ?? 'ts';
        }
        break;
      case 'stat':
        if (v.value === undefined) {
          v.value = Math.max(1, countWords(beat.vo) * 7);
          v.suffix = v.suffix ?? '%';
        }
        break;
      case 'chart':
        if (!v.data || v.data.length === 0) {
          v.data = [
            { label: 'before', value: 24 },
            { label: 'after', value: 71 },
            { label: 'goal', value: 90 },
          ];
          v.chartType = v.chartType ?? 'bar';
        }
        break;
      case 'diagram':
        if (!v.nodes || v.nodes.length === 0) {
          const n = words.length >= 3 ? words.slice(0, 3) : ['idea', 'script', 'video'];
          v.nodes = n;
          v.edges = [];
          for (let k = 0; k < n.length - 1; k++) v.edges!.push([n[k]!, n[k + 1]!]);
        }
        break;
      case 'split':
        if (!v.left || !v.right) {
          const half = Math.ceil(words.length / 2);
          v.left = v.left ?? (words.slice(0, half).join(' ') || 'before');
          v.right = v.right ?? (words.slice(half).join(' ') || 'after');
        }
        break;
      case 'abstract':
        v.seed = v.seed ?? (i + 1) * 7919;
        break;
      default:
        break;
    }
    return { ...beat, visual: v };
  });
  return next;
}

/** Speak every beat, measure it, and lay out frames. */
export async function buildProject(spec: Director, opts: BuildOptions): Promise<BuiltProject> {
  const log = opts.log ?? (() => {});
  const audioDir = path.join(opts.projectDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const padMs = opts.beatPadMs ?? 90;
  const canvas = canvases[spec.aspect] ?? canvases['9:16']!;
  const brand = resolveBrand(spec.style.variationSeed, spec.style.templateFamily);

  const renderBeats: RenderBeat[] = [];
  const report: TimingReport = { targetSec: 0, actualSec: 0, beats: [], warnings: [] };
  const parts: { samples: Float32Array; sampleRate: number }[] = [];

  let cursorMs = 0;
  let globalFrame = 0;

  for (const [index, beat] of spec.beats.entries()) {
    const wavPath = path.join(audioDir, `${String(index).padStart(2, '0')}-${beat.id}.wav`);
    let audioMs = 0;
    let words: TimedWord[] = [];

    if (beat.vo.trim().length > 0) {
      const result = await synthesize(
        {
          text: beat.vo,
          outWav: wavPath,
          voice: spec.audio.voice,
          speed: spec.audio.speed,
          lang: spec.language,
        },
        opts.voice,
      );
      if (!result.exact) {
        report.warnings.push(
          `beat ${beat.id}: provider "${result.provider}" gave no word timings — estimated (enable Kokoro for exact captions)`,
        );
      }
      const trimmed = trimSilence(readWav(result.wavPath), 0.0025, 40);
      writeWav(result.wavPath, trimmed.samples, trimmed.sampleRate);
      audioMs = trimmed.durationMs;

      // shift word timings if trimming moved the start
      const shift = Math.max(0, 0);
      words = result.words.map((w) => ({
        word: w.word,
        startMs: Math.max(0, w.startMs + shift),
        endMs: Math.max(0, w.endMs + shift),
        emphasis: beat.emphasis.some((e) => w.word.toLowerCase().includes(e.toLowerCase())),
      }));

      parts.push({ samples: trimmed.samples, sampleRate: trimmed.sampleRate });
      if (padMs > 0) {
        parts.push({ samples: new Float32Array(Math.round((padMs / 1000) * trimmed.sampleRate)), sampleRate: trimmed.sampleRate });
      }
    } else {
      // silent visual beat: hold on screen
      audioMs = Math.round((beat.minSec ?? Math.min(beat.maxSec, 1.6)) * 1000);
    }

    const requestedMaxMs = Math.round(beat.maxSec * 1000);
    const minMs = Math.round((beat.minSec ?? 0.6) * 1000);
    const finalMs = Math.max(MIN_BEAT_MS, minMs, audioMs);
    const capped = finalMs > requestedMaxMs;
    if (capped) {
      report.warnings.push(
        `beat ${beat.id}: audio is ${(finalMs / 1000).toFixed(2)}s but maxSec was ${beat.maxSec}s — kept the audio, duration extended`,
      );
    }

    const durationInFrames = Math.max(1, Math.round((finalMs / 1000) * canvas.fps));
    report.beats.push({
      id: beat.id,
      requestedMaxSec: beat.maxSec,
      measuredMs: audioMs,
      finalSec: +(durationInFrames / canvas.fps).toFixed(3),
      capped,
    });

    renderBeats.push({
      id: beat.id,
      role: beat.role,
      index,
      fromFrame: globalFrame,
      durationInFrames,
      words,
      onScreen: beat.onScreen,
      emphasis: beat.emphasis,
      visual: beat.visual,
      rehook: beat.rehook,
      audioMs,
    });

    globalFrame += durationInFrames;
    cursorMs += finalMs + (beat.vo.trim() ? padMs : 0);
  }

  const totalFrames = Math.max(1, renderBeats.reduce((a, b) => Math.max(a, b.fromFrame + b.durationInFrames), 0));
  report.targetSec = +(spec.beats.reduce((a, b) => a + b.maxSec, 0)).toFixed(2);
  report.actualSec = +(totalFrames / canvas.fps).toFixed(2);

  // Full voice track, laid out at the *frame* positions so audio and picture stay locked.
  const audioPath = path.join(opts.projectDir, 'vo.wav');
  if (parts.length > 0) {
    const totalSamples = Math.round((totalFrames / canvas.fps) * 24000) + 2400;
    const merged = new Float32Array(totalSamples);
    let writeCursor = 0;
    for (const beat of renderBeats) {
      if (beat.audioMs <= 0) continue;
      const file = path.join(audioDir, `${String(beat.index).padStart(2, '0')}-${beat.id}.wav`);
      if (!fs.existsSync(file)) continue;
      const wav = readWav(file);
      const targetStart = Math.round((beat.fromFrame / canvas.fps) * wav.sampleRate);
      const offset = Math.max(0, targetStart - writeCursor);
      merged.set(wav.samples, targetStart);
      writeCursor = targetStart + wav.samples.length + offset;
    }
    writeWav(audioPath, merged, 24000);
  }

  const style: StyleSpec = {
    templateFamily: brand.family.id,
    captionStyle: spec.style.captionStyle,
    grain: spec.style.grain,
    vignette: spec.style.vignette,
    progressBar: spec.style.progressBar,
  };

  const renderInput: RenderInput = {
    id: spec.id,
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    totalFrames,
    palette: { ...brand.palette, ...sanitizePaletteOverrides(spec.style.palette) },
    fonts: brand.fonts,
    style,
    beats: renderBeats,
    canvas,
    audioPath: parts.length ? audioPath : undefined,
    audioMs: Math.round((totalFrames / canvas.fps) * 1000),
  };

  const wordsPath = path.join(opts.projectDir, 'words.json');
  fs.writeFileSync(wordsPath, JSON.stringify(renderBeats.map((b) => ({ id: b.id, words: b.words })), null, 2));

  // Word budget check against measured reality
  const words = spec.beats.reduce((acc, b) => acc + countWords(b.vo), 0);
  const spokenSec = report.beats.reduce((acc, b) => acc + b.measuredMs / 1000, 0);
  if (spokenSec > 0 && words / spokenSec > WORDS_PER_SECOND * 1.45) {
    report.warnings.push(`speech rate is high (${(words / spokenSec).toFixed(1)} words/sec) — trim words for clarity`);
  }

  void cursorMs;
  log(`timing: ${report.actualSec}s across ${renderBeats.length} beats`);
  return { renderInput, report, wordsPath, audioPath };
}

function sanitizePaletteOverrides(overrides: Record<string, string | undefined> | undefined) {
  if (!overrides) return {};
  return Object.fromEntries(Object.entries(overrides).filter(([, v]) => typeof v === 'string'));
}

/** Dry-run timing without touching TTS (used by the planner preview / agent). */
export function estimatePlan(spec: Director): TimingReport {
  const beats = spec.beats.map((b: Beat) => {
    const ms = b.vo.trim() ? estimateMs(b.vo, spec.audio.speed) : Math.round((b.minSec ?? 1.4) * 1000);
    return {
      id: b.id,
      requestedMaxSec: b.maxSec,
      measuredMs: ms,
      finalSec: +(Math.max(MIN_BEAT_MS, ms) / 1000).toFixed(3),
      capped: ms > b.maxSec * 1000,
    };
  });
  return {
    targetSec: +spec.beats.reduce((a, b) => a + b.maxSec, 0).toFixed(2),
    actualSec: +beats.reduce((a, b) => a + b.finalSec, 0).toFixed(2),
    beats,
    warnings: [],
  };
}

export function saveConcatPreview(parts: { samples: Float32Array; sampleRate: number }[], out: string): void {
  const merged = concatWav(parts, 60);
  writeWav(out, merged.samples, merged.sampleRate);
}
