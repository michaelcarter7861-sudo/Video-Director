/**
 * Distinctness gate. YouTube's inauthentic-content policy punishes near-identical uploads;
 * this measures how different a batch actually looks instead of trusting vibes.
 *
 * Method: perceptual average-hash (aHash 16x16) of each video's stills,
 * then Hamming distance between variants. Independent of palette/font names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderStill, pickFrames } from '../engine/render.js';
import type { RenderInput } from '../engine/types.js';

export type FrameSig = {
  ahash: string;
  /** mean colour of the frame (mostly background on our dark palettes) */
  rgb: [number, number, number];
  luma: number;
  /** mean colour of the brightest 12% of pixels — the accent/ink the viewer actually sees */
  ink: [number, number, number];
  /** share of pixels carrying ink (how much of the frame is "loud") */
  inkRatio: number;
};
export type Hash = { id: string; sigs: FrameSig[] };

/**
 * Signature of one frame: a 16x16 average hash (structure) + mean RGB (palette) + mean luma.
 * Structure alone is not enough here — two variants of the same script legitimately share
 * the composition, so palette and brightness carry most of the "does it look different" signal.
 */
export async function frameSignature(file: string, size = 16): Promise<FrameSig> {
  const img = await loadImage(file);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const grey: number[] = [];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    grey.push(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
  }
  const n = data.length / 4;
  const mean = grey.reduce((a, x) => a + x, 0) / grey.length;

  // ink = brightest pixels only. Mean RGB is useless on dark grades: two videos with a
  // totally different accent still average out to near-black.
  const order = grey.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v);
  const inkCount = Math.max(1, Math.round(order.length * 0.12));
  let ir = 0;
  let ig = 0;
  let ib = 0;
  for (let k = 0; k < inkCount; k++) {
    const px = order[k]!.i * 4;
    ir += data[px]!;
    ig += data[px + 1]!;
    ib += data[px + 2]!;
  }
  const inkCut = order[inkCount - 1]!.v;
  const inkRatio = grey.filter((v) => v >= inkCut).length / grey.length;

  return {
    ahash: grey.map((x) => (x >= mean ? '1' : '0')).join(''),
    rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
    luma: +mean.toFixed(2),
    ink: [Math.round(ir / inkCount), Math.round(ig / inkCount), Math.round(ib / inkCount)],
    inkRatio: +inkRatio.toFixed(3),
  };
}

/** Kept for API compatibility with earlier callers. */
export async function aHash(file: string, size = 16): Promise<string> {
  return (await frameSignature(file, size)).ahash;
}

export async function stillHashes(input: RenderInput, dir: string, perVideo = 5): Promise<Hash> {
  fs.mkdirSync(dir, { recursive: true });
  const sigs: FrameSig[] = [];
  for (const frame of pickFrames(input.totalFrames, perVideo)) {
    const file = path.join(dir, `${input.id}-f${frame}.png`);
    renderStill(input, frame, file);
    sigs.push(await frameSignature(file));
  }
  return { id: input.id, sigs };
}

export function hamming(a: string, b: string): number {
  let diff = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff + Math.abs(a.length - b.length);
}

/** Circular hue distance in degrees (0..180). */
export function hueDistance(a: [number, number, number], b: [number, number, number]): number {
  const d = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(d, 360 - d);
}

function hueOf([r, g, b]: [number, number, number]): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * 0 (identical) .. 1 (nothing alike) for one frame pair.
 * Structure is contrast-normalised by the aHash; colour is measured on the ink, not the mean.
 */
export function frameDistance(a: FrameSig, b: FrameSig): number {
  const structure = hamming(a.ahash, b.ahash) / Math.max(1, a.ahash.length);
  const hue = hueDistance(a.ink, b.ink) / 180;
  const saturationDiff = Math.abs(saturationOf(a.ink) - saturationOf(b.ink));
  const load = Math.min(1, Math.abs(a.inkRatio - b.inkRatio) * 3);
  const brightness = Math.min(1, Math.abs(a.luma - b.luma) / 128);
  return +(structure * 0.5 + hue * 0.3 + saturationDiff * 0.06 + load * 0.09 + brightness * 0.05).toFixed(4);
}

function saturationOf([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export type DistinctnessReport = {
  pass: boolean;
  threshold: number;
  pairs: { a: string; b: string; distance: number; structureOnly: number; distinct: boolean }[];
  advice: string[];
};

/**
 * Compare variants at matched story positions (frame at 0%, 25%, 50%, 75%, 100%),
 * because two variants of the same script share beats by design.
 */
export function compareVariants(hashes: Hash[], threshold = 0.18): DistinctnessReport {
  const pairs: DistinctnessReport['pairs'] = [];
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      const a = hashes[i]!;
      const b = hashes[j]!;
      const n = Math.min(a.sigs.length, b.sigs.length);
      let total = 0;
      let structure = 0;
      for (let k = 0; k < n; k++) {
        total += frameDistance(a.sigs[k]!, b.sigs[k]!);
        structure += hamming(a.sigs[k]!.ahash, b.sigs[k]!.ahash) / Math.max(1, a.sigs[k]!.ahash.length);
      }
      const distance = +(total / Math.max(1, n)).toFixed(4);
      pairs.push({
        a: a.id,
        b: b.id,
        distance,
        structureOnly: +(structure / Math.max(1, n)).toFixed(4),
        distinct: distance >= threshold,
      });
    }
  }

  const advice: string[] = [];
  const dupes = pairs.filter((p) => !p.distinct);
  if (dupes.length > 0) {
    const offenders = [...new Set(dupes.flatMap((p) => [p.a, p.b]))];
    advice.push(`${dupes.length} pair(s) too similar (avg distance < ${threshold}) — vary on: ${offenders.join(', ')}`);
    advice.push('in practice: change palette family + display font + opening visual type together, not just the seed');
  }
  return { pass: dupes.length === 0, threshold, pairs, advice };
}
