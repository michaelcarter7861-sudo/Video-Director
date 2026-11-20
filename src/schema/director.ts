/**
 * director.json — the ONLY contract between the LLM (director) and the engine.
 * The LLM writes this. The engine never asks the LLM for anything at render time.
 */
import { z } from 'zod';

export const VISUAL_TYPES = [
  'kinetic-type',
  'code',
  'terminal',
  'stat',
  'chart',
  'diagram',
  'split',
  'abstract',
] as const;

export const BEAT_ROLES = ['hook', 'tension', 'payoff', 'rehook', 'loop', 'cta'] as const;
export const HOOK_FORMULAS = [
  'contrarian',
  'curiosity',
  'empathy',
  'number',
  'interrupt',
  'steal',
] as const;

export const MOTIONS = [
  'slam',
  'rise',
  'wipe',
  'reveal-word',
  'zoom',
  'none',
] as const;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');

export const PaletteSchema = z.object({
  bg: Hex,
  bgAlt: Hex,
  fg: Hex,
  fgMuted: Hex,
  accent: Hex,
  accentAlt: Hex,
  grid: Hex.optional(),
});

export const HookSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(3).max(140),
  formula: z.enum(HOOK_FORMULAS),
  score: z.number().min(0).max(1).optional(),
});

export const VisualSchema = z.object({
  type: z.enum(VISUAL_TYPES),
  motion: z.enum(MOTIONS).default('rise'),
  /** code scenes */
  lang: z.string().optional(),
  code: z.string().optional(),
  highlight: z.array(z.number().int().min(1)).optional(),
  /** terminal scenes */
  lines: z.array(z.string()).optional(),
  /** stat scenes */
  value: z.number().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  decimals: z.number().int().min(0).max(4).optional(),
  /** chart scenes */
  chartType: z.enum(['bar', 'line']).optional(),
  data: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
  /** diagram scenes */
  nodes: z.array(z.string()).optional(),
  edges: z.array(z.tuple([z.string(), z.string()])).optional(),
  /** split scenes: two short labels compared */
  left: z.string().optional(),
  right: z.string().optional(),
  /** abstract scenes */
  seed: z.number().int().optional(),
});

export const BeatSchema = z.object({
  id: z.string().min(1),
  role: z.enum(BEAT_ROLES),
  /** spoken line. Empty string = silent visual beat */
  vo: z.string().default(''),
  /** <= 5 words on screen */
  onScreen: z.string().default(''),
  /** words inside vo to emphasise */
  emphasis: z.array(z.string()).default([]),
  /** hard cap in seconds (engine may finish earlier) */
  maxSec: z.number().min(0.4).max(30),
  minSec: z.number().min(0.2).max(30).optional(),
  visual: VisualSchema,
  rehook: z.boolean().optional(),
});

export const DirectorSchema = z.object({
  specVersion: z.literal('1.0'),
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]{2,80}$/, 'lowercase slug, 3-80 chars'),
  format: z.enum(['short', 'long']),
  aspect: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  platform: z.array(z.string()).default(['youtube', 'tiktok', 'reels']),
  language: z.string().default('en'),
  fps: z.number().int().min(24).max(60).default(30),

  thesis: z.string().min(10).max(240),
  audience: z.string().min(2).max(120).default('solo founders and developers'),
  angle: z.enum(['contrarian', 'curiosity', 'data', 'story', 'tutorial']).default('contrarian'),
  originality: z.object({
    uniqueInput: z.string().min(3).max(400),
    dataRefs: z.array(z.string()).default([]),
    claimsToVerify: z.array(z.string()).default([]),
  }),

  hooks: z.array(HookSchema).min(1).max(6),
  beats: z.array(BeatSchema).min(2).max(14),

  style: z
    .object({
      templateFamily: z
        .enum(['kinetic-doc', 'terminal-explainer', 'data-story', 'neon-mono'])
        .optional(),
      palette: PaletteSchema.partial().optional(),
      variationSeed: z.number().int().min(1).max(99999),
      captionStyle: z.enum(['karaoke', 'line', 'none']).default('karaoke'),
      grain: z.number().min(0).max(0.2).default(0.05),
      vignette: z.number().min(0).max(0.6).default(0.25),
      progressBar: z.boolean().default(true),
    })
    .default({ variationSeed: 1, captionStyle: 'karaoke', grain: 0.05, vignette: 0.25, progressBar: true }),

  audio: z
    .object({
      voice: z.string().default('af_heart'),
      speed: z.number().min(0.7).max(1.4).default(1.05),
      music: z.string().optional(),
      duckDb: z.number().min(-30).max(0).default(-14),
      loudnessTargetLufs: z.number().min(-24).max(-9).default(-14),
    })
    .default({ voice: 'af_heart', speed: 1.05, duckDb: -14, loudnessTargetLufs: -14 }),

  publish: z
    .object({
      title: z.string().default(''),
      description: z.string().default(''),
      tags: z.array(z.string()).default([]),
      disclosure: z
        .object({
          syntheticVoice: z.boolean().default(true),
          aiGeneratedVisuals: z.boolean().default(false),
        })
        .default({ syntheticVoice: true, aiGeneratedVisuals: false }),
    })
    .default({ title: '', description: '', tags: [], disclosure: { syntheticVoice: true, aiGeneratedVisuals: false } }),

  budget: z
    .object({
      maxLLMCalls: z.number().int().min(0).default(6),
      maxAssetFetches: z.number().int().min(0).default(0),
      maxRenderMinutes: z.number().min(0.5).default(12),
    })
    .default({ maxLLMCalls: 6, maxAssetFetches: 0, maxRenderMinutes: 12 }),
});

export type Director = z.infer<typeof DirectorSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Visual = z.infer<typeof VisualSchema>;
export type Hook = z.infer<typeof HookSchema>;
export type Role = (typeof BEAT_ROLES)[number];

/** Words-per-second heuristic used for planning. Measured TTS wins at render time. */
export const WORDS_PER_SECOND = 2.5;
export const MAX_SHORT_SEC = 60;
export const MAX_LONG_SEC = 900;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Structured validation used by the agent repair loop. */
export type SpecIssue = {
  code:
    | 'ENUM_INVALID'
    | 'MISSING_FIELD'
    | 'WORD_BUDGET_EXCEEDED'
    | 'DURATION_OVER_BUDGET'
    | 'NO_UNIQUE_INPUT'
    | 'HOOK_NOT_FIRST'
    | 'VISUAL_REPEAT'
    | 'NO_LOOP'
    | 'ONSCREEN_TOO_LONG'
    | 'BAD_JSON'
    | 'UNKNOWN';
  path: string;
  message: string;
  fix: string;
};

export type ValidateResult =
  | { ok: true; spec: Director; warnings: SpecIssue[] }
  | { ok: false; issues: SpecIssue[] };

export function validateDirector(input: unknown):
  | { ok: true; spec: Director; warnings: SpecIssue[] }
  | { ok: false; issues: SpecIssue[] } {
  const parsed = DirectorSchema.safeParse(input);
  if (!parsed.success) {
    const issues: SpecIssue[] = parsed.error.issues.map((i) => {
      const isEnum = i.code === 'invalid_value' || /expected one of|Invalid enum/i.test(i.message);
      const isMissing = i.code === 'invalid_type';
      const options = (i as unknown as { values?: unknown[] }).values;
      return {
        code: isEnum ? 'ENUM_INVALID' : isMissing ? 'MISSING_FIELD' : 'UNKNOWN',
        path: i.path.join('.'),
        message: i.message,
        fix: isEnum
          ? `use one of: ${Array.isArray(options) ? options.join(', ') : 'see schemas/director.schema.json'}`
          : isMissing
            ? 'add the field; use the schema default when unsure'
            : 'fix the field or remove it to take the default',
      };
    });
    return { ok: false, issues };
  }

  const spec = parsed.data;
  const warnings: SpecIssue[] = [];

  // Narrative rules that a schema cannot express.
  if (spec.beats[0]?.role !== 'hook') {
    warnings.push({
      code: 'HOOK_NOT_FIRST',
      path: 'beats.0.role',
      message: `first beat role is "${spec.beats[0]?.role}" — retention depends on a hook first`,
      fix: 'set beats[0].role to "hook"',
    });
  }

  const totalSec = spec.beats.reduce((acc, b) => acc + b.maxSec, 0);
  const limit = spec.format === 'short' ? MAX_SHORT_SEC : MAX_LONG_SEC;
  if (totalSec > limit) {
    warnings.push({
      code: 'DURATION_OVER_BUDGET',
      path: 'beats',
      message: `max possible duration ${totalSec.toFixed(1)}s exceeds ${spec.format} limit ${limit}s`,
      fix: 'reduce maxSec on the longest beats or split the video',
    });
  }

  const words = spec.beats.reduce((acc, b) => acc + countWords(b.vo), 0);
  const wordBudget = Math.round(totalSec * WORDS_PER_SECOND);
  if (words > wordBudget * 1.15) {
    warnings.push({
      code: 'WORD_BUDGET_EXCEEDED',
      path: 'beats',
      message: `${words} words for ${totalSec.toFixed(1)}s (budget ~${wordBudget})`,
      fix: 'cut words from the middle beats; do not raise speed',
    });
  }

  if (spec.originality.uniqueInput.trim().length < 3) {
    warnings.push({
      code: 'NO_UNIQUE_INPUT',
      path: 'originality.uniqueInput',
      message: 'no unique input — output will look generic',
      fix: 'describe the specific data, test or experience behind this video',
    });
  }

  for (let i = 1; i < spec.beats.length; i++) {
    const a = spec.beats[i - 1]!.visual.type;
    const b = spec.beats[i]!.visual.type;
    if (a === b) {
      warnings.push({
        code: 'VISUAL_REPEAT',
        path: `beats.${i}.visual.type`,
        message: `beats ${i - 1} and ${i} both use "${a}"`,
        fix: 'change one visual type so the frame changes',
      });
    }
  }

  for (const [i, b] of spec.beats.entries()) {
    if (countWords(b.onScreen) > 5) {
      warnings.push({
        code: 'ONSCREEN_TOO_LONG',
        path: `beats.${i}.onScreen`,
        message: `on-screen text is ${countWords(b.onScreen)} words`,
        fix: 'cut to 5 words or fewer',
      });
    }
  }

  if (!spec.beats.some((b) => b.role === 'loop')) {
    warnings.push({
      code: 'NO_LOOP',
      path: 'beats',
      message: 'no loop beat — completion rate will suffer',
      fix: 'make the last beat role "loop" and echo the hook',
    });
  }

  return { ok: true, spec, warnings };
}
