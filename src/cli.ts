#!/usr/bin/env node
/**
 * CLI. Two halves:
 *   spec  : agent/LLM territory (writes director.json)
 *   build : engine territory   (no LLM, deterministic, repeatable)
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateDirector, type Director } from './schema/director.js';
import { buildProject, deriveVisualPayloads, estimatePlan } from './pipeline/plan.js';
import { renderVideo, renderStill, renderContactSheet, pickFrames } from './engine/render.js';
import { runQa, normalizeLoudness } from './pipeline/qa.js';
import { mixMusic, synthMusicBed } from './pipeline/audio.js';
import { buildPublishPack, writePublishPack } from './pipeline/publish.js';
import { planVariants, applyVariant } from './pipeline/variants.js';
import { critiqueRules, critiqueWithLLM, writeCritique, applyPatches } from './pipeline/critic.js';
import { bestThumbnail, scoreFrame } from './pipeline/thumbnail.js';
import { writeReviewPage } from './pipeline/review.js';
import { shortsFromLong, saveShorts, pickWindows } from './pipeline/shorts.js';
import { stillHashes, compareVariants, type Hash } from './pipeline/distinct.js';
import { synthesize, type PreferProvider } from './pipeline/tts.js';
import { ffmpegPath } from './lib/ffmpeg.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = process.cwd();
const PROJECTS = path.join(ROOT, 'projects');
const OUT = path.join(ROOT, 'out');

const log = (msg: string) => console.log(`· ${msg}`);

function usage(): never {
  console.log(`
video-director — deterministic video engine (no Remotion, no video model)

  spec    --brief <file>  [--out <file>]             validate a director.json (agent writes it)
  variants --spec <file> [--count N] [--draft]        one spec -> N visibly different videos
  critique --spec <file> [--llm]                     rules critic (+ optional Claude Code pass)
  shorts   --spec <long.json> [--count N]            long-form -> N vertical shorts (re-directed)
  distinct --ids a,b,c                               aHash distinctness gate across built variants
  thumb    --spec <file>                             best thumbnail frame -> PNG + JPG
  review   --spec <file> [--distinct a,b]           static review page (video, qa, critic, titles)
  plan    --spec <file>                              timing estimate before you spend a render
  build   --spec <file> [--draft] [--voice <p>]       spec -> voice -> timeline -> render -> qa -> publish
  still   --spec <file> --frame <n>                  one PNG (cheapest feedback)
  sheet   --spec <file>                              contact sheet PNG of 9 stills
  voice   --text "<line>" [--voice af_heart]         test the TTS chain
  qa      --file <mp4> --spec <file>                 re-run QA gates on an existing render
  inspect <file.mp4>                                 probe any video

voice providers: auto | kokoro | freeapi | macos | dummy   (default: auto)
`);
  process.exit(1);
}

async function readSpec(specPath: string): Promise<Director> {
  const raw = JSON.parse(fs.readFileSync(specPath, 'utf8')) as unknown;
  const result = validateDirector(raw);
  if (!result.ok) {
    console.error('✗ spec invalid:');
    for (const issue of result.issues) console.error(`  [${issue.code}] ${issue.path}: ${issue.message} → ${issue.fix}`);
    process.exit(2);
  }
  for (const w of result.warnings) console.warn(`  ! ${w.path}: ${w.message} → ${w.fix}`);
  return result.spec;
}

function projectDirFor(spec: Director): string {
  const dir = path.join(PROJECTS, spec.id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();

  const { values } = parseArgs({
    args: rest,
    options: {
      brief: { type: 'string' },
      spec: { type: 'string' },
      out: { type: 'string' },
      frame: { type: 'string' },
      file: { type: 'string' },
      text: { type: 'string' },
      voice: { type: 'string' },
      draft: { type: 'boolean', default: false },
      count: { type: 'string' },
      music: { type: 'string' },
      'music-bed': { type: 'boolean', default: false },
      llm: { type: 'boolean', default: false },
      ids: { type: 'string' },
      distinct: { type: 'string' },
      apply: { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  switch (command) {
    case 'spec': {
      if (!values.brief) usage();
      const out = values.out ?? path.join(PROJECTS, 'draft', 'director.json');
      if (fs.existsSync(values.brief)) {
        const raw = JSON.parse(fs.readFileSync(values.brief, 'utf8')) as unknown;
        const result = validateDirector(raw);
        if (!result.ok) {
          for (const issue of result.issues) console.error(`  [${issue.code}] ${issue.path}: ${issue.message} → ${issue.fix}`);
          process.exit(2);
        }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(result.spec, null, 2));
        console.log(`✓ validated spec → ${out}`);
        for (const w of result.warnings) console.warn(`  ! ${w.path}: ${w.message}`);
      } else {
        console.log('This command validates an existing spec file. The *writing* is the agent step:');
        console.log('  claude -p "read briefs/x.json, write projects/x/director.json per .claude/skills/director-spec"');
      }
      break;
    }

    case 'plan': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const plan = estimatePlan(spec);
      console.table(plan.beats);
      console.log(`target ${plan.targetSec}s · estimated ${plan.actualSec}s`);
      break;
    }

    case 'voice': {
      if (!values.text) usage();
      const dir = path.join(OUT, 'tts-test');
      fs.mkdirSync(dir, { recursive: true });
      const result = await synthesize(
        { text: values.text, outWav: path.join(dir, 'test.wav'), voice: values.voice ?? 'af_heart', speed: 1, lang: 'en' },
        (values.voice === 'dummy' ? 'dummy' : 'auto') as PreferProvider,
      );
      console.log(`✓ ${result.provider} → ${result.wavPath} (${(result.durationMs / 1000).toFixed(2)}s, ${result.words.length} words, exact=${result.exact})`);
      break;
    }

    case 'still':
    case 'sheet': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const dir = projectDirFor(spec);
      const withPayloads = deriveVisualPayloads(spec);
      fs.writeFileSync(path.join(dir, 'director.json'), JSON.stringify(withPayloads, null, 2));
      const built = await buildProject(withPayloads, { projectDir: dir, voice: 'dummy', log: values.quiet ? undefined : log });
      const inputPath = path.join(dir, 'render.json');
      fs.writeFileSync(inputPath, JSON.stringify(built.renderInput, null, 2));
      if (command === 'still') {
        const frame = Number(values.frame ?? 0);
        const out = path.join(OUT, spec.id, `still-${frame}.png`);
        renderStill(built.renderInput, frame, out);
        console.log(`✓ ${out}`);
      } else {
        const out = path.join(OUT, spec.id, 'contact-sheet.png');
        renderContactSheet(built.renderInput, out);
        console.log(`✓ ${out}`);
      }
      break;
    }

    case 'build': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const dir = projectDirFor(spec);
      const started = Date.now();
      const withPayloads = deriveVisualPayloads(spec);
      fs.writeFileSync(path.join(dir, 'director.json'), JSON.stringify(withPayloads, null, 2));

      if (!values.quiet) log('voice + timeline…');
      const built = await buildProject(withPayloads, {
        projectDir: dir,
        voice: (values.voice as PreferProvider) ?? 'auto',
        log: values.quiet ? undefined : log,
      });
      fs.writeFileSync(path.join(dir, 'render.json'), JSON.stringify(built.renderInput, null, 2));
      fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify(built.report, null, 2));

      // optional music bed: file from the spec or a generated royalty-free bed
      let audioForRender = built.renderInput.audioPath;
      if (audioForRender && (values.music || values['music-bed'])) {
        const musicFile = values.music ?? (await synthMusicBed({
          outFile: path.join(dir, 'music-bed.wav'),
          seconds: built.renderInput.totalFrames / built.renderInput.fps + 1,
          bpm: 96,
        }));
        const mixed = path.join(dir, 'mix.wav');
        await mixMusic({
          voiceWav: audioForRender,
          musicFile,
          outWav: mixed,
          musicGainDb: -20,
          duckDb: withPayloads.audio.duckDb,
        });
        audioForRender = mixed;
        if (!values.quiet) log(`music mixed (${values.music ? 'file' : 'generated bed'})`);
      }
      built.renderInput.audioPath = audioForRender;

      const draft = Boolean(values.draft);
      const rawOut = path.join(OUT, spec.id, draft ? 'draft.mp4' : 'raw.mp4');
      if (!values.quiet) log(`rendering ${built.renderInput.totalFrames} frames…`);
      let lastPct = -1;
      await renderVideo(built.renderInput, {
        outFile: rawOut,
        quality: draft ? 'draft' : 'final',
        onProgress: (done, total) => {
          const pct = Math.floor((done / total) * 100);
          if (pct !== lastPct && pct % 10 === 0) {
            lastPct = pct;
            if (!values.quiet) process.stdout.write(`  ${pct}%\r`);
          }
        },
      });

      const finalOut = path.join(OUT, spec.id, 'video.mp4');
      if (!values.quiet) log('loudness normalise…');
      await normalizeLoudness(rawOut, finalOut, withPayloads.audio.loudnessTargetLufs);
      fs.rmSync(rawOut, { force: true });

      if (!values.quiet) log('qa…');
      const qa = await runQa(finalOut, built.renderInput, { targetLufs: withPayloads.audio.loudnessTargetLufs });
      fs.writeFileSync(path.join(dir, 'qa.json'), JSON.stringify(qa, null, 2));
      const sheet = path.join(OUT, spec.id, 'contact-sheet.png');
      renderContactSheet(built.renderInput, sheet);
      renderStill(built.renderInput, 0, path.join(OUT, spec.id, 'thumb.png'));

      const pack = buildPublishPack(withPayloads, built.report, JSON.parse(fs.readFileSync(built.wordsPath, 'utf8')) as never);
      writePublishPack(pack, dir);

      // critic (rules layer — free, deterministic) + thumbnail + review page
      const critique = critiqueRules(withPayloads, built.renderInput, built.report);
      writeCritique(critique, dir);
      const thumb = await bestThumbnail(built.renderInput, path.join(OUT, spec.id));
      const stillsRel: string[] = [];
      for (const frame of pickFrames(built.renderInput.totalFrames, 6)) {
        const file = path.join(OUT, spec.id, 'stills', `f${frame}.png`);
        renderStill(built.renderInput, frame, file);
        stillsRel.push(path.relative(path.join(OUT, spec.id), file));
      }
      const reviewFile = writeReviewPage({
        spec: withPayloads,
        timing: built.report,
        qa,
        critique,
        publish: pack,
        videoRelPath: 'video.mp4',
        stillsRel,
        thumbRel: path.relative(path.join(OUT, spec.id), thumb.jpg),
        outFile: path.join(OUT, spec.id, 'review.html'),
      });

      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`\n✓ ${finalOut}  (${built.report.actualSec}s, ${secs}s wall)`);
      console.log(`  qa: ${qa.pass ? 'PASS' : 'FAIL'}`);
      for (const gate of qa.gates) {
        console.log(`   ${gate.pass ? '✓' : '✗'} ${gate.label}: ${gate.value} (want ${gate.expected})`);
      }
      if (built.report.warnings.length) {
        console.log('  warnings:');
        for (const warn of built.report.warnings) console.log(`   ! ${warn}`);
      }
      console.log(`  critic: ${critique.verdict} (${critique.issues.length} issue${critique.issues.length === 1 ? '' : 's'})`);
      for (const issue of critique.issues) console.log(`   [${issue.severity}] ${issue.beatId}: ${issue.problem}`);
      console.log(`  thumb:  ${thumb.jpg} (frame ${thumb.frame}, score ${thumb.score})`);
      console.log(`  sheet:  ${sheet}`);
      if (!values.quiet) console.log(`  review: ${reviewFile}`);
      process.exit(qa.pass ? 0 : 3);
      break;
    }

    case 'variants': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const count = Math.max(1, Math.min(10, Number(values.count ?? 3)));
      const plans = planVariants(spec, count);
      console.log('variant plan:');
      console.table(plans.map((p) => ({ id: p.id, family: p.templateFamily, palette: p.paletteHint, fonts: p.fontsHint, hook: p.hookId, caption: p.captionStyle, motion: p.motion })));
      for (const plan of plans) {
        const variantSpec = applyVariant(spec, plan);
        const dir = projectDirFor(variantSpec);
        fs.writeFileSync(path.join(dir, 'director.json'), JSON.stringify(variantSpec, null, 2));
        const withPayloads = deriveVisualPayloads(variantSpec);
        const built = await buildProject(withPayloads, { projectDir: dir, voice: (values.voice as PreferProvider) ?? 'dummy' });
        fs.writeFileSync(path.join(dir, 'render.json'), JSON.stringify(built.renderInput, null, 2));
        const sheet = path.join(OUT, variantSpec.id, 'contact-sheet.png');
        renderContactSheet(built.renderInput, sheet);
        if (values.draft) {
          const out = path.join(OUT, variantSpec.id, 'draft.mp4');
          await renderVideo(built.renderInput, { outFile: out, quality: 'draft' });
          console.log(`  ✓ ${variantSpec.id} → ${out}`);
        } else {
          console.log(`  ✓ ${variantSpec.id} → ${sheet}`);
        }
      }
      break;
    }

    case 'critique': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const dir = projectDirFor(spec);
      const renderPath = path.join(dir, 'render.json');
      if (!fs.existsSync(renderPath)) {
        console.error('no render.json — run build (or sheet) first');
        process.exit(2);
      }
      const input = JSON.parse(fs.readFileSync(renderPath, 'utf8'));
      const timing = JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8'));
      const rules = critiqueRules(spec, input, timing);
      let critique = rules;
      if (values.llm) {
        const stillsDir = path.join(OUT, spec.id, 'stills');
        for (const frame of pickFrames(input.totalFrames, 6)) {
          renderStill(input, frame, path.join(stillsDir, `f${frame}.png`));
        }
        const llm = await critiqueWithLLM(spec, input, stillsDir);
        if (llm) {
          critique = {
            ...llm,
            source: 'rules+llm',
            issues: [...rules.issues, ...llm.issues],
            patches: [...rules.patches, ...llm.patches],
            notes: [...new Set([...rules.notes, ...llm.notes])],
            verdict: rules.verdict === 'patch' || llm.verdict === 'patch' ? 'patch' : 'ship',
          };
        } else {
          console.log('  (claude CLI unavailable — rules critique only)');
        }
      }
      const file = writeCritique(critique, dir);
      console.log(`✓ ${file}`);
      console.log(`  verdict: ${critique.verdict} (${critique.source})`);
      for (const issue of critique.issues) console.log(`   [${issue.severity}] ${issue.beatId}: ${issue.problem}`);
      for (const patch of critique.patches) console.log(`   patch ${patch.beatId}.${patch.field}: ${patch.from} → ${patch.to}`);
      for (const note of critique.notes) console.log(`   note: ${note}`);
      if (values.apply && critique.patches.length > 0) {
        const patched = applyPatches(spec, critique.patches);
        fs.writeFileSync(path.join(dir, 'director.patched.json'), JSON.stringify(patched, null, 2));
        console.log(`  patched spec → ${path.join(dir, 'director.patched.json')}`);
      }
      break;
    }

    case 'shorts': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const dir = projectDirFor(spec);
      const renderPath = path.join(dir, 'render.json');
      if (!fs.existsSync(renderPath)) {
        console.error('build the long video first (it needs the render timeline)');
        process.exit(2);
      }
      const input = JSON.parse(fs.readFileSync(renderPath, 'utf8'));
      const count = Math.max(1, Math.min(6, Number(values.count ?? 3)));
      const windows = pickWindows(spec, input, count);
      console.log('selected windows:');
      console.table(windows.map((w) => ({ start: w.startSec, end: w.endSec, score: w.score, hook: w.hookLine.slice(0, 48) })));
      const shorts = shortsFromLong(spec, input, count);
      const files = saveShorts(shorts, path.join(ROOT, 'projects', `${spec.id}-shorts`));
      for (const file of files) console.log(`  ✓ ${file}`);
      console.log('  next: npx tsx src/cli.ts build --spec <file> --voice kokoro');
      break;
    }

    case 'distinct': {
      if (!values.ids) usage();
      const ids = values.ids.split(',').map((s) => s.trim()).filter(Boolean);
      const hashes: Hash[] = [];
      const hashDir = path.join(OUT, '_hashes');
      for (const id of ids) {
        const renderPath = path.join(PROJECTS, id, 'render.json');
        if (!fs.existsSync(renderPath)) {
          console.error(`no render.json for ${id} — run sheet for it first`);
          process.exit(2);
        }
        const input = JSON.parse(fs.readFileSync(renderPath, 'utf8'));
        hashes.push(await stillHashes(input, hashDir, 5));
      }
      const report = compareVariants(hashes);
      fs.writeFileSync(path.join(OUT, '_hashes', 'distinctness.json'), JSON.stringify(report, null, 2));
      console.table(report.pairs.map((p) => ({ a: p.a, b: p.b, distance: p.distance, structure: p.structureOnly, distinct: p.distinct })));
      for (const advice of report.advice) console.log(`  ! ${advice}`);
      console.log(report.pass ? '✓ distinct' : '✗ too similar');
      process.exit(report.pass ? 0 : 4);
      break;
    }

    case 'thumb': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const input = JSON.parse(fs.readFileSync(path.join(projectDirFor(spec), 'render.json'), 'utf8'));
      const thumb = await bestThumbnail(input, path.join(OUT, spec.id));
      console.log(`✓ frame ${thumb.frame} (score ${thumb.score}) → ${thumb.jpg}`);
      break;
    }

    case 'review': {
      if (!values.spec) usage();
      const spec = await readSpec(values.spec);
      const dir = projectDirFor(spec);
      const read = (name: string) => {
        const file = path.join(dir, name);
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      };
      const input = read('render.json');
      const timing = read('timing.json');
      const qa = read('qa.json');
      if (!input || !timing || !qa) {
        console.error('missing render/timing/qa — run build first');
        process.exit(2);
      }
      const critique = read('critique.json');
      const publish = read('publish.json');
      const stillsDir = path.join(OUT, spec.id, 'stills');
      const stills: string[] = [];
      for (const frame of pickFrames(input.totalFrames, 6)) {
        const file = path.join(stillsDir, `f${frame}.png`);
        if (!fs.existsSync(file)) renderStill(input, frame, file);
        stills.push(path.relative(path.join(OUT, spec.id), file));
      }
      const distinctness = values.distinct
        ? compareVariants(
            await Promise.all(
              values.distinct.split(',').map(async (id) => {
                const other = JSON.parse(fs.readFileSync(path.join(PROJECTS, id.trim(), 'render.json'), 'utf8'));
                return stillHashes(other, path.join(OUT, '_hashes'), 4);
              }),
            ),
          )
        : undefined;
      const outFile = path.join(OUT, spec.id, 'review.html');
      writeReviewPage({
        spec,
        timing,
        qa,
        critique,
        publish,
        videoRelPath: 'video.mp4',
        stillsRel: stills,
        thumbRel: fs.existsSync(path.join(OUT, spec.id, 'thumb.jpg')) ? 'thumb.jpg' : undefined,
        distinctness,
        outFile,
      });
      console.log(`✓ ${outFile}`);
      break;
    }

    case 'qa': {
      if (!values.file || !values.spec) usage();
      const spec = await readSpec(values.spec);
      const dir = projectDirFor(spec);
      const renderPath = path.join(dir, 'render.json');
      if (!fs.existsSync(renderPath)) {
        console.error('no render.json — run build first');
        process.exit(2);
      }
      const input = JSON.parse(fs.readFileSync(renderPath, 'utf8'));
      const report = await runQa(values.file, input, { targetLufs: spec.audio.loudnessTargetLufs });
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.pass ? 0 : 3);
      break;
    }

    case 'inspect': {
      const file = rest[0];
      if (!file) usage();
      const { stdout } = await run(ffmpegPath(), ['-i', file, '-hide_banner'], { }).catch((e: { stderr: string }) => ({ stdout: '', stderr: e.stderr }));
      console.log(stdout || '');
      break;
    }

    default:
      usage();
  }
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
