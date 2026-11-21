/**
 * Scene registry. Adding a visual type = one file + one line here.
 */
import type { Env, SceneFn } from '../engine/types.js';
import type { Visual } from '../schema/director.js';
import { kineticType } from './kinetic-type.js';
import { code } from './code.js';
import { terminal } from './terminal.js';
import { stat } from './stat.js';
import { chart } from './chart.js';
import { diagram } from './diagram.js';
import { split } from './split.js';
import { abstract } from './abstract.js';
import { glitch } from './glitch.js';
import { dotGrid } from './dot-grid.js';
import { timeline } from './timeline.js';
import { quote } from './quote.js';

export const scenes: Record<Visual['type'], SceneFn> = {
  'kinetic-type': kineticType,
  code,
  terminal,
  stat,
  chart,
  diagram,
  split,
  abstract,
  glitch,
  'dot-grid': dotGrid,
  timeline,
  quote,
};

export function getScene(type: Visual['type']): SceneFn {
  const scene = scenes[type];
  if (!scene) throw new Error(`unknown visual type "${type}"`);
  return scene;
}

export type { Env };
