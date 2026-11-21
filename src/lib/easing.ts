/**
 * Frame-based motion primitives.
 * Everything is a pure function of (frame, fps, duration) — no timers, no state.
 * `f` is the LOCAL frame of a scene (0-based).
 */

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** progress 0..1 from frame f over `dur` frames, offset by `delay` */
export function progress(f: number, dur: number, delay = 0): number {
  return clamp((f - delay) / Math.max(1, dur));
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutBack = (t: number, overshoot = 1.7) => {
  const c = overshoot;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/**
 * Deterministic spring: damped sine arriving at 1.
 * `stiffness` higher = faster settle.
 */
export function spring(f: number, fps = 30, stiffness = 0.28, damping = 7): number {
  const t = f / fps;
  if (t <= 0) return 0;
  return 1 - Math.exp(-damping * t) * Math.cos(stiffness * 18 * t);
}

/** 0..1..0 pulse over `dur` frames starting at `delay` */
export function pulse(f: number, dur: number, delay = 0): number {
  const p = progress(f, dur, delay);
  return Math.sin(p * Math.PI);
}

/** value that holds at 1 after `dur` frames (reveal then stay) */
export function reveal(
  f: number,
  dur: number,
  delay = 0,
  ease: (t: number) => number = easeOutCubic,
): number {
  return ease(progress(f, dur, delay));
}

/** fade in by `inFrames`, hold, fade out by `outFrames` before `endFrame` */
export function inOut(
  f: number,
  endFrame: number,
  inFrames: number,
  outFrames: number,
  ease: (t: number) => number = easeOutCubic,
): number {
  const a = ease(progress(f, inFrames));
  const b = ease(progress(endFrame - f, outFrames));
  return Math.min(a, b);
}

/** deterministic jitter in [-amp, amp], stable per frame+seed */
export function jitter(frame: number, seed: number, amp = 1): number {
  const x = Math.sin(frame * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amp;
}

/** staggered progress for a list of n items */
export function stagger(f: number, i: number, perItem: number, startDelay = 0): number {
  return progress(f, perItem, startDelay + i * perItem);
}
