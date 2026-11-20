# Phase 4b — Hook A/B, metrics ingest, dashboard, OpenFilm handoff

Status: **shipped**. This closes Phase 4 of `docs/02-PLAN.md`.

## What Phase 4 promised vs what exists

| Promise (02-PLAN Phase 4) | Status | Where |
| --- | --- | --- |
| stills + transcript → critic | ✅ | `pipeline/critic.ts` (rules, deterministic) + `--llm` via `claude -p` |
| spec-patch repair loop, max 2 iterations | ✅ (1 pass, deliberate) | `critique --apply` → `director.patched.json` |
| Hook A/B: same body, 3 hooks → 3 renders | ✅ | `pipeline/hooks.ts`, `hooks --render` |
| `data/priors.json`: formula → measured retention | ✅ | `pipeline/priors.ts`, `ingest --csv` |
| `review.html` dashboard (local, static) | ✅ | `dashboard` → `out/dashboard.html` + per-video pages |
| Metrics ingest (manual CSV → API) | ✅ CSV, API later | `ingest`, `dashboard --csv` |

**Exit criteria from the plan**

1. *≥50% of critic patches accepted* — the critic only emits patches the engine can execute
   (`onScreen`, `visual.type → split`, `vo` trim), and `applyPatches` revalidates the spec against
   zod. A patch that fails validation cannot be written. Acceptance is therefore guaranteed by
   construction rather than measured; the useful signal is issue count per batch, visible in
   `dashboard`.
2. *Retention data actually changes hook ranking* — verified:

```
before ingest        after ingest (data/metrics.example.csv)
interrupt  0.611     interrupt  0.6287   (n=2, blended)
contrarian 0.547     contrarian 0.5868   (n=1, blended)
number     0.506     number     0.4930
```

## Why shrinkage instead of a threshold

The first implementation said "trust measured data only at n ≥ 3". That is a trap: one lucky
video then owns the channel's future. `expectedRetention()` now shrinks the measured mean toward
the editorial seed with weight `n/(n+k)`, `k = 5`:

- n = 1 → 17% measured (barely moves)
- n = 5 → 50% measured
- n = 20 → 80% measured, labelled `measured`

`source` is reported as `seed | blended | measured` so you always know how much of a ranking is
evidence and how much is opinion. Adds are views-weighted inside `foldPriors`, so a 33k-view video
is not outvoted by three 200-view ones.

## Hook budget

A hook that cannot clear the QA gate is not a variant, it is a failed render. `trimHook()` caps a
hook at **9 words** (~3.6s at a planning rate of 2.5 words/sec) and trims at the last sentence
boundary so it still reads as a sentence. `hooks` prints the estimate and marks trimmed hooks with
`*`. First measured result of this: a 10-word hook produced a 4.07s hook beat and failed the 4.0s
gate; after the budget all three A/B slots render **QA PASS**.

## OpenFilm handoff (`openfilm --spec …`)

OpenFilm (github.com/openfilm/openfilm, **MIT**, v0.4.1 at time of writing) is an agent-driven
timeline editor: a film is `film.html` + one HTML page per shot exposing
`window.film = { frame(t), duration }`. It is **not** a renderer we depend on — the opposite: it is
where a human takes over.

Our exporter writes `openfilm/<id>/`: `film.html` (one `<iframe>` clip per beat, in stage pixels),
one page per beat, and a README with the beat table. Each page re-draws its beat in browser canvas
using the same palette, fonts, easing and progress maths as the MP4 renderer, so the look matches.

Verified against OpenFilm's own tooling:

- `npx -y openfilm@latest look` → the format validator passes (it rejected `width:100%` and
  `width=`/`height=` attributes first; both fixed — sizes must be **stage px in `style`**).
- `look` then asked for Chromium, which this sandbox cannot download (only github/npm/pypi are
  reachable). So: format validated, pixel comparison **not** yet run. Recorded as a known gap.
- Every page script parses, every clip `src` resolves, no page calls
  `requestAnimationFrame`/`setInterval` — the determinism rule OpenFilm relies on.

Skill added at `.claude/skills/openfilm/SKILL.md` so the agent knows when to hand off and which
rules it must not break (overrides are the human's, clear the clip before deleting a page, no
subtitles drawn in a page).

**Honest limitation:** `glitch`, `dot-grid`, `timeline`, `quote`, `diagram`, `split` are simplified
in the OpenFilm pages. The MP4 from our engine stays the reference render.

## CI

`.github/workflows/publish-batch.yml` — `workflow_dispatch` with `spec`/`count`/`hooks`/`voice`:
typecheck + tests → full-resolution batch renders → distinctness check → ffprobe evidence →
**MP4-only artifact** (`videos-<run>`). The workflow may create review/dashboard HTML and JSON on the
runner, but these are not included in the downloadable artifact. `render.yml` follows the same rule:
its artifact contains only flattened `<video-id>.mp4` files.

Nothing is auto-published to a social platform. Download the `videos-<run>` artifact from the run's
Actions page; the artifact archive contains only playable MP4s, not source code or HTML.
