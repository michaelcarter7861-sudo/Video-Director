/**
 * Performance priors. The critic can only judge structure; this file lets measured
 * reality override taste. `data/priors.json` is updated by `ingest` from a metrics
 * CSV, and read by `hooks`/`variants` so ranking actually moves with the data.
 *
 * Nothing here is a promise: priors start as hand-set editorial weights and are
 * replaced by the channel's own numbers as soon as they exist.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Mirrors HOOK_FORMULAS in the schema — keep in step. */
export type HookFormula = 'contrarian' | 'curiosity' | 'empathy' | 'number' | 'interrupt' | 'steal';

export type Prior = {
  formula: HookFormula | string;
  /** how many publishable observations this figure rests on */
  n: number;
  /** mean retention at 3s, 0..1 */
  retention3s: number;
  /** mean watch-through, 0..1 */
  completion: number;
  /** rows seen (views-weighted), for the report */
  rows: number;
  updatedAt: string;
};

export type Priors = {
  version: 1;
  /** editorial seed weights, used until real data exists */
  seed: Record<string, { retention3s: number; completion: number }>;
  measured: Prior[];
};

export const DEFAULT_PRIORS: Priors = {
  version: 1,
  seed: {
    interrupt: { retention3s: 0.71, completion: 0.38 },
    curiosity: { retention3s: 0.68, completion: 0.35 },
    contrarian: { retention3s: 0.64, completion: 0.33 },
    number: { retention3s: 0.59, completion: 0.31 },
    steal: { retention3s: 0.61, completion: 0.36 },
    empathy: { retention3s: 0.57, completion: 0.34 },
  },
  measured: [],
};

export function priorsPath(root = process.cwd()): string {
  return path.join(root, 'data', 'priors.json');
}

export function loadPriors(root = process.cwd()): Priors {
  const file = priorsPath(root);
  if (!fs.existsSync(file)) return DEFAULT_PRIORS;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Priors;
    if (!parsed.seed) return DEFAULT_PRIORS;
    return { ...DEFAULT_PRIORS, ...parsed };
  } catch {
    return DEFAULT_PRIORS;
  }
}

export function savePriors(priors: Priors, root = process.cwd()): string {
  const file = priorsPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(priors, null, 2));
  return file;
}

/**
 * Expected retention for a hook formula.
 *
 * Small samples must not swing the ranking (one lucky video would own the channel), so we
 * shrink the measured mean toward the editorial seed by n/(n+k). With k=5 a formula needs
 * ~5 observations to be believed half-way, ~20 to be believed almost fully. Views-weighting
 * happens upstream in foldPriors.
 */
export function expectedRetention(
  priors: Priors,
  formula: string,
  k = 5,
): { retention3s: number; completion: number; source: 'measured' | 'seed' | 'blended'; n: number } {
  const seed = priors.seed[formula] ?? priors.seed.interrupt ?? { retention3s: 0.55, completion: 0.3 };
  const measured = priors.measured.find((m) => m.formula === formula);
  if (!measured || measured.n === 0) return { ...seed, source: 'seed', n: 0 };
  const w = measured.n / (measured.n + k);
  return {
    retention3s: +(measured.retention3s * w + seed.retention3s * (1 - w)).toFixed(4),
    completion: +(measured.completion * w + seed.completion * (1 - w)).toFixed(4),
    source: w >= 0.8 ? 'measured' : 'blended',
    n: measured.n,
  };
}

export type MetricsRow = {
  id: string;
  formula: string;
  views: number;
  avgViewSec: number;
  durationSec: number;
  retention3s?: number;
};

/**
 * Parse a metrics CSV exported from YouTube Analytics (or written by hand).
 * Required headers: id,views,avg_view_sec,duration_sec[,retention_3s,formula]
 * `formula` may be omitted — it is then resolved from the project's director.json.
 */
export function parseMetricsCsv(csv: string): MetricsRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const idx = (names: string[]): number => header.findIndex((h) => names.includes(h));
  const iId = idx(['id', 'video_id', 'videoid']);
  const iViews = idx(['views', 'view_count']);
  const iAvg = idx(['avg_view_sec', 'average_view_duration', 'avg_view_duration', 'avgviewsec']);
  const iDur = idx(['duration_sec', 'duration', 'length_sec']);
  const iRet = idx(['retention_3s', 'retention3s', 'retention_at_3s']);
  const iFormula = idx(['formula', 'hook_formula']);
  if (iId < 0 || iViews < 0 || iAvg < 0 || iDur < 0) return [];

  const rows: MetricsRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    const views = Number(cells[iViews]);
    const avg = Number(cells[iAvg]);
    const dur = Number(cells[iDur]);
    if (!Number.isFinite(views) || !Number.isFinite(avg) || !Number.isFinite(dur) || dur <= 0) continue;
    rows.push({
      id: cells[iId] ?? '',
      formula: iFormula >= 0 ? (cells[iFormula] ?? '') : '',
      views,
      avgViewSec: avg,
      durationSec: dur,
      retention3s: iRet >= 0 && cells[iRet] ? Number(cells[iRet]) : undefined,
    });
  }
  return rows;
}

/** Fold rows into priors. Views-weighted means, so one viral clip does not get outvoted by noise. */
export function foldPriors(priors: Priors, rows: MetricsRow[], resolveFormula: (id: string) => string | undefined): Priors {
  const buckets = new Map<string, { weights: number; retention: number; completion: number; n: number; rows: number }>();
  for (const row of rows) {
    const formula = row.formula || resolveFormula(row.id);
    if (!formula) continue;
    const completion = Math.max(0, Math.min(1, row.avgViewSec / row.durationSec));
    const retention = row.retention3s ?? Math.max(0, Math.min(1, row.avgViewSec / Math.max(1, Math.min(3, row.durationSec))));
    const w = Math.max(1, row.views);
    const b = buckets.get(formula) ?? { weights: 0, retention: 0, completion: 0, n: 0, rows: 0 };
    b.weights += w;
    b.retention += retention * w;
    b.completion += completion * w;
    b.n += 1;
    b.rows += w;
    buckets.set(formula, b);
  }
  const measured: Prior[] = [...buckets.entries()].map(([formula, b]) => ({
    formula,
    n: b.n,
    retention3s: +(b.retention / b.weights).toFixed(4),
    completion: +(b.completion / b.weights).toFixed(4),
    rows: b.rows,
    updatedAt: new Date().toISOString(),
  }));
  // keep priors for formulas absent from this batch
  const merged = [...priors.measured.filter((m) => !buckets.has(m.formula)), ...measured];
  return { ...priors, measured: merged.sort((a, b) => b.retention3s - a.retention3s) };
}

/** Rank hooks by expected retention. This is what makes A/B actually change the plan. */
export function rankHooks<T extends { formula: string; text: string }>(
  priors: Priors,
  hooks: T[],
): (T & { expected: number; source: 'measured' | 'seed' | 'blended' })[] {
  return hooks
    .map((hook) => {
      const e = expectedRetention(priors, hook.formula);
        return { ...hook, expected: +(e.retention3s * 0.7 + e.completion * 0.3).toFixed(4), source: e.source };
    })
    .sort((a, b) => b.expected - a.expected);
}
