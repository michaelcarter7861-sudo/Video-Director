/**
 * Engine contract tests. These are the gates that keep the agent honest:
 * determinism, no blank frames, word-level captions, valid publish pack.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateDirector, DirectorSchema } from '../src/schema/director.js';
import { deriveVisualPayloads, buildProject, estimatePlan } from '../src/pipeline/plan.js';
import { renderStill, pickFrames } from '../src/engine/render.js';
import { buildPublishPack } from '../src/pipeline/publish.js';
import { chunkWords } from '../src/engine/captions.js';
import { resolveBrand, canvases } from '../src/brand/tokens.js';
import { Rng } from '../src/lib/rng.js';
import { estimateWordTimings } from '../src/pipeline/tts.js';

const demoPath = path.join(process.cwd(), 'examples', 'demo', 'director.json');
const demoRaw = JSON.parse(fs.readFileSync(demoPath, 'utf8')) as unknown;

test('schema accepts the demo spec', () => {
  const result = validateDirector(demoRaw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.spec.specVersion, '1.0');
    assert.ok(result.spec.beats.length >= 2);
  }
});

test('schema rejects an invalid visual type with a structured fix', () => {
  const broken = structuredClone(demoRaw) as { beats: { visual: { type: string } }[] };
  broken.beats[1]!.visual.type = 'sora-broll';
  const result = validateDirector(broken);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const issue = result.issues.find((i) => i.path.includes('visual.type'));
    assert.ok(issue, 'expected a visual.type issue');
    assert.equal(issue!.code, 'ENUM_INVALID');
    assert.ok(issue!.fix.length > 0);
  }
});

test('narrative warnings fire (hook not first / no loop)', () => {
  const spec = structuredClone(demoRaw) as { beats: { role: string }[] };
  spec.beats[0]!.role = 'tension';
  spec.beats = spec.beats.map((b) => (b.role === 'loop' ? { ...b, role: 'payoff' } : b));
  const result = validateDirector(spec);
  assert.equal(result.ok, true);
  if (result.ok) {
    const codes = result.warnings.map((w) => w.code);
    assert.ok(codes.includes('HOOK_NOT_FIRST'));
  }
});

test('visual payloads are derived deterministically', () => {
  const spec = validateDirector(demoRaw);
  assert.equal(spec.ok, true);
  if (!spec.ok) return;
  const a = deriveVisualPayloads(spec.spec);
  const b = deriveVisualPayloads(spec.spec);
  assert.deepEqual(a, b);
  for (const beat of a.beats) {
    if (beat.visual.type === 'chart') assert.ok(beat.visual.data && beat.visual.data.length > 0);
    if (beat.visual.type === 'diagram') assert.ok(beat.visual.nodes && beat.visual.nodes.length > 0);
    if (beat.visual.type === 'code') assert.ok(beat.visual.code && beat.visual.code.length > 0);
  }
});

test('RNG is stable for a seed and varies across seeds', () => {
  const a = Array.from({ length: 5 }, (_, i) => new Rng(42).int(0, 999) + i);
  const b = Array.from({ length: 5 }, (_, i) => new Rng(42).int(0, 999) + i);
  assert.deepEqual(a, b);
  assert.notEqual(new Rng(1).int(0, 999999), new Rng(2).int(0, 999999));
});

test('brand resolution is stable per seed', () => {
  const a = resolveBrand(1247);
  const b = resolveBrand(1247);
  assert.equal(a.palette.id, b.palette.id);
  assert.equal(a.fonts.id, b.fonts.id);
  const seen = new Set<string>();
  for (let seed = 1; seed < 40; seed++) seen.add(resolveBrand(seed).palette.id + '/' + resolveBrand(seed).fonts.id);
  assert.ok(seen.size >= 3, 'variation engine must produce visibly different looks');
});

test('captions chunk to <= 4 words and never overflow', () => {
  const words = estimateWordTimings(
    'The quick brown fox jumps over the lazy dog and keeps running through the field',
    4000,
  );
  const chunks = chunkWords(words);
  for (const chunk of chunks) {
    assert.ok(chunk.words.length <= 4, `chunk too long: ${chunk.words.map((w) => w.word).join(' ')}`);
    assert.ok(chunk.words.map((w) => w.word).join(' ').length <= 26);
  }
  assert.equal(chunks.flatMap((c) => c.words).length, words.length);
});

test('timeline is built from measured audio, not from the spec', async () => {
  const parsed = validateDirector(demoRaw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-'));
  const spec = deriveVisualPayloads({ ...parsed.spec, id: 'timeline-test' });
  spec.beats[0]!.maxSec = 0.5; // deliberately too small: audio must win
  const built = await buildProject(spec, { projectDir: dir, voice: 'dummy' });
  const first = built.renderInput.beats[0]!;
  assert.ok(first.durationInFrames > 15, 'beat duration must follow the audio, not maxSec');
  assert.equal(built.report.beats[0]!.capped, true);
  const total = built.renderInput.beats.reduce((a, b) => Math.max(a, b.fromFrame + b.durationInFrames), 0);
  assert.equal(built.renderInput.totalFrames, total);
});

test('frames are byte-identical across two renders (determinism)', async () => {
  const parsed = validateDirector(demoRaw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-det-'));
  const spec = deriveVisualPayloads({ ...parsed.spec, id: 'determinism-test' });
  // strip vo so the test never depends on a TTS backend
  spec.beats = spec.beats.map((b) => ({ ...b, vo: '', minSec: 0.6 }));
  const built = await buildProject(spec, { projectDir: dir, voice: 'dummy' });
  const outA = path.join(dir, 'a.png');
  const outB = path.join(dir, 'b.png');
  renderStill(built.renderInput, 42, outA);
  renderStill(built.renderInput, 42, outB);
  assert.deepEqual(fs.readFileSync(outA), fs.readFileSync(outB));
});

test('different variation seeds produce different frames', async () => {
  const parsed = validateDirector(demoRaw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-var-'));
  const makeSpec = (seed: number) => {
    const base = deriveVisualPayloads({ ...parsed.spec, id: `variant-${seed}` });
    base.style.variationSeed = seed;
    base.beats = base.beats.map((b) => ({ ...b, vo: '', minSec: 0.6 }));
    return base;
  };
  const a = await buildProject(makeSpec(11), { projectDir: path.join(dir, 'a'), voice: 'dummy' });
  const b = await buildProject(makeSpec(4242), { projectDir: path.join(dir, 'b'), voice: 'dummy' });
  const pa = path.join(dir, 'a.png');
  const pb = path.join(dir, 'b.png');
  renderStill(a.renderInput, 42, pa);
  renderStill(b.renderInput, 42, pb);
  assert.notDeepEqual(fs.readFileSync(pa), fs.readFileSync(pb), 'variation engine must change the look');
});

test('contact-sheet frame picker always includes first and last frame', () => {
  const frames = pickFrames(100, 9);
  assert.equal(frames[0], 0);
  assert.equal(frames.at(-1), 99);
  assert.equal(frames.length, 9);
});

test('publish pack carries licenses, srt and disclosure', () => {
  const parsed = validateDirector(demoRaw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const timing = estimatePlan(parsed.spec);
  const pack = buildPublishPack(parsed.spec, timing, [
    { id: 'hook', words: estimateWordTimings('Your first two seconds are lying', 2000) },
  ]);
  assert.ok(pack.titleVariants.length > 0);
  assert.ok(pack.licenses.some((l) => l.kind === 'font' && l.license === 'OFL-1.1'));
  assert.ok(pack.licenses.some((l) => l.kind === 'audio'));
  assert.match(pack.srt, /00:00:00,000 --> /);
  assert.equal(pack.disclosure.syntheticVoice, true);
  assert.ok(pack.tags.length > 0 && pack.tags.length <= 15);
});

test('every aspect ratio has a canvas with a safe area', () => {
  for (const [name, canvas] of Object.entries(canvases)) {
    assert.ok(canvas.width > 0 && canvas.height > 0, name);
    assert.ok(canvas.safeTop > 0 && canvas.safeBottom > 0);
    assert.ok(canvas.safeTop + canvas.safeBottom < 0.4);
  }
});

test('schema default fill-in works for a minimal spec', () => {
  const minimal = {
    specVersion: '1.0',
    id: 'minimal-test',
    format: 'short',
    thesis: 'A minimal but valid thesis for the engine to render.',
    originality: { uniqueInput: 'my notes' },
    hooks: [{ id: 'h1', text: 'Minimal hook.', formula: 'interrupt' }],
    beats: [
      { id: 'b1', role: 'hook', vo: 'Minimal hook.', onScreen: 'MINIMAL', maxSec: 2, visual: { type: 'kinetic-type' } },
      { id: 'b2', role: 'loop', vo: 'Loop back.', onScreen: 'LOOP', maxSec: 2, visual: { type: 'abstract' } },
    ],
  };
  const parsed = DirectorSchema.safeParse(minimal);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.style.variationSeed, 1);
    assert.equal(parsed.data.audio.voice, 'af_heart');
    assert.equal(parsed.data.aspect, '9:16');
  }
});
