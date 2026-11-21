/**
 * Phase 2-4 contracts: critic, distinctness, thumbnail, shorts-from-long, review page, new scenes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateDirector } from '../src/schema/director.js';
import { deriveVisualPayloads, buildProject } from '../src/pipeline/plan.js';
import { critiqueRules, applyPatches } from '../src/pipeline/critic.js';
import { hamming, compareVariants, hueDistance, type FrameSig } from '../src/pipeline/distinct.js';
import { scoreFrame } from '../src/pipeline/thumbnail.js';
import { pickWindows, shortsFromLong } from '../src/pipeline/shorts.js';
import { writeReviewPage } from '../src/pipeline/review.js';
import { planVariants, applyVariant } from '../src/pipeline/variants.js';
import { buildPublishPack } from '../src/pipeline/publish.js';
import { renderStill, pickFrames } from '../src/engine/render.js';
import { VISUAL_TYPES } from '../src/schema/director.js';
import { scenes } from '../src/scenes/index.js';

const load = (p: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), 'utf8'));

function specOf(file: string) {
  const parsed = validateDirector(load(file));
  assert.equal(parsed.ok, true, `spec should validate: ${file}`);
  if (!parsed.ok) throw new Error('invalid spec');
  return parsed.spec;
}

/** Build a project without TTS (vo stripped) so tests stay fast and offline. */
async function silentBuild(spec: ReturnType<typeof specOf>, dir: string) {
  const silent = deriveVisualPayloads(spec);
  silent.beats = silent.beats.map((b) => ({ ...b, vo: '', minSec: 1.1, maxSec: Math.max(b.maxSec, 1.1) }));
  return buildProject(silent, { projectDir: dir, voice: 'dummy' });
}

test('every visual type has a scene implementation', () => {
  for (const type of VISUAL_TYPES) assert.ok(scenes[type], `missing scene for ${type}`);
});

test('all scenes render without throwing (showcase spec, one frame per beat)', async () => {
  const spec = specOf('examples/showcase/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-scenes-'));
  const built = await silentBuild(spec, dir);
  for (const beat of built.renderInput.beats) {
    const frame = beat.fromFrame + Math.floor(beat.durationInFrames / 2);
    const file = path.join(dir, `beat-${beat.id}.png`);
    renderStill(built.renderInput, frame, file);
    assert.ok(fs.statSync(file).size > 5000, `frame for ${beat.id} looks empty`);
  }
});

test('critic flags a transcript-style onScreen and a too-long beat', async () => {
  const spec = specOf('examples/demo/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-critic-'));
  const built = await silentBuild(spec, dir);
  const timing = built.report;
  // force a long beat so the rule must fire
  const input = structuredClone(built.renderInput);
  input.beats[1]!.durationInFrames = input.fps * 9;
  const critique = critiqueRules(spec, input, timing);
  assert.equal(critique.verdict, 'patch');
  assert.ok(critique.issues.some((i) => /too long/i.test(i.problem)));
  assert.ok(critique.patches.length > 0);
});

test('critic patches are appliable and keep the spec valid', async () => {
  const spec = specOf('examples/demo/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-patch-'));
  const built = await silentBuild(spec, dir);
  const input = structuredClone(built.renderInput);
  input.beats[2]!.durationInFrames = input.fps * 10;
  const critique = critiqueRules(spec, input, built.report);
  const patched = applyPatches(spec, critique.patches);
  const revalidated = validateDirector(patched);
  assert.equal(revalidated.ok, true);
});

test('critic ships a well-formed short', async () => {
  const spec = specOf('examples/demo/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-ship-'));
  const built = await silentBuild(spec, dir);
  const critique = critiqueRules(spec, built.renderInput, built.report);
  assert.equal(critique.verdict, 'ship', JSON.stringify(critique.issues));
});

test('hamming, frame distance and distinctness maths are sane', () => {
  assert.equal(hamming('1010', '1010'), 0);
  assert.equal(hamming('1010', '0101'), 4);

  const sig = (
    bit: string,
    ink: [number, number, number],
    luma: number,
    inkRatio = 0.12,
  ): FrameSig => ({ ahash: bit, rgb: [0, 0, 0], luma, ink, inkRatio });

  const identical = compareVariants([
    { id: 'a', sigs: [sig('1010', [255, 176, 32], 20)] },
    { id: 'b', sigs: [sig('1010', [255, 176, 32], 20)] },
  ]);
  assert.equal(identical.pass, false);
  assert.equal(identical.pairs[0]!.distance, 0);

  // same layout, opposite accent hue -> a real re-brand, must pass
  const recoloured = compareVariants([
    { id: 'a', sigs: [sig('1'.repeat(256), [255, 176, 32], 20)] },
    { id: 'b', sigs: [sig('1'.repeat(256), [31, 95, 255], 20)] },
  ]);
  assert.equal(recoloured.pairs[0]!.structureOnly, 0);
  assert.equal(recoloured.pass, true);

  assert.ok(hueDistance([255, 176, 32], [31, 95, 255]) > 90);
  assert.equal(hueDistance([255, 0, 0], [255, 0, 0]), 0);
});

test('variants differ from each other and stay valid', async () => {
  const spec = specOf('examples/demo/director.json');
  const plans = planVariants(spec, 4);
  assert.equal(plans.length, 4);
  assert.equal(new Set(plans.map((p) => p.templateFamily)).size > 1, true);
  assert.equal(new Set(plans.map((p) => p.hookId)).size > 1, true);
  for (const plan of plans) {
    const variant = applyVariant(spec, plan);
    assert.equal(validateDirector(variant).ok, true);
    assert.notEqual(variant.id, spec.id);
    assert.ok(variant.beats[0]!.onScreen.split(/\s+/).length <= 5, 'hook headline must stay short');
  }
});

test('thumbnail scoring prefers a content-rich frame over an empty one', async () => {
  const spec = specOf('examples/demo/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-thumb-'));
  const built = await silentBuild(spec, dir);
  const frames = pickFrames(built.renderInput.totalFrames, 6);
  const scores: number[] = [];
  for (const frame of frames) {
    const file = path.join(dir, `f${frame}.png`);
    renderStill(built.renderInput, frame, file);
    scores.push(await scoreFrame(file));
  }
  assert.ok(scores.every((s) => s >= 0 && s <= 1));
  assert.ok(Math.max(...scores) > Math.min(...scores), 'scoring must discriminate between frames');
});

test('shorts-from-long re-directs to vertical, adds a loop and stays valid', async () => {
  const spec = specOf('examples/long/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-shorts-'));
  const built = await silentBuild(spec, dir);
  const windows = pickWindows(spec, built.renderInput, 3);
  assert.ok(windows.length >= 1);
  const shorts = shortsFromLong(spec, built.renderInput, 3);
  assert.equal(shorts.length, windows.length);
  for (const short of shorts) {
    assert.equal(short.aspect, '9:16');
    assert.equal(short.format, 'short');
    assert.equal(short.beats[0]!.role, 'hook');
    assert.equal(short.beats.at(-1)!.role, 'loop');
    for (const beat of short.beats) assert.ok(beat.maxSec <= 6);
    assert.equal(validateDirector(short).ok, true);
  }
});

test('review page is generated with gates, titles and licences', async () => {
  const spec = specOf('examples/demo/director.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-review-'));
  const built = await silentBuild(spec, dir);
  const publish = buildPublishPack(spec, built.report, [{ id: 'hook', words: built.renderInput.beats[0]!.words }]);
  const out = path.join(dir, 'review.html');
  writeReviewPage({
    spec,
    timing: built.report,
    qa: {
      file: 'x.mp4',
      pass: true,
      gates: [{ id: 'duration', label: 'duration', pass: true, value: '10s', expected: '10s' }],
      probe: { durationSec: 10, width: 1080, height: 1920, fps: 30, hasAudio: true, bitrate: 1, sizeBytes: 1 },
      measured: { blackFrames: 0, frozenFrames: 0, minLuma: 2, sampledFrames: 300 },
      generatedAt: new Date().toISOString(),
    },
    publish,
    videoRelPath: 'video.mp4',
    stillsRel: ['stills/f0.png'],
    outFile: out,
  });
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /QA gates/);
  assert.match(html, /Licences/);
  assert.match(html, /<video src="video.mp4"/);
  assert.ok(publish.titleVariants.length > 0);
});
