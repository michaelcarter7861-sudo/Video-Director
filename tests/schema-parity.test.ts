/**
 * The JSON Schema (for agents) and the zod schema (for the runtime) must accept the same demo spec.
 * This test is the sync alarm between the two.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DirectorSchema, VISUAL_TYPES, BEAT_ROLES, HOOK_FORMULAS, MOTIONS } from '../src/schema/director.js';

const jsonSchema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'schemas', 'director.schema.json'), 'utf8')) as {
  properties: {
    beats: { items: { properties: { role: { enum: string[] }; visual: { properties: { type: { enum: string[] }; motion: { enum: string[] } } } } } };
    hooks: { items: { properties: { formula: { enum: string[] } } } };
  };
};

const demo = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'examples', 'demo', 'director.json'), 'utf8'));

test('zod accepts the demo', () => {
  assert.equal(DirectorSchema.safeParse(demo).success, true);
});

test('enum lists match between zod and json schema', () => {
  const s = jsonSchema.properties;
  assert.deepEqual(s.beats.items.properties.role.enum, [...BEAT_ROLES]);
  assert.deepEqual(s.beats.items.properties.visual.properties.type.enum, [...VISUAL_TYPES]);
  assert.deepEqual(s.beats.items.properties.visual.properties.motion.enum, [...MOTIONS]);
  assert.deepEqual(s.hooks.items.properties.formula.enum, [...HOOK_FORMULAS]);
});

test('json schema documents every visual type the engine implements', () => {
  const enumTypes = jsonSchema.properties.beats.items.properties.visual.properties.type.enum;
  const sceneFiles = fs.readdirSync(path.join(process.cwd(), 'src', 'scenes')).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  assert.ok(sceneFiles.length >= VISUAL_TYPES.length, `expected >= ${VISUAL_TYPES.length} scene files, found ${sceneFiles.length}`);
  for (const t of VISUAL_TYPES) assert.ok(enumTypes.includes(t), `json schema missing visual type ${t}`);
});
