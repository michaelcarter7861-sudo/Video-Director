/**
 * Hook A/B. One body, N hooks, N renders, N publish slots.
 * The controlled variable is the hook only: same beats, same visuals after the hook,
 * so a retention delta can be attributed to the opening line.
 */
import type { Director } from '../schema/director.js';
import type { Priors } from './priors.js';
import { rankHooks } from './priors.js';

export type HookPlan = {
  id: string;
  hookId: string;
  formula: string;
  text: string;
  /** text as it will actually be spoken, after the hook-budget trim */
  spokenText: string;
  estimatedSec: number;
  trimmed: boolean;
  expected: number;
  source: 'measured' | 'seed' | 'blended';
};

/** Hooks must clear the QA gate (≤4.0s portrait) with room for TTS variance. */
export const HOOK_WORD_BUDGET = 9;
/** conservative speaking rate for planning; measured audio still wins at build time */
const PLANNING_WPS = 2.5;

export function trimHook(text: string, words = HOOK_WORD_BUDGET): { text: string; trimmed: boolean } {
  const parts = text.trim().split(/\s+/);
  if (parts.length <= words) return { text: text.trim(), trimmed: false };
  // cut at the last sentence/clause boundary that fits, so the trim still reads as a sentence
  const clipped = parts.slice(0, words).join(' ');
  const boundary = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('?'), clipped.lastIndexOf('!'));
  if (boundary > clipped.length * 0.4) return { text: clipped.slice(0, boundary + 1), trimmed: true };
  return { text: `${clipped.replace(/[,;:]$/, '')}.`, trimmed: true };
}

export function planHooks(spec: Director, priors: Priors, count = 3): HookPlan[] {
  const ranked = rankHooks(priors, spec.hooks.map((h) => ({ id: h.id, formula: h.formula, text: h.text })));
  // fall back to the thesis as a hook if the spec only declared one
  const pool = ranked.length >= count ? ranked : [
    ...ranked,
    ...Array.from({ length: count - ranked.length }, (_, i) => ({
      id: `synthetic-${i + 1}`,
      formula: 'interrupt',
      text: spec.thesis,
      expected: 0,
      source: 'seed' as const,
    })),
  ];
  return pool.slice(0, count).map((hook, i) => {
    const trimmed = trimHook(hook.text);
    return {
      id: `${spec.id}-h${i + 1}`,
      hookId: hook.id,
      formula: hook.formula,
      text: hook.text,
      spokenText: trimmed.text,
      estimatedSec: +(trimmed.text.split(/\s+/).length / PLANNING_WPS).toFixed(2),
      trimmed: trimmed.trimmed,
      expected: hook.expected,
      source: hook.source,
    };
  });
}

/**
 * Apply a hook. The first beat's words are replaced, its duration is re-solved by the
 * build (measured audio wins), and every other beat is untouched — that is the point.
 */
export function applyHook(spec: Director, plan: HookPlan): Director {
  const next = structuredClone(spec);
  next.id = plan.id;
  const spoken = plan.spokenText ?? plan.text;
  const headline = spoken.replace(/[.,!?;:]$/, '').split(/\s+/).slice(0, 5).join(' ');
  next.hooks = [{ id: plan.hookId, text: plan.text, formula: plan.formula as Director['hooks'][number]['formula'], score: plan.expected }];
  next.beats = next.beats.map((beat, i) =>
    i === 0
      ? {
          ...beat,
          role: 'hook' as const,
          vo: spoken,
          onScreen: headline,
          emphasis: [],
          maxSec: Math.min(beat.maxSec, 3.8),
        }
      : beat,
  );
  return next;
}

/** Human-readable comparison table row set for the CLI. */
export function hookTable(plans: HookPlan[]): {
  slot: string;
  formula: string;
  expected: number;
  source: string;
  est: string;
  hook: string;
}[] {
  return plans.map((p) => ({
    slot: p.id,
    formula: p.formula,
    expected: p.expected,
    source: p.source,
    est: `${p.estimatedSec}s${p.trimmed ? ' *' : ''}`,
    hook: (p.trimmed ? p.spokenText : p.text).slice(0, 60),
  }));
}
