# Phase 4 — Critic, distinctness, thumbnails, review, shorts

Status: **shipped** (`src/pipeline/{critic,distinct,thumbnail,review,shorts}.ts`, wired into `src/cli.ts`).

## Why this phase exists

Phases 1–3 could make *a* video. They could not answer the three questions that decide whether
a channel survives:

1. **Is this one good?** → rules critic
2. **Are these twenty the same video?** → distinctness gate
3. **Did I actually finish it?** → review page + thumbnail

Phase 4 is the QA department. It is deterministic on purpose: the agent writes specs, the
pipeline judges them, and neither depends on a model being available.

## 1. Rules critic (`critic.ts`)

Always on. Runs inside every `build`, and standalone via `critique`.

| rule | why |
| --- | --- |
| beat > 8s in a short | attention decays; a static 9s shot is a drop-off event |
| `onScreen` restates the VO on a non-text scene | captions + headline saying the same words wastes the frame |
| > 3.4 words/sec | impossible to follow, and TTS will rush |
| no evidence beat (`stat`/`chart`/`code`/`diagram`/`timeline`) | the promise has no proof |
| 3+ consecutive beats in one visual family | reads as one long shot |
| short outside 12–45s | outside the distribution window |

Output is `Critique { verdict: 'ship' | 'patch', issues[], patches[], notes[] }`.
A `Patch` is `{beatId, field, from, to, reason}` and `applyPatches()` can actually apply it
(`onScreen`, `visual.type → split`, `vo` word-trim), so the critic is not just commentary —
`critique --apply` writes `projects/<id>/director.patched.json`.

`critiqueWithLLM()` is an optional second opinion that shells out to `claude -p --output-format json`.
It returns `null` on any failure. **A build never fails because an LLM was unavailable.**

## 2. Distinctness gate (`distinct.ts`)

Platforms devalue template-feel output, so "did I accidentally render the same video 5 times?"
has to be measured, not eyeballed.

Per video we sample 5 frames at matched story positions (0/25/50/75/100%), and for each frame
compute:

- a 16×16 average hash → **structure**
- the mean colour of the **brightest 12% of pixels** → **ink** (mean RGB is useless on dark grades:
  two totally different accents average out to near-black)
- ink coverage and mean luma

Distance per pair = `0.50·structure + 0.30·hue(ink) + 0.06·saturation + 0.09·ink load + 0.05·luma`.
Batch pass = every pair ≥ **0.18**.

Measured on this repo's demo (`variants --count 4`):

```
v1↔v2 0.2733   v1↔v3 0.3038   v1↔v4 0.4908
v2↔v3 0.2319   v2↔v4 0.4981   v3↔v4 0.5310   → distinct
```

Exit code 4 when the batch fails, so CI can gate a publishing run.

## 3. Thumbnails (`thumbnail.ts`)

Scores 8 candidate frames on contrast (42%), edge energy (33%) and bright coverage in the upper
two-thirds (25%) — the region a platform's UI does not cover. Writes `thumb.png` and a 1280px
`thumb.jpg` for upload. The score is reported in the build log so you can see when the "best"
frame is still weak.

## 4. Review page (`review.ts`)

One self-contained `out/<id>/review.html`: video player, every QA gate, critic issues, all title
variants, tags, licence manifest and the synthetic-voice disclosure — with **relative paths only**,
so it opens from disk or inside a preview sandbox with no server and no network.

## 5. Long → shorts (`shorts.ts`)

Cropping a 16:9 master to 9:16 is the lazy path and it looks it. Instead each short is
**re-directed**:

- pick non-overlapping windows by evidence density + payoff ending + claim strength
- the window's strongest sentence (number or contrast word, ~9 words) becomes the hook
- the hook beat is re-typed as `kinetic-type` slam, ≤ 3.4s, ≤ 5 on-screen words
- wide-only visuals (`chart`, `split`) are re-treated to vertical-safe types
- adjacent beats may never share a visual type; the closer is forced different
- a `loop` beat echoes the hook so the ending feeds back into the start
- new `variationSeed`, karaoke captions, `#shorts` tag, and `originality.uniqueInput` records the
  excerpt provenance

Verified: `long-form-agent-video-engine` → `-s1` built to **QA PASS**, hook beat 3.33s, 0 repeated visuals.

## Commands added

```
critique --spec <file> [--llm] [--apply]
distinct --ids a,b,c
shorts   --spec <long.json> [--count N]
thumb    --spec <file>
review   --spec <file> [--distinct a,b]
```

## Rendering fixes this phase forced

- **Title fit**: `fitSize` measured the mixed-case string while the layout drew uppercase (wider),
  so hooks overflowed. It now measures the string it actually draws, on both axes.
- **Double text**: text-forward scenes (`kinetic-type`, `quote`) were also being captioned, stacking
  two copies of the same line. Captions are now suppressed when the on-screen line already carries
  the VO words (word overlap > 0.5).
- **Glitch overflow**: the RGB-split ghost offset is now clamped to the side margin, and the fitter
  checks line width, not just block height.
- **QA dead-frame gate**: `blackdetect` fires on any intentionally dark grade. Replaced with
  per-frame `signalstats` luma sampling — a frame only counts as dead below mean luma 3.
  Label changed to "no featureless segments"; the theme is allowed to be dark.
