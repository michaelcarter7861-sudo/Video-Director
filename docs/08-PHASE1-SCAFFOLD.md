# 08 — PHASE 1 SCAFFOLD (tech niche · motion-graphics) — **SHIPPED**

> **Status: implemented.** The renderer is **not Remotion** — it is an MIT `@napi-rs/canvas` + ffmpeg
> compositor (no browser, no licence). See `docs/09-ENGINE-DECISION.md` for the decision record.
> Deliverables below were adjusted accordingly; everything else stands.

> Aapne choose kiya: **tech/AI explainers · motion-graphics/kinetic-type · full Phase 1 scaffold**.
> Ye document batata hai **kya banega, kis order mein, aur kya accept karne ka criteria hai.** Filhaal code nahi — ye build order hai jo agle step mein implement hoga.
> Stock footage provider Phase 1 mein **zero** — sirf motion primitives. Isse dependency risk khatam ho jaata hai.

---

## 1. Tech stack (locked for Phase 1)

| Concern | Choice | Why |
|---|---|---|
| Engine | `@napi-rs/canvas` + `ffmpeg` (static binaries) + TypeScript (strict) | **MIT**, no browser, byte-identical frames |
| Validation | zod (runtime) + JSON Schema (agent ke liye) | ek hi source, do audiences |
| TTS | Kokoro-FastAPI (docker, CPU) | free, per-word timestamps |
| Alignment fallback | `@remotion/install-whisper-cpp` (medium.en) | drift correction |
| Captions | `@remotion/captions` + `createTikTokStyleCaptions` | karaoke, word-level |
| Motion | `@remotion/transitions`, `@remotion/shapes`, `@remotion/paths`, `@remotion/noise`, `@remotion/motion-blur`, `@remotion/layout-utils` | transitions, SVG draw, organic motion |
| Code scenes | Shiki (pre-highlighted HTML ya token stream) | tech niche ka core |
| Charts | Recharts (ya D3 primitives) | data-story scenes |
| 3D (optional) | `@remotion/three` + three | abstract backgrounds |
| Fonts | `@remotion/google-fonts` (OFL) | Inter / Space Grotesk / JetBrains Mono |
| QA | FFmpeg (`loudnorm`, `blackdetect`, `freezedetect`) + custom checks | deterministic gates |
| Tests | vitest + `@remotion/renderer` still tests | scene regression |
| CI | GitHub Actions `workflow_dispatch` | finals |
| Agent | Claude Code + FreeLLMAPI (`dontAsk` + allow/deny + guard hook) | aapka "always yes" |
| Logs | `logs/agent/*.json` (permission_denials included) | audit |

---

## 2. Build order (7 steps · har step demoable)

### Step 1 — Skeleton + spec contract (day 1–2)
- Remotion blank project, TS strict, ESLint/Prettier, vitest.
- `schemas/director.schema.json` v1 (short-only, `format: "short"`).
- `src/schema.ts` (zod mirror) — **dono sync hain, ek test isse enforce kare.**
- `projects/demo/director.json` — haath se likha sample (tech niche: "why your shorts die at 2s").
- **Demo:** `npx remotion studio` par ek placeholder composition jo spec padh kar beat count dikhata hai.

### Step 2 — 6 scenes (day 2–5) · *asli kaam*
Ye 6 scenes poore system ka 80% output cover karte hain:

| Scene | Kya karta hai | Props | Notes |
|---|---|---|---|
| `KineticType` | text slam/scale/word-by-word reveal, full-bleed | `text`, `emphasis[]`, `motion`, `style` | hook + payoff ka default. `spring()` + `interpolate()`, stagger per word |
| `CodeTyping` | syntax-highlighted code type-on, cursor blink, line focus | `code`, `lang`, `highlightLines[]`, `typingSpeed` | Shiki tokens; typing = frame-based (koi setTimeout nahi) |
| `TerminalCast` | shell prompt + commands + output appear | `lines[]`, `delayPerLine` | tech commentary ke liye |
| `StatCard` | big number count-up + label + delta | `value`, `prefix`, `suffix`, `label`, `delta` | data beats |
| `ChartReveal` | bar/line build-up with axis + callout | `data`, `type`, `callout` | Recharts + frame-driven progress |
| `DiagramDraw` | SVG path draw (flow, stack, architecture) | `nodes[]`, `edges[]`, `drawOrder` | `@remotion/paths` |

Plus `Frame.tsx` chrome: grain, vignette, safe-area guides, optional progress bar.

**Design rules (har scene mein):**
1. `useVideoConfig().durationInFrames` ke against scale karo — 1.5s ho ya 12s, kaam kare.
2. Enter/exit ke liye shared `enter()/exit()` helpers — consistent motion language.
3. Text **safe-area** ke andar (9:16 par top 12% / bottom 18% clear — platform UI).
4. Palette sirf `brands/<brand>/tokens.ts` se — koi hardcoded hex nahi.
5. Koi `Math.random()` seed ke baghair; `setTimeout`/CSS animations zero.
6. Font `@remotion/google-fonts` se load + `delayRender` handle.

### Step 3 — Captions + timeline (day 5–7)
- `scripts/pipeline/voice.ts` → Kokoro call → `vo.wav` + `words.json`.
- `scripts/pipeline/timeline.ts` → words + beats → `timeline.json` (frames).
  - Beat boundary = us beat ke **pehle word ka start** aur **aakhri word ka end**.
  - Gap/overlap ko `maxSec` ke saath reconcile (trim silence, na ki words kaato).
- `Captions.tsx` → `createTikTokStyleCaptions` + 2-line karaoke, active word accent color, 1–2 word chunk (9:16 ke liye).
- **Demo:** spec → VO → caption-timed video (scenes placeholder).

### Step 4 — Engine + CLI (day 7–9)
`scripts/cli.ts` commands:
```
make    --brief <file> --count N [--draft]      # full pipeline
build   --id <id> [--draft] [--reuse-spec]      # engine only (LLM-free)
spec    --brief <file>                          # sirf director.json
qa      --id <id>                               # gates + stills
render  --id <id> [--quality draft|final]       # render only
publish --id <id>                               # publish pack
variants --id <id> --count 5                    # variation engine
```
- Har step idempotent + checkpointed (`projects/<id>/state.json`).
- `--reuse-spec` = LLM ke baghair dobara build (quota-safe, deterministic).
- Failure par structured error (agent ka repair loop isi ko padhta hai).

### Step 5 — QA gates (day 9–10)
`qa.json` mein hard numbers:
| Gate | Pass |
|---|---|
| duration | ±1 frame of spec target |
| resolution/fps | 1080×1920 / 30 |
| audio | majood, −14 LUFS ±1.5, true peak ≤ −1 |
| black frames | koi bhi segment > 0.4s nahi |
| frozen frames | koi bhi > 0.7s nahi |
| caption length | ≤ 4 words/chunk, ≤ 2 lines |
| safe area | all text inside 88% center box |
| hook complete | by frame 45 |
| contrast | on-screen text ratio ≥ 4.5:1 vs its bg plate |
Stills: frames `0, 10%, 30%, 50%, 70%, 95%` → `out/<id>/stills/`.

### Step 6 — Agent layer (day 10–12)
- `.claude/settings.json` + `guard.js` + 3 skills (`viral-structure`, `director-spec`, `qa-gates`).
- Director prompt + fixer prompt + critic prompt.
- `claude -p` runner script: brief JSON → director.json → `node scripts/cli.ts build --reuse-spec`.
- `review.html` generator: video + stills + qa + spec diff + approve button (static, no server).

### Step 7 — CI + polish (day 12–14)
- `.github/workflows/render.yml`: `workflow_dispatch` + inputs (`composition`, `props`, `quality`) → artifact upload.
- Nightly optional: `--reuse-spec` se deterministic re-render (drift detect).
- Docs: `docs/09-USAGE.md` (commands + workflow).
- **Regression suite:** 6 scenes ke still snapshots (pixel diff threshold), spec validation tests, caption timing tests.

---

## 3. Variation engine (Phase 1 ke aakhir mein hook, Phase 2 mein poora)

`variationSeed` → deterministic picks:
```
palette      : 4 presets  (dark-tech, paper-light, neon-noir, mono-accent)
fontPair     : 3 presets  (Space Grotesk/Inter, Manrope/JetBrains, Bebas/Inter)
templateFamily: 4 families (kinetic-doc, terminal-explainer, data-story, minimal-mono)
motionIntensity: 1..3
transitionKit : 3 kits
captionStyle : karaoke-2-line | karaoke-1-line | line
```
Ek `seed` = ek poora consistent look. 5 videos = 5 seeds = 5 different-feeling videos, same substance.

---

## 4. Definition of Done — Phase 1

- [ ] `node scripts/cli.ts make --brief briefs/demo.json --format short` → valid video
- [ ] `--reuse-spec` se dobara build bit-identical timing (deterministic)
- [ ] 6 scenes, har ek ke 2 tests (still snapshot + timing)
- [ ] QA: 100% gates green on 3 consecutive runs
- [ ] Agent: 3 baar mein se 2 baar spec khud likha + build pass (bina nudge)
- [ ] `review.html` usable (aap 60 second mein approve/reject kar sakein)
- [ ] CI render: workflow_dispatch → artifact download
- [ ] 5 videos side by side — insaan 3 second mein farq bata sake (distinctness)
- [ ] README + usage doc updated (code ke saath, planning ke baad)
- [ ] Zero license violations in manifest

---

## 5. File tree jo banega (Phase 1)

```
Video-Director/
├─ .claude/{settings.json, hooks/guard.js, skills/*/SKILL.md, agents/*.md}
├─ .github/workflows/render.yml
├─ schemas/director.schema.json
├─ src/
│  ├─ Root.tsx  schema.ts  index.ts
│  ├─ engine/{BeatSequence.tsx, Frame.tsx, Captions.tsx, motion.ts}
│  ├─ scenes/{KineticType, CodeTyping, TerminalCast, StatCard, ChartReveal, DiagramDraw}.tsx
│  ├─ transitions/registry.ts
│  ├─ brands/tech/{tokens.ts, fonts.ts}
│  └─ compositions/{Short.tsx, VariationPreview.tsx}
├─ scripts/
│  ├─ cli.ts
│  ├─ pipeline/{spec.ts, voice.ts, timeline.ts, props.ts, render.ts, qa.ts, publish.ts, variants.ts}
│  └─ lib/{ffmpeg.ts, fsx.ts, log.ts, errors.ts}
├─ projects/demo/director.json
├─ briefs/demo.json
├─ out/            (gitignored)
├─ assets/         (gitignored, registry.json committed)
└─ tests/{scenes, spec, timing}.test.ts
```

---

## 6. Phase 1 ke baad kya (recap from 02-PLAN)
Phase 2 variation + batch · Phase 3 long-form + shorts-from-long · Phase 4 critic + A/B · Phase 5 scale/publish.

**Locked decisions is doc se:** niche = tech/AI · look = motion-graphics · providers = zero stock · agent = allowlist ("always yes") · render = local draft + CI final.
