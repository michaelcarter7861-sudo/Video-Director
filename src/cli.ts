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
      console.log(`  review: ${sheet}`);
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
