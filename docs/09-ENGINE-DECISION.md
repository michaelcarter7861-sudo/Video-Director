# 09 — Why the engine changed: Remotion → MIT canvas renderer

**Trigger:** you said you don't want to pay for Remotion.
**Date decided:** 2026-11-20.

## The constraint

Remotion is *source-available*, not open source. The Free License covers individuals, non-profits, and
for-profit companies of **up to 3 employees** — commercial output included. Above that: $25/seat/month
(Creators) or $0.01/render with a $100/month minimum (Automators). If the channel grows into a company,
that is a real bill attached to your video pipeline.

## Options we evaluated

| Option | License | Render path | Verdict |
|---|---|---|---|
| Remotion | source-available, paid >3 people | headless Chrome | rejected on licence + browser weight |
| **Revideo 0.11** (`@revideo/{core,2d,renderer}`) | **MIT** | headless Chrome (puppeteer) | viable, but drags a browser + Vite + mathjax; render pipeline is opaque |
| **Motion Canvas** | MIT | browser-based | editor-first, not a headless factory |
| HyperFrames (HeyGen) | Apache-2.0 | HTML/CSS/GSAP | young ecosystem, still a browser |
| **`@napi-rs/canvas` + ffmpeg** | **MIT + LGPL binaries** | **no browser at all** | **chosen** |

## Why the canvas renderer won

1. **Zero licence risk.** MIT code, LGPL ffmpeg invoked as a separate process (not linked).
2. **No browser in the loop.** `@napi-rs/canvas` is a native Skia binding; one process, no Chrome download, no
   memory spikes, works on a 2-core CI runner. This sandbox has no Chrome and it still renders.
3. **Readable.** `src/engine/render.ts` is the whole compositor: pick the beat, call the scene, wrap in idle
   motion, draw captions, stream PNG into ffmpeg. An agent can hold the whole file in context.
4. **Byte-identical determinism**, which is now a test rather than a promise: no DOM, no fonts loading races,
   no timers. `Rng` + `variationSeed` replace `Math.random`.
5. **Vendored OFL fonts via npm** (`@fontsource/*`) — no network at draw time, no CDN dependency.

## What this costs us

- No React ecosystem. Framer Motion, Recharts, `@remotion/*` are out. Charts, diagrams and code highlighting
  are hand-drawn in `src/scenes/` — which is also why they are deterministic and tiny.
- No audio-reactive `useVideoConfig` niceties; timing is solved in `src/pipeline/plan.ts` instead.
- Typography work is manual (`fitSize`/`fitSplit`/tracking helpers).

## What carried over from the Remotion plan

The architecture in `docs/01-ARCHITECTURE.md` is unchanged where it matters: **agent writes a spec, engine
renders deterministically**. `director.json`, the 8 visual types, template families, variation seeds, QA
gates, publish pack — all identical. Remotion was the *renderer*; the director/engine split was the actual idea.

## If you later want Remotion back

The spec format is renderer-agnostic. A Remotion implementation would be a second target:
`renderInput` (see `src/engine/types.ts`) maps 1:1 onto Remotion `<Sequence>`s, and `render.json` is exactly
the props object a Remotion composition would take. Switch cost: one renderer module, not a rewrite.
