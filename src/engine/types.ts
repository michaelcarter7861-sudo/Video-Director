import type { CanvasSpec, FontPair, Palette } from '../brand/tokens.js';
import type { Beat, Director, Visual } from '../schema/director.js';

export type TimedWord = { word: string; startMs: number; endMs: number; emphasis?: boolean };

export type RenderBeat = {
  id: string;
  role: Beat['role'];
  index: number;
  fromFrame: number;
  durationInFrames: number;
  words: TimedWord[];
  onScreen: string;
  emphasis: string[];
  visual: Visual;
  rehook?: boolean;
  /** measured audio length in ms (0 for silent beats) */
  audioMs: number;
};

export type StyleSpec = {
  templateFamily: string;
  captionStyle: 'karaoke' | 'line' | 'none';
  grain: number;
  vignette: number;
  progressBar: boolean;
};

/** Everything the renderer needs. Written to projects/<id>/render.json */
export type RenderInput = {
  id: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  palette: Palette;
  fonts: FontPair;
  style: StyleSpec;
  beats: RenderBeat[];
  canvas: CanvasSpec;
  /** optional audio file (absolute or project-relative) */
  audioPath?: string;
  /** voice track duration in ms, used for the progress bar */
  audioMs?: number;
};

export type TimingReport = {
  targetSec: number;
  actualSec: number;
  beats: {
    id: string;
    requestedMaxSec: number;
    measuredMs: number;
    finalSec: number;
    capped: boolean;
  }[];
  warnings: string[];
};

export type Env = {
  ctx: import('@napi-rs/canvas').SKRSContext2D;
  width: number;
  height: number;
  palette: Palette;
  fonts: FontPair;
  canvas: CanvasSpec;
  fps: number;
  spec: Director;
  beat: RenderBeat;
  /** local frame inside the beat (0-based) */
  f: number;
  /** total frames of this beat */
  dur: number;
  /** global frame */
  globalFrame: number;
};

export type SceneFn = (env: Env) => void;
