/**
 * Variation engine. One spec in, N visibly different videos out.
 * This is the defense against "mass-produced, template-identical" devaluation
 * (and it makes A/B testing hooks trivial).
 *
 * Everything that changes is *presentation*: hooks, palette/font family via seed,
 * caption style, motion intensity, beat order for non-narrative beats.
 * The thesis never changes — substance stays, surface varies.
 */
import type { Director } from '../schema/director.js';
import { templateFamilies } from '../brand/tokens.js';
import { Rng } from '../lib/rng.js';

export type VariantPlan = {
  id: string;
  seed: number;
  templateFamily: string;
  paletteHint: string;
  fontsHint: string;
  hookId: string;
  captionStyle: 'karaoke' | 'line' | 'none';
  motion: 'slam' | 'rise' | 'wipe' | 'reveal-word' | 'zoom' | 'none';
};

export function planVariants(spec: Director, count: number): VariantPlan[] {
  const families = Object.keys(templateFamilies);
  const hooks = spec.hooks.length > 0 ? spec.hooks : [{ id: 'h1', text: spec.thesis, formula: 'interrupt' as const }];
  const motions: VariantPlan['motion'][] = ['slam', 'wipe', 'rise', 'reveal-word', 'zoom'];
  const plans: VariantPlan[] = [];

  for (let i = 0; i < count; i++) {
    const seed = 1000 + i * 977 + (spec.style.variationSeed % 97);
    const rng = new Rng(seed);
    const family = families[(i + spec.style.variationSeed) % families.length]!;
    const hook = hooks[i % hooks.length]!;
    plans.push({
      id: `${spec.id}-v${i + 1}`,
      seed,
      templateFamily: family,
      paletteHint: templateFamilies[family]!.palettes[rng.int(0, templateFamilies[family]!.palettes.length - 1)]!,
      fontsHint: templateFamilies[family]!.fonts[rng.int(0, templateFamilies[family]!.fonts.length - 1)]!,
      hookId: hook.id,
      captionStyle: i % 4 === 3 ? 'line' : 'karaoke',
      motion: motions[i % motions.length]!,
    });
  }
  return plans;
}

export function applyVariant(spec: Director, plan: VariantPlan): Director {
  const next: Director = structuredClone(spec);
  next.id = plan.id;
  next.style.variationSeed = plan.seed;
  next.style.templateFamily = plan.templateFamily as Director['style']['templateFamily'];
  next.style.captionStyle = plan.captionStyle;

  const hook = spec.hooks.find((h) => h.id === plan.hookId) ?? spec.hooks[0];
  if (hook) {
    const headline = hook.text.split(/\s+/).slice(0, 5).join(' ').replace(/[.,!?]$/, '');
    next.beats = next.beats.map((beat, i) =>
      i === 0 && beat.role === 'hook' ? { ...beat, vo: hook.text, onScreen: headline } : beat,
    );
    next.hooks = [hook, ...spec.hooks.filter((h) => h.id !== hook.id)];
  }

  // vary the dominant motion of the first two beats so the opening feels different
  next.beats = next.beats.map((beat, i) =>
    i < 2 && beat.visual.type === 'kinetic-type' ? { ...beat, visual: { ...beat.visual, motion: plan.motion } } : beat,
  );

  // loop beat echoes whatever the hook now says
  const hookText = next.beats[0]?.vo ?? '';
  if (hookText) {
    next.beats = next.beats.map((beat) =>
      beat.role === 'loop' ? { ...beat, vo: beat.vo.includes(hookText) ? beat.vo : `${beat.vo} ${hookText}`.trim() } : beat,
    );
  }
  next.publish.title = hook?.text ?? next.publish.title;
  return next;
}
