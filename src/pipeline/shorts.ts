/**
 * Long -> shorts. Cutting a horizontal video into vertical crops is lazy and reads as
 * "inauthentic" to platforms. This instead RE-DIRECTS each window: new vertical spec,
 * new visual types, new hook pulled from the window's own strongest claim.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Director, Beat } from '../schema/director.js';
import type { RenderInput } from '../engine/types.js';
import { Rng } from '../lib/rng.js';

export type ShortCandidate = {
  index: number;
  startSec: number;
  endSec: number;
  beats: Beat[];
  hookLine: string;
  score: number;
};

/** Visual types that survive a vertical re-treatment (no wide charts with long labels). */
const VERTICAL_SAFE = ['kinetic-type', 'code', 'terminal', 'stat', 'quote', 'glitch', 'dot-grid', 'abstract', 'diagram'] as const;

export function pickWindows(spec: Director, input: RenderInput, count = 3, targetSec = 35): ShortCandidate[] {
  const fps = input.fps;
  const beats = input.beats;
  const scored: ShortCandidate[] = [];

  for (let start = 0; start < Math.max(1, beats.length - 1); start++) {
    let acc = 0;
    let end = start;
    while (end < beats.length && acc < targetSec) {
      acc += beats[end]!.durationInFrames / fps;
      end++;
    }
    // in a real long-form render this is 15s+; test builds use shorter beats, so scale the floor
    const floor = Math.min(15, (input.totalFrames / fps) * 0.5);
    if (acc < floor || end - start < 2) continue;
    const window = beats.slice(start, end);
    const specBeats = spec.beats.filter((b) => window.some((w) => w.id === b.id));

    // score: evidence density + a self-contained claim + ending on a payoff
    const evidence = window.filter((b) => ['stat', 'chart', 'code', 'diagram', 'terminal', 'timeline'].includes(b.visual.type)).length;
    const endsStrong = window.at(-1)?.role === 'payoff' || window.at(-1)?.role === 'rehook';
    const startsWithClaim = specBeats[0]?.vo.split(/\s+/).length ?? 0;
    const score = evidence * 2 + (endsStrong ? 2 : 0) + Math.min(2, startsWithClaim / 6);

    // a short's hook must fit in ~3s of speech: ~9 words at a natural pace
    const hookLine = trimToWords(strongestLine(specBeats[0]?.vo ?? spec.beats[start]?.vo ?? spec.thesis), 9);
    scored.push({
      index: start,
      startSec: +(window[0]!.fromFrame / fps).toFixed(2),
      endSec: +((window.at(-1)!.fromFrame + window.at(-1)!.durationInFrames) / fps).toFixed(2),
      beats: specBeats,
      hookLine,
      score: +score.toFixed(2),
    });
  }

  // keep the best non-overlapping windows
  const sorted = scored.sort((a, b) => b.score - a.score);
  const kept: ShortCandidate[] = [];
  for (const candidate of sorted) {
    if (kept.every((k) => candidate.startSec >= k.endSec || candidate.endSec <= k.startSec)) kept.push(candidate);
    if (kept.length >= count) break;
  }
  return kept.sort((a, b) => a.startSec - b.startSec);
}

export function shortsFromLong(spec: Director, input: RenderInput, count = 3): Director[] {
  const windows = pickWindows(spec, input, count);
  const rng = new Rng(spec.style.variationSeed);
  return windows.map((window, i): Director | null => {
    const body: Beat[] = window.beats.slice(1).map((beat, bi) => {
      const asVertical = (beat.visual.type === 'chart' || beat.visual.type === 'split' ? 'stat' : beat.visual.type) as Beat['visual']['type'];
      return {
        ...beat,
        maxSec: Math.max(2, Math.min(beat.maxSec, 7)),
        visual: { ...beat.visual, type: asVertical },
        // body beats keep their own words, but must not restate them in captions
        onScreen: trimToWords(beat.onScreen, 5),
      } as Beat;
    });

    const hook: Beat = {
      ...window.beats[0]!,
      role: 'hook',
      vo: window.hookLine,
      onScreen: trimToWords(window.hookLine, 5).replace(/[.,!?:;]$/, ''),
      emphasis: [],
      maxSec: 3.4,
      visual: { type: 'kinetic-type', motion: 'slam', seed: rng.int(1000, 99999) },
    };

    const loop: Beat = {
      id: 'loop',
      role: 'loop',
      vo: trimToWords(window.hookLine, 5).replace(/[.,!?:;]$/, ''),
      onScreen: 'loop it back',
      emphasis: [],
      maxSec: 3,
      visual: { type: 'abstract', motion: 'zoom', seed: rng.int(1000, 99999) },
    };

    const beats = enforceVisualVariety([hook, ...body, loop], i);
    if (beats.length < 4) return null;

    return {
      ...spec,
      id: `${spec.id}-s${i + 1}`,
      format: 'short' as const,
      aspect: '9:16' as const,
      thesis: `${window.hookLine} (excerpt from ${spec.id} @ ${window.startSec}s)`,
      beats,
      hooks: [{ id: 'h1', text: window.hookLine, formula: 'curiosity' as const, score: 0.6 }],
      style: {
        ...spec.style,
        variationSeed: rng.int(1, 99999),
        captionStyle: 'karaoke',
        templateFamily: undefined,
      },
      publish: {
        ...spec.publish,
        title: window.hookLine.slice(0, 90),
        tags: [...new Set([...spec.publish.tags, 'shorts'])].slice(0, 15),
      },
      originality: {
        ...spec.originality,
        uniqueInput: `${spec.originality.uniqueInput} (excerpt ${window.startSec}-${window.endSec}s of the long-form video)`,
      },
    };
  }).filter((s): s is Director => s !== null);
}

/** No two adjacent beats may share a visual type — the QA gate checks this. */
function enforceVisualVariety(beats: Beat[], variantIndex: number): Beat[] {
  const out = beats.map((b) => ({ ...b }));
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!.visual.type;
    if (out[i]!.visual.type !== prev) continue;
    const used = new Set(out.map((b) => b.visual.type));
    const pick =
      VERTICAL_SAFE.find((t) => t !== prev && !used.has(t)) ??
      VERTICAL_SAFE[(VERTICAL_SAFE.indexOf(prev as never) + 1 + variantIndex) % VERTICAL_SAFE.length]!;
    out[i] = { ...out[i]!, visual: { ...out[i]!.visual, type: pick as Beat['visual']['type'] } };
  }
  // the loop beat must close on a different picture than the line before it
  const last = out.at(-1)!;
  const before = out.at(-2)!;
  if (last.visual.type === before.visual.type) {
    out[out.length - 1] = { ...last, visual: { ...last.visual, type: 'abstract' } };
    if (out.at(-2)!.visual.type === 'abstract') {
      out[out.length - 2] = { ...out.at(-2)!, visual: { ...out.at(-2)!.visual, type: 'glitch' } };
    }
  }
  return out;
}

function trimToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  return `${words.slice(0, max).join(' ').replace(/[,;:]$/, '')}.`;
}

/** Pick the most claim-like sentence: shortest strong line with a number or a contrast word. */
function strongestLine(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
  if (sentences.length === 0) return text.trim();
  const scored = sentences.map((s) => {
    const words = s.split(/\s+/).length;
    const hasNumber = /\d/.test(s) ? 2 : 0;
    const hasContrast = /\b(but|not|never|stop|instead|only|most|nobody|wrong)\b/i.test(s) ? 1.5 : 0;
    return { s, score: hasNumber + hasContrast - Math.abs(words - 9) / 10 };
  });
  return scored.sort((a, b) => b.score - a.score)[0]!.s;
}

export function saveShorts(specs: Director[], outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  return specs.map((spec) => {
    const file = path.join(outDir, `${spec.id}.json`);
    fs.writeFileSync(file, JSON.stringify(spec, null, 2));
    return file;
  });
}
