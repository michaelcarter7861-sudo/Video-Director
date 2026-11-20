# Video-Director

**Agent-as-Director, Engine-as-Renderer.** An agent writes a JSON spec; a deterministic, browser-free renderer turns it into a video. No video model, no Remotion, no stock footage, no cloud.

```
claude -p "write director.json for this brief"   →  src/cli.ts build --spec director.json  →  mp4
      (LLM territory)                                  (engine territory: no LLM, repeatable)
```

## Why this engine (and not Remotion)

| | Remotion | **This engine** |
|---|---|---|
| License | source-available, free only for ≤3 employees | **MIT** |
| Render path | headless Chrome (puppeteer) | **`@napi-rs/canvas` → ffmpeg**, no browser |
| Install footprint | Chrome download | ~90 MB of pinned local binaries |
| Determinism | good | **byte-identical frames** (tested) |
| Dependencies at draw time | React/DOM | canvas 2D only |
| Cost | license + infra | **$0** |

What you give up: the React ecosystem (Framer Motion, Recharts, `@remotion/*` components).
What you gain: a renderer you can read in an afternoon, MIT licensing, and no browser in prod.

## Status

Working end-to-end. Phases 1–4 of `docs/02-PLAN.md` are shipped:

- 12 scene types: `kinetic-type`, `code`, `terminal`, `stat`, `chart`, `diagram`, `split`, `abstract`,
  `glitch`, `dot-grid`, `timeline`, `quote`
- 4 template families × 4 palettes × 3 font pairs (OFL fonts vendored via npm)
- `director.json` contract with zod + JSON Schema + structured validation errors (agent repair loop)
- TTS chain: Kokoro (word timings) → FreeLLMAPI → macOS `say` → deterministic dummy voice
- Timing solved from **measured audio**, never from the LLM's guess
- Karaoke captions, word-level, safe-area aware
- Optional music bed: your file or a generated royalty-free bed, sidechain-ducked
- QA gates: duration, resolution, fps, loudness, true peak, black frames, frozen frames, hook timing, visual variety, file size
- Publish pack: titles, description, tags, SRT, license manifest, synthetic-voice disclosure
- Variation engine: one spec → N visibly different videos
- **Distinctness gate**: palette + structure distance across a variant batch (blocks template fatigue)
- **Rules critic**: deterministic pre-flight review that emits appliable patches
  (`claude -p` optional second opinion)
- **Best-frame thumbnails**: contrast / edge-energy / ink-coverage scored, 1280px JPEG
- **Review page**: one self-contained `review.html` — video, QA gates, critic, titles, licences
- **Long → shorts**: re-directed 9:16 excerpts with their own hook and loop, not crops
- Every `build` now emits critic + thumbnail + review page automatically
- 27 tests (determinism, validation, captions, timing, schema parity, scenes, critic, distinctness, shorts)

## Quick start

```bash
npm ci

# 1. feel the visuals in ~1 second (no audio, no video)
npx tsx src/cli.ts sheet --spec examples/demo/director.json

# 2. full render with the built-in deterministic voice (~2 min, offline)
npx tsx src/cli.ts build --spec examples/demo/director.json --voice dummy --music-bed

# 3. real voice with word-level captions (optional, free)
docker compose -f docker-compose.tts.yml up -d
npx tsx src/cli.ts build --spec examples/demo/director.json --voice kokoro

# 4. long-form 16:9
npx tsx src/cli.ts build --spec examples/long/director.json --voice dummy --music-bed

# 5. one brief, four different videos
npx tsx src/cli.ts variants --spec examples/demo/director.json --count 4

# 6. check that the variants actually look different (exit 4 if not)
npx tsx src/cli.ts distinct --ids why-shorts-die-at-2s-v1,why-shorts-die-at-2s-v2,why-shorts-die-at-2s-v3

# 7. one long video -> vertical shorts that stand alone
npx tsx src/cli.ts shorts --spec examples/long/director.json --count 3
npx tsx src/cli.ts build --spec projects/long-form-agent-video-engine-shorts/long-form-agent-video-engine-s1.json --voice dummy

# 8. review everything in a browser (no server, relative paths only)
open out/why-shorts-die-at-2s/review.html
```

Outputs land in `out/<id>/`: `video.mp4`, `contact-sheet.png`, `thumb.png`, `thumb.jpg`, `review.html`, `stills/`.
Project artefacts land in `projects/<id>/`: `director.json`, `render.json`, `timing.json`, `qa.json`,
`publish.json`, `manifest.json`, `captions.srt`, `critique.json`, `director.patched.json`.

## Commands

```
spec     --brief <file> [--out <file>]        validate a spec (the agent writes it)
plan     --spec <file>                        timing estimate, no render
still    --spec <file> --frame <n>            one PNG — cheapest feedback loop
sheet    --spec <file>                        contact sheet of 9 frames
build    --spec <file> [--draft] [--voice p] [--music <file> | --music-bed]
variants --spec <file> [--count N] [--draft]  variation engine
critique --spec <file> [--llm] [--apply]      rules critic (+ optional Claude Code pass)
distinct --ids a,b,c                          distinctness gate across built variants
shorts   --spec <long.json> [--count N]       long-form → N standalone vertical shorts
thumb    --spec <file>                        best thumbnail frame → PNG + JPG
review   --spec <file> [--distinct a,b]       static review page
voice    --text "<line>"                      probe the TTS chain
qa       --spec <file> --file <mp4>           re-run gates on an existing render
inspect  <file.mp4>                           probe any video
```

## The contract

`director.json` is the only interface between the agent and the engine.
Schema: `schemas/director.schema.json` (for agents) mirrored by `src/schema/director.ts` (zod, runtime).

```jsonc
{
  "specVersion": "1.0",
  "id": "why-shorts-die-at-2s",
  "format": "short",              // short | long
  "aspect": "9:16",               // 9:16 | 16:9 | 1:1
  "thesis": "one sentence that the whole video proves",
  "originality": { "uniqueInput": "the data/test/experience behind it" },
  "hooks": [{ "id": "h1", "text": "...", "formula": "interrupt" }],
  "beats": [
    { "id": "hook", "role": "hook", "vo": "spoken line", "onScreen": "<=5 words",
      "maxSec": 3, "visual": { "type": "kinetic-type", "motion": "slam" } }
  ],
  "style": { "templateFamily": "kinetic-doc", "variationSeed": 1247 },
  "audio": { "voice": "af_heart", "loudnessTargetLufs": -14 }
}
```

Rules the engine enforces (and reports, so an agent can repair itself):
`beats[0].role === "hook"` · last beat `loop` · no repeated consecutive visual · `onScreen` ≤ 5 words ·
`maxSec` is a **cap** — measured audio always wins and the extension is reported.

## Agent layer (`.claude/`)

- `settings.json` — `dontAsk` mode with an explicit allowlist, `ask` on `git push`, deny on secrets/`rm -rf`/force-push; a `PreToolUse` guard hook that also holds under bypass mode.
- `skills/director-spec` — how to write and repair a spec (enum lists, beat skeleton, hard rules).
- `skills/viral-structure` — hook formulas, pacing, rejection criteria.
- `skills/video-engine` — how to run/debug/extend the engine; determinism rules.
- `agents/director.md`, `agents/fixer.md` — the two subagents that do the work.

That is the "agent works freely, permissions always yes" setup: **yes by allowlist, no by deny-list + hook**, so a bad command still stops.

## Layout

```
src/
  cli.ts                 entrypoint (spec | plan | still | sheet | build | variants | critique |
                         distinct | shorts | thumb | review | voice | qa | inspect)
  schema/director.ts     zod contract + structured validation
  brand/tokens.ts        palettes, font pairs, template families, canvases
  lib/                   rng, easing, fonts, wav, ffmpeg resolution
  engine/                draw helpers, captions, compositor (render.ts), types
  scenes/                12 scene modules + registry
  pipeline/              tts, plan (timing), audio (music/ducking), qa, publish, variants,
                         critic, distinct, thumbnail, review, shorts
tests/                   27 contract tests
examples/                short (9:16) + long (16:9) specs
docs/                    research, architecture, roadmap, setup, prompts, workflows
```

## Docs

Start with `docs/08-PHASE1-SCAFFOLD.md` (what this code implements), `docs/10-PHASE4-REVIEW.md` (critic, distinctness, shorts), then
`docs/01-ARCHITECTURE.md` (design), `docs/05-SETUP-CHECKLIST.md` (agent wiring),
`docs/03-REPO-CATALOGUE.md` (which repos to pin vs read), `docs/06-AGENT-PROMPTS.md` (prompt drafts).

## Honest limits

- "Viral" is not guaranteed. This gives you volume, structure, and measurement — not luck.
- Rendering is CPU-bound: a 30s 1080×1920 short takes ~2 min on 2 cores. Long-form wants CI or a bigger box.
- The dummy voice is a **test tone**, not a narrator. Use Kokoro for anything a human watches.
- No stock footage and no AI video: the look is motion-graphics. That is a design choice, not a shortcoming.
- `critiqueWithLLM` is the only part of the critic that needs the `claude` CLI; without it the rules layer
  still runs and the build is never blocked.
- The distinctness threshold (0.18 avg palette+structure distance) was calibrated on this repo's demos.
  If your batch is a single template family, expect it to fail until you change palette *and* opening shot.
- Free-model agents are less reliable than frontier ones — which is exactly why the engine never depends on them.
