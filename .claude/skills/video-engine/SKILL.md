---
name: video-engine
description: How to run, debug and extend the deterministic video engine (build/still/sheet/qa). Use before editing src/ or running renders.
---

# Operating the engine

## Commands
```bash
npx tsx src/cli.ts still --spec projects/x/director.json --frame 0   # 1 PNG, ~0.3s — always start here
npx tsx src/cli.ts sheet --spec projects/x/director.json            # 9-frame contact sheet
npx tsx src/cli.ts build --spec projects/x/director.json --draft    # low-crf preview video
npx tsx src/cli.ts build --spec projects/x/director.json            # final + loudness + QA + publish pack
npx tsx src/cli.ts qa --spec projects/x/director.json --file out/x/video.mp4
npx tsx src/cli.ts voice --text "test line"                          # check the TTS chain
npx tsx src/cli.ts plan --spec projects/x/director.json              # timing estimate, no render
npm test                                                             # engine contract tests
```

## Rules for changing the engine
1. **Determinism is sacred.** No `Date.now()`, no `Math.random()`, no network at draw time, no timers.
   Frames must be a pure function of `(spec, frame)`.
2. Colours/fonts come from `src/brand/tokens.ts`. Never hardcode hex in a scene.
3. Captions and layout respect `canvas.safeTop/safeBottom/sideMargin`.
4. A new scene = new file in `src/scenes/`, exported in `src/scenes/index.ts`, plus a payload derivation
   case in `src/pipeline/plan.ts#deriveVisualPayloads`, plus a test.
5. Timing comes from audio (`src/pipeline/plan.ts`). Never derive duration from words alone when audio exists.
6. If QA fails, fix the *cause* (spec content, layout math), never the gate threshold.

## Failure playbook
| symptom | first check |
|---|---|
| scene throws | `DEBUG=1 npx tsx src/cli.ts still ...` — the error names the beat and local frame |
| text overflows | `fitSize` in `kinetic-type.ts` / `fitSplit` in `split.ts`; reduce `onScreen` words |
| captions collide with art | keep scene content above `h * (1 - safeBottom) - 240` |
| frozen-frame gate fails | the global idle-motion layer in `src/engine/render.ts` was bypassed |
| loudness gate fails | `audio.loudnessTargetLufs` in the spec, then re-build (normalise is automatic) |
| TTS unreachable | `voice --text test`; fallback chain is kokoro -> freeapi -> macos -> dummy |
