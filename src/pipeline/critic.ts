/**
 * Critic loop. Two layers:
 *   1. rules  — deterministic, always available (no LLM, no network)
 *   2. llm    — optional: pipes stills + transcript to Claude Code headless for taste feedback
 *
 * The rules layer never "fixes" by lowering a gate. It returns spec patches that a human (or the
 * agent) can apply, plus a ship/patch verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Director, Beat } from '../schema/director.js';
import type { RenderInput, TimingReport } from '../engine/types.js';
import { countWords } from '../schema/director.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type Patch = {
  beatId: string;
  field: string;
  from: string | number;
  to: string | number;
  reason: string;
};

export type Critique = {
  verdict: 'ship' | 'patch';
  source: 'rules' | 'llm' | 'rules+llm';
  issues: { beatId: string; severity: 'high' | 'med' | 'low'; problem: string }[];
  patches: Patch[];
  notes: string[];
};

export function critiqueRules(spec: Director, input: RenderInput, timing: TimingReport): Critique {
  const issues: Critique['issues'] = [];
  const patches: Patch[] = [];
  const notes: string[] = [];
  const fps = input.fps;

  const renderBeats = input.beats;
  const totalSec = input.totalFrames / fps;

  // 1. pacing: any beat longer than 8s in a short is a retention hole
  const isShort = spec.format === 'short';
  for (const beat of renderBeats) {
    const sec = beat.durationInFrames / fps;
    const fmtBeat = spec.beats.find((b) => b.id === beat.id);
    if (isShort && sec > 8) {
      issues.push({ beatId: beat.id, severity: 'high', problem: `${sec.toFixed(1)}s on one visual is too long for a short` });
      patches.push({
        beatId: beat.id,
        field: 'visual.type',
        from: beat.visual.type,
        to: 'split',
        reason: 'split the idea into two visuals (before/after) to reset attention',
      });
    }
    // 2. onScreen should be a headline, not a transcript of the voiceover
    // text-forward scenes ARE the headline; repeating the line there is the design, not a mistake
    const textForward = beat.visual.type === 'kinetic-type' || beat.visual.type === 'quote';
    if (!textForward && fmtBeat && fmtBeat.onScreen.trim() && beat.words.length > 0) {
      const vo = beat.words.map((w) => w.word.toLowerCase()).join(' ');
      const os = fmtBeat.onScreen.toLowerCase();
      if (vo.startsWith(os) && os.split(' ').length > 2) {
        issues.push({ beatId: beat.id, severity: 'med', problem: 'on-screen text repeats the voiceover verbatim' });
        patches.push({
          beatId: beat.id,
          field: 'onScreen',
          from: fmtBeat.onScreen,
          to: os.split(' ').slice(0, 3).join(' ').toUpperCase(),
          reason: 'headline only — let the voice carry the sentence',
        });
      }
    }
    // 3. words per second (measured, not declared)
    if (beat.audioMs > 0) {
      const wps = beat.words.length / (beat.audioMs / 1000);
      if (wps > 3.4) {
        issues.push({ beatId: beat.id, severity: 'med', problem: `${wps.toFixed(1)} words/sec is too fast to follow` });
        patches.push({
          beatId: beat.id,
          field: 'vo',
          from: `${beat.words.length} words`,
          to: `${Math.round(beat.words.length * 0.75)} words`,
          reason: 'cut ~25% of the words; do not raise speed',
        });
      }
    }
  }

  if (isShort && totalSec > 45) {
    issues.push({ beatId: 'all', severity: 'med', problem: `${totalSec.toFixed(0)}s short — most shorts hold 20-40s` });
    notes.push('trim one payoff beat or shorten the loop');
  }
  if (isShort && totalSec < 12) {
    issues.push({ beatId: 'all', severity: 'low', problem: `${totalSec.toFixed(0)}s is very short — no room for a payoff` });
  }

  // 4. evidence: a video whose beats are all text has nothing to show
  const evidence = renderBeats.filter((b) => ['code', 'chart', 'diagram', 'stat', 'terminal', 'timeline'].includes(b.visual.type));
  if (evidence.length === 0) {
    issues.push({ beatId: 'all', severity: 'high', problem: 'no evidence beat (no number, chart, code or diagram)' });
    notes.push('add one `stat`, `chart`, `code` or `diagram` beat — claims without evidence do not convert');
  }

  // 5. visual variety: a 3-beat run of the same family reads as a slideshow
  let run = 1;
  let worst = 1;
  let worstAt = '';
  for (let i = 1; i < renderBeats.length; i++) {
    const a = family(renderBeats[i - 1]!.visual.type);
    const b = family(renderBeats[i]!.visual.type);
    run = a === b ? run + 1 : 1;
    if (run > worst) {
      worst = run;
      worstAt = renderBeats[i]!.id;
    }
  }
  if (worst >= 3) {
    issues.push({ beatId: worstAt, severity: 'med', problem: `${worst} beats in a row feel like the same shot` });
    notes.push('alternate text / data / motion families');
  }

  const high = issues.filter((i) => i.severity === 'high').length;
  const verdict: Critique['verdict'] = high > 0 || patches.length >= 3 ? 'patch' : 'ship';
  return { verdict, source: 'rules', issues, patches, notes };
}

function family(type: string): string {
  if (['kinetic-type', 'glitch', 'quote', 'abstract', 'dot-grid'].includes(type)) return 'text';
  if (['chart', 'stat', 'timeline'].includes(type)) return 'data';
  if (['code', 'terminal'].includes(type)) return 'code';
  if (['diagram', 'split'].includes(type)) return 'structure';
  return 'other';
}

/** Apply rule patches to the spec (only the safe, numeric/string ones). */
export function applyPatches(spec: Director, patches: Patch[]): Director {
  const next = structuredClone(spec);
  for (const patch of patches) {
    const beat = next.beats.find((b) => b.id === patch.beatId);
    if (!beat) continue;
    if (patch.field === 'onScreen' && typeof patch.to === 'string') beat.onScreen = patch.to;
    if (patch.field === 'visual.type' && patch.to === 'split') {
      beat.visual = {
        ...beat.visual,
        type: 'split',
        left: beat.onScreen || beat.vo.split(' ').slice(0, 4).join(' '),
        right: beat.vo.split(' ').slice(-4).join(' '),
      };
    }
    if (patch.field === 'vo' && typeof patch.to === 'string') {
      const target = Number(patch.to.split(' ')[0]);
      if (Number.isFinite(target) && target > 0) {
        const words = beat.vo.split(/\s+/);
        beat.vo = words.slice(0, target).join(' ');
        beat.maxSec = Math.min(beat.maxSec, Math.max(1.2, target / 2.5));
      }
    }
  }
  return next;
}

/** Optional LLM pass through Claude Code headless (uses your FreeLLMAPI setup). */
export async function critiqueWithLLM(
  spec: Director,
  input: RenderInput,
  stillsDir: string,
  timeoutMs = 120_000,
): Promise<Critique | null> {
  const prompt = buildPrompt(spec, input, stillsDir);
  try {
    const { stdout } = await run('claude', [
      '-p',
      prompt,
      '--permission-mode',
      'plan',
      '--output-format',
      'json',
    ], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    const envelope = JSON.parse(stdout) as { result?: string };
    const text = envelope.result ?? stdout;
    const json = extractJson(text);
    if (!json) return null;
    const parsed = JSON.parse(json) as { verdict?: string; issues?: Critique['issues']; patches?: Patch[]; notes?: string[] };
    return {
      verdict: parsed.verdict === 'patch' ? 'patch' : 'ship',
      source: 'llm',
      issues: parsed.issues ?? [],
      patches: parsed.patches ?? [],
      notes: parsed.notes ?? [],
    };
  } catch {
    // no claude CLI, no FreeLLMAPI, or bad JSON — the rules layer already ran
    return null;
  }
}

function buildPrompt(spec: Director, input: RenderInput, stillsDir: string): string {
  const transcript = input.beats
    .map((b) => `[${b.id} ${b.role} ${(b.durationInFrames / input.fps).toFixed(1)}s] ${b.words.map((w) => w.word).join(' ')}`)
    .join('\n');
  return [
    'You are a retention-focused video editor. Review this short video spec.',
    `Stills are in ${stillsDir} (frames 0, 10%, 30%, 50%, 70%, 95%).`,
    'Transcript with timing:',
    transcript,
    `Thesis: ${spec.thesis}`,
    `On-screen text per beat: ${spec.beats.map((b) => `${b.id}="${b.onScreen}"`).join(', ')}`,
    'Return ONLY this JSON (no prose, no fences):',
    '{"verdict":"ship"|"patch","issues":[{"beatId":"b1","severity":"high|med|low","problem":"..."}],"patches":[{"beatId":"b1","field":"maxSec|onScreen|vo","from":"...","to":"...","reason":"..."}],"notes":["..."]}',
    'Rules: max 4 issues. Only measurable problems (timing, pacing, contrast, word count, evidence). If it is good, return "ship".',
  ].join('\n');
}

function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

export function writeCritique(critique: Critique, projectDir: string): string {
  fs.mkdirSync(projectDir, { recursive: true });
  const file = path.join(projectDir, 'critique.json');
  fs.writeFileSync(file, JSON.stringify(critique, null, 2));
  return file;
}

export function beatsWithIssues(spec: Director, critique: Critique): Beat[] {
  const ids = new Set(critique.issues.map((i) => i.beatId));
  return spec.beats.filter((b) => ids.has(b.id));
}
