/**
 * Numeric QA gates. No LLM, no opinions — pass/fail with the measured number attached.
 * These are what make "the agent says it's fine" unnecessary.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import type { RenderInput } from '../engine/types.js';
import { ffmpegPath, ffprobePath } from '../lib/ffmpeg.js';

const run = promisify(execFile);

export type Gate = {
  id: string;
  label: string;
  pass: boolean;
  value: string;
  expected: string;
};

export type QaReport = {
  file: string;
  pass: boolean;
  gates: Gate[];
  probe: {
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
    bitrate: number;
    sizeBytes: number;
  };
  measured: {
    loudnessLufs?: number;
    truePeakDb?: number;
    blackFrames: number;
    frozenFrames: number;
    minLuma: number;
    sampledFrames: number;
  };
  generatedAt: string;
};

export async function probe(file: string): Promise<QaReport['probe']> {
  const { stdout } = await run(ffprobePath(), [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    file,
  ]);
  const data = JSON.parse(stdout) as {
    streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string }[];
    format: { duration: string; bit_rate?: string; size?: string };
  };
  const video = data.streams.find((s) => s.codec_type === 'video');
  const audio = data.streams.find((s) => s.codec_type === 'audio');
  const fpsStr = video?.avg_frame_rate ?? video?.r_frame_rate ?? '30/1';
  const [num, den] = fpsStr.split('/').map(Number);
  return {
    durationSec: Number(data.format.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: den ? +(num! / den).toFixed(3) : 30,
    hasAudio: Boolean(audio),
    bitrate: Number(data.format.bit_rate ?? 0),
    sizeBytes: Number(data.format.size ?? 0),
  };
}

export async function measureLoudness(file: string): Promise<{ lufs: number; truePeak: number }> {
  const { stderr } = await run(
    ffmpegPath(),
    ['-hide_banner', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    { maxBuffer: 8 * 1024 * 1024 },
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
  const match = /{[\s\S]*"input_i"[\s\S]*}/.exec(stderr);
  if (!match) return { lufs: 0, truePeak: 0 };
  const json = JSON.parse(match[0]) as { input_i: string; input_tp: string };
  return { lufs: Number(json.input_i), truePeak: Number(json.input_tp) };
}

/**
 * Dead-frame detection that understands dark themes.
 *
 * `blackdetect` is useless here: our palettes are near-black on purpose, so it fires on any
 * intentionally dark grade. Instead we read per-frame luma via signalstats and fail only when
 * a frame is *actually* black (mean luma under threshold), and use freezedetect for held frames.
 */
export async function detectDeadFrames(
  file: string,
  opts: { blackLuma?: number; freezeSeconds?: number } = {},
): Promise<{ black: number; frozen: number; details: string[]; minLuma: number; frames: number }> {
  const blackLuma = opts.blackLuma ?? 3;
  const freezeSeconds = opts.freezeSeconds ?? 1.5;

  const [{ stderr: frozenErr }, { stdout: statsOut }] = await Promise.all([
    run(ffmpegPath(), [
      '-hide_banner', '-i', file,
      '-vf', `freezedetect=n=-60dB:d=${freezeSeconds}`,
      '-an', '-f', 'null', '-',
    ], { maxBuffer: 16 * 1024 * 1024 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' })),
    run(ffmpegPath(), [
      '-hide_banner', '-i', file,
      '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG',
      '-an', '-f', 'null', '-',
    ], { maxBuffer: 64 * 1024 * 1024 }).catch(() => ({ stdout: '' })),
  ]);

  const lumas = [...statsOut.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const black = lumas.filter((y) => y < blackLuma).length;
  const details: string[] = [];
  if (black > 0) {
    const firstIdx = lumas.findIndex((y) => y < blackLuma);
    details.push(`${black} frame(s) below luma ${blackLuma}, first at frame ${firstIdx}`);
  }
  const frozen = (frozenErr.match(/freeze_start/g) ?? []).length;
  if (frozen > 0) details.push(`${frozen} held segment(s) > ${freezeSeconds}s`);
  return {
    black,
    frozen,
    details,
    minLuma: lumas.length ? +Math.min(...lumas).toFixed(2) : 0,
    frames: lumas.length,
  };
}

export async function runQa(file: string, input: RenderInput, opts: { targetLufs?: number } = {}): Promise<QaReport> {
  const p = await probe(file);
  const gates: Gate[] = [];

  const expectedDur = input.totalFrames / input.fps;
  gates.push({
    id: 'duration',
    label: 'duration matches timeline',
    pass: Math.abs(p.durationSec - expectedDur) <= 0.25,
    value: `${p.durationSec.toFixed(2)}s`,
    expected: `${expectedDur.toFixed(2)}s ±0.25`,
  });

  gates.push({
    id: 'resolution',
    label: 'resolution',
    pass: p.width === input.width && p.height === input.height,
    value: `${p.width}x${p.height}`,
    expected: `${input.width}x${input.height}`,
  });

  gates.push({
    id: 'fps',
    label: 'frame rate',
    pass: Math.abs(p.fps - input.fps) < 0.5,
    value: `${p.fps}`,
    expected: `${input.fps}`,
  });

  gates.push({
    id: 'audio',
    label: 'audio stream present',
    pass: p.hasAudio,
    value: p.hasAudio ? 'yes' : 'no',
    expected: 'yes',
  });

  let loudnessLufs: number | undefined;
  let truePeakDb: number | undefined;
  if (p.hasAudio) {
    const loud = await measureLoudness(file);
    loudnessLufs = +loud.lufs.toFixed(1);
    truePeakDb = +loud.truePeak.toFixed(1);
    const target = opts.targetLufs ?? -14;
    gates.push({
      id: 'loudness',
      label: 'integrated loudness',
      pass: Math.abs(loud.lufs - target) <= 2.5,
      value: `${loudnessLufs} LUFS`,
      expected: `${target} ±2.5 LUFS`,
    });
    gates.push({
      id: 'true-peak',
      label: 'true peak',
      pass: loud.truePeak <= -0.5,
      value: `${truePeakDb} dBTP`,
      expected: '<= -0.5 dBTP',
    });
  }

  const dead = await detectDeadFrames(file);
  gates.push({
    id: 'no-black',
    label: 'no featureless segments > 0.4s',
    pass: dead.black === 0,
    value: dead.black === 0 ? `0 (min luma ${dead.minLuma})` : dead.details.join('; '),
    expected: '0 (dark themes allowed)',
  });
  gates.push({
    id: 'no-freeze',
    label: 'no frozen segments > 1.5s',
    pass: dead.frozen === 0,
    value: String(dead.frozen),
    expected: '0',
  });

  // caption + hook structural gates from the timeline itself
  const beatsWithCaptionOverflow = input.beats.filter((b) => b.onScreen.split(/\s+/).filter(Boolean).length > 5);
  gates.push({
    id: 'onscreen-length',
    label: 'on-screen text <= 5 words',
    pass: beatsWithCaptionOverflow.length === 0,
    value: `${beatsWithCaptionOverflow.length} beats over`,
    expected: '0 beats',
  });

  const hookBeat = input.beats[0];
  const firstWordMs = hookBeat?.words[0]?.startMs ?? 0;
  const hookCapSec = hookBeat ? hookBeat.durationInFrames / input.fps : 0;
  gates.push({
    id: 'hook-starts-at-zero',
    label: 'hook is the first frame',
    pass: Boolean(hookBeat) && hookBeat!.fromFrame === 0,
    value: hookBeat ? `starts f${hookBeat.fromFrame}` : 'no beats',
    expected: 'f0',
  });
  gates.push({
    id: 'hook-speaks-early',
    label: 'first hook word before 0.9s',
    pass: firstWordMs <= 900,
    value: `${firstWordMs}ms`,
    expected: '<= 900ms',
  });
  // short form: the hook must be over fast. long form: the cold open gets a wider window.
  const hookLimit = (input.beats.length > 0 && input.canvas.height > input.canvas.width ? 4.0 : 15.0);
  gates.push({
    id: 'hook-short',
    label: `hook beat <= ${hookLimit.toFixed(1)}s`,
    pass: hookCapSec > 0 && hookCapSec <= hookLimit,
    value: `${hookCapSec.toFixed(2)}s`,
    expected: `<= ${hookLimit.toFixed(2)}s`,
  });

  const beatTypes = input.beats.map((b) => b.visual.type);
  const repeats = beatTypes.filter((t, i) => i > 0 && beatTypes[i - 1] === t).length;
  gates.push({
    id: 'visual-change',
    label: 'no repeated consecutive visual',
    pass: repeats === 0,
    value: `${repeats} repeats`,
    expected: '0',
  });

  gates.push({
    id: 'file-size',
    label: 'file size sane',
    pass: p.sizeBytes > 1024 && p.sizeBytes < 500 * 1024 * 1024,
    value: `${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB`,
    expected: '1KB - 500MB',
  });

  const report: QaReport = {
    file,
    pass: gates.every((g) => g.pass),
    gates,
    probe: p,
    measured: {
      loudnessLufs,
      truePeakDb,
      blackFrames: dead.black,
      frozenFrames: dead.frozen,
      minLuma: dead.minLuma,
      sampledFrames: dead.frames,
    },
    generatedAt: new Date().toISOString(),
  };
  return report;
}

/** Loudness normalisation with a conservative true-peak ceiling, even when input LUFS is near target. */
export async function normalizeLoudness(inFile: string, outFile: string, targetLufs = -14): Promise<void> {
  await run(ffmpegPath(), [
    '-y', '-i', inFile,
    '-c:v', 'copy',
    // Always run loudnorm: simply skipping near-target audio lets clipped or inter-sample
    // peaks through. A -2 dBTP target leaves margin for AAC's reconstructed peaks.
    '-af', `loudnorm=I=${targetLufs}:TP=-2:LRA=11`,
    '-c:a', 'aac', '-b:a', '192k',
    outFile,
  ]);
}
