# 01 — ARCHITECTURE

> Ye document batata hai ke system **kaise banega**: layers, data contracts, folder layout, decision points, aur alternative approaches (agar aapka tareeqa na chale toh).

---

## 1. Core design decision (sabse pehle ye samajhna zaroori hai)

Aapka instinct ye tha:

```
Claude Code (free LLM) → "video banao" → video ban jaye
```

Ye chalega magar **scale par tootega**. Kyun: har render par LLM call = quota burn + non-deterministic output + slow + free-tier reliability par depend.

Iske bajaye **3-tier model** jo main recommend karta hoon:

```
┌───────────────────────────────────────────────────────────────────┐
│  TIER 1 — DIRECTOR (LLM ka kaam, ek dafa per video)              │
│  Claude Code + FreeLLMAPI                                         │
│  Input:  topic / trend / brief / long transcript                  │
│  Output: director.json  ← structured SPEC (schema-validated)      │
│          thesis, hook variants, beats, shots, asset queries,      │
│          palette, motion cues, music mood, caption style          │
└──────────────────────────────┬────────────────────────────────────┘
                               │  (JSON contract — LLM yahan rukta hai)
┌──────────────────────────────▼────────────────────────────────────┐
│  TIER 2 — ENGINE (deterministic, LLM-free, repeatable)            │
│  Node/TS scripts                                                  │
│  assets → voiceover (Kokoro) → timestamps → timeline.json         │
│  → props build → Remotion render (local ya GitHub Actions)        │
│  Har step reproducible + idempotent + checkpointed                │
└──────────────────────────────┬────────────────────────────────────┘
                               │  mp4 + manifest + stills
┌──────────────────────────────▼────────────────────────────────────┐
│  TIER 3 — QA + LEARN (semi-LLM)                                   │
│  ffprobe checks, loudness, black-frame detect, caption overflow    │
│  LLM critic: stills + transcript par review (optional)            │
│  metrics ingest (YouTube/TikTok) → next batch ke hook priors      │
└───────────────────────────────────────────────────────────────────┘
```

**Aapka "Claude Code freely chalega, always yes" wala hissa Tier 1 aur code-writing par lagta hai — jo bilkul sahi jagah hai.** Tier 2 ko LLM se azad rakhna hi is system ko actually reliable banata hai.

**Iska naam:** *Agent-as-Director, Engine-as-Renderer.*

---

## 2. High-level pipeline (step by step)

| # | Step | Actor | Output | Deterministic? |
|---|---|---|---|---|
| 0 | Topic/brief ingest | human ya scout | `brief.json` | ✅ |
| 1 | Research + angle | Claude Code (web/tool use) | `research.md` | ❌ |
| 2 | Thesis + script | Claude Code | `script.json` (beats, VO text, on-screen text) | ❌ |
| 3 | **Schema validation** | script (zod/ajv) | pass/fail + auto-repair prompt | ✅ |
| 4 | Hook variants | Claude Code | 3–5 hooks, ranking | ❌ |
| 5 | Voiceover | Kokoro-FastAPI | `vo.wav` + word timestamps | ✅ (same input → same output) |
| 6 | Timing solve | script | `timeline.json` (beats → frames) | ✅ |
| 7 | Asset resolution | script + APIs | `assets.json` (local files + license metadata) | ✅ (cached) |
| 8 | Props build | script | `props.json` (single source of truth) | ✅ |
| 9 | Render | Remotion (local/CI) | `video.mp4` | ✅ |
| 10 | QA gates | script | `qa.json` (pass/fail, stills) | ✅ |
| 11 | Critic (optional) | Claude Code | `critique.json` + patch suggestions | ❌ |
| 12 | Publish pack | script | title/desc/tags/thumbnail + `published.json` | ✅ |
| 13 | Metrics | script | `metrics/*.json` → priors | ✅ |

**Rule:** Steps 5–10 ek command se dobara chalne chahiye, *bina* LLM ke (`--reuse-spec`). Ye 1000x iteration possible banata hai.

---

## 3. The Director Spec — core data contract

Ye system ka **dil** hai. LLM ka output ek strict schema hona chahiye, warna agent hallucinated structure dega aur engine crash karega.

```jsonc
// director.json  (schema-validated, versioned)
{
  "specVersion": "1.0",
  "id": "2026-11-20_why-your-shorts-die-at-2s",
  "format": "short",                  // "short" | "long"
  "platform": ["youtube", "tiktok", "reels"],
  "aspect": "9:16",                   // 9:16 | 16:9 | 1:1
  "fps": 30,
  "targetDurationSec": 38,

  "thesis": "Shorts die at 2s because the first sentence describes instead of disrupts.",
  "audience": "solo creators, 10k–100k subs",
  "angle": "contrarian",              // contrarian | curiosity-gap | data | story | tutorial
  "originality": {
    "uniqueInput": "our own A/B test of 40 hooks",
    "dataRefs": ["data/hook-tests-2026-11.csv"],
    "claimsToVerify": ["hook timing thresholds"]
  },

  "hooks": [                          // 3–5 variants, A/B test ke liye
    { "id": "h1", "text": "Your first 2 seconds are lying to you.", "formula": "contrarian", "score": 0.82 },
    { "id": "h2", "text": "I tested 40 hooks. 37 failed.", "formula": "specific-number", "score": 0.77 }
  ],

  "beats": [
    {
      "id": "b1", "role": "hook", "startHint": 0, "maxSec": 3,
      "vo": "Your first two seconds are lying to you.",
      "onScreen": "YOUR FIRST 2 SECONDS",
      "visual": {
        "type": "kinetic-type",        // kinetic-type | stock | code | chart | screen-cap | diagram | 3d | abstract
        "assetQuery": null,
        "motion": "slam-in",
        "notes": "full-bleed text, 2 frames of chromatic aberration"
      },
      "sfx": ["whoosh-impact"],
      "emphasis": ["2 SECONDS"]
    },
    {
      "id": "b2", "role": "tension", "maxSec": 5,
      "vo": "They describe the topic. Viewers already know the topic.",
      "visual": { "type": "stock", "assetQuery": "person scrolling phone night", "motion": "slow-push" }
    }
    // ...
    { "id": "b7", "role": "loop", "maxSec": 4, "vo": "So start at the end.", "visual": { "type": "kinetic-type", "motion": "match-cut-to-b1" } }
  ],

  "style": {
    "palette": { "bg": "#0B0B0F", "fg": "#F5F5F7", "accent": "#FF3B30", "muted": "#8E8E93" },
    "fontPair": { "display": "Space Grotesk 700", "body": "Inter 400" },
    "grain": 0.06, "vignette": 0.25,
    "captionStyle": "karaoke-2-line",  // none | line | karaoke-1-line | karaoke-2-line
    "transitionKit": ["whip-pan", "gl-wipe", "hard-cut"],
    "templateFamily": "kinetic-doc",   // variation engine ka hissa
    "variationSeed": 41729
  },

  "audio": {
    "voice": "af_heart", "speed": 1.06, "language": "en",
    "music": { "mood": "tense-minimal", "bpm": 96, "duckDb": -14 },
    "loudnessTargetLufs": -14
  },

  "publish": {
    "titleVariants": ["...", "..."],
    "descriptionTemplate": "hook + timestamps + sources",
    "tags": ["shorts", "content strategy"],
    "disclosure": { "syntheticVoice": true, "aiGeneratedVisuals": false }
  },

  "budget": { "maxLLMCalls": 6, "maxAssetFetches": 20, "maxRenderMinutes": 12 }
}
```

**Kyun ye kaam karta hai:** schema chhota aur flat hai (free models ke liye aasan), engine ke paas **koi surprise nahi**, aur har field ka ek deterministic consumer hai. `variationSeed` + `templateFamily` + `palette` + `transitionKit` = **variation engine** jo YouTube ki "inauthentic content" policy se bachata hai.

---

## 4. Component inventory (kya kya banega)

### 4.1 Spec & validation layer
- `schemas/director.schema.json` (+ zod mirror). Versioned.
- `scripts/validate-spec.ts` — fail par **structured error** jo agent ko wapas diya jaye ("field X missing, allowed values [...]"). Ye auto-repair loop free models ke liye critical hai.
- `scripts/normalize-spec.ts` — durations ko frames mein convert, word budgets enforce (75 words ≈ 30s rule se sanity check).

### 4.2 Audio
- `scripts/voiceover.ts` — Kokoro-FastAPI `/dev/captioned_speech` (mp3/wav + word timestamps). Multi-voice support (hook narrator vs. character).
- `scripts/align.ts` — timestamps ka fallback: `whisper.cpp` (via `@remotion/install-whisper-cpp`) jab TTS timestamps absent/ghalat hon.
- `scripts/loudness.ts` — FFmpeg `loudnorm` → −14 LUFS (platform-safe), true peak −1 dB.
- Music ducking: sidechain-compress ya simple interpolate envelope jo VO ke hisaab se music -14dB kare.

### 4.3 Timing solver (sabse under-rated hissa)
- `scripts/timeline.ts` — beats ke words ke timestamps se beat boundaries nikaalo → frames. Overlap/gap ko `maxSec` ke against reconcile karo.
- **Rule:** timing TTS se aati hai, LLM se nahi. LLM ke "3 seconds" ka koi bharosa nahi.
- Output: `timeline.json` = `[{beatId, fromFrame, toFrame, words:[{w,startMs,endMs}]}]`. Remotion compositions isi ko consume karti hain.

### 4.4 Asset resolver
- `scripts/assets/resolve.ts` — beat ke `visual.type` + `assetQuery` se asset dhoondo:
  - `stock` → Pexels/Pixabay (cache to `assets/stock/<hash>.mp4`, `assets.json` mein license+author+URL).
  - `image` → Openverse / Wikimedia / NASA / Unsplash.
  - `code` → Shiki se pre-rendered HTML/SVG ya Remotion ke andar live Shiki.
  - `chart` → data file → Recharts component props.
  - `screen-cap` → Playwright se pehle se capture ki gayi clips (`assets/captures/`).
  - `3d`/`abstract` → procedural (Three.js/noise), koi download nahi.
- **License gate:** `assets.json` mein `{license, attribution, sourceUrl}` mandatory. Missing → build fail. Ye aapko takedown se bachata hai.

### 4.5 Remotion composition library (project ka sabse bada asset)
Ye "template library" hai — **har scene type ek reusable component**:

```
src/
  Root.tsx                     // compositions register
  schema.ts                    // zod props
  engine/
    BeatSequence.tsx           // timeline.json → <Sequence>s
    Frame.tsx                  // shared chrome: grain, vignette, safe-area
    Captions.tsx               // word-level karaoke (createTikTokStyleCaptions)
    ProgressBar.tsx, Watermark.tsx
  scenes/
    KineticType.tsx            // text slam/scale/kinetic-chunks
    StockMontage.tsx           // video/gif b-roll + ken-burns + whip-pan
    CodeTyping.tsx             // syntax-highlighted typing
    ChartReveal.tsx            // data-viz builds
    TerminalCast.tsx           // command-line aesthetic
    DiagramDraw.tsx            // SVG path animation
    ThreeScene.tsx             // abstract 3D
    SplitScreen.tsx            // A/B compare (before/after)
    QuoteCard.tsx, StatCard.tsx, ListReveal.tsx
  transitions/
    registry.ts                // gl-transitions + @remotion/transitions + hard cuts
  brands/
    <brand>/tokens.ts          // palette/fonts/logo (multi-channel support)
  compositions/
    Short.tsx                  // 9:16 orchestrator
    Long.tsx                   // 16:9 chapterized orchestrator
```

**Design principle:** scenes **props-driven** aur **duration-agnostic** (andar `useVideoConfig().durationInFrames` ke saath scale karein). Ek scene ko 1.5s ya 12s dono mein fit hona chahiye — warna long-form impossible hoga.

**Long-form ke alag scenes:** `ChapterCard`, `LowerThird`, `BrollStory`, `Interview` (agar bad mein aaye), `RecapGrid`. Long composition = Short scenes ka superset + chaptering layer.

### 4.6 Render layer
- `scripts/render.ts` — wrapper over `@remotion/renderer` / CLI:
  - **Draft mode:** `--frames=0-90` stills + 480p low-crf, 30 sec mein preview.
  - **Final:** 1080p (short) / 1080p–1440p (long), `--concurrency` tuned, `--crf 18`.
  - **Outputs:** `out/<id>/{video.mp4, thumb.jpg, stills/*.jpg, manifest.json}`.
- `scripts/render-ci.ts` — GitHub Actions dispatch + artifact download (VPS/control-plane pattern). Long renders (10+ min) ke liye CI behtar hai; laptop free rehta hai.
- Determinism: `@remotion/licensing` note karo (Remotion ka license check), assets pre-downloaded, `random(seed)`.

### 4.7 QA gates
`scripts/qa.ts` — hard, numeric checks (LLM ke bina):
- ffprobe: duration, fps, resolution, audio stream majood, bitrate.
- **Loudness:** −14 LUFS ± 1.5, true peak ≤ −1 dB.
- **Black frame / frozen frame detect:** FFmpeg `blackdetect`, `freezedetect` — koi 0.5s se lamba dead air nahi.
- **Caption safety:** line length ≤ N chars, safe-area (platform UI ke 15% top/bottom), no orphan words.
- **First-frame test:** frame 0 par text readable? (contrast ratio compute karo palette se)
- **Hook timing:** hook complete by frame `1.0×fps`?
- **Asset audit:** saara footage unique? (perceptual hash se duplicate detect — YouTube policy ke liye)
- Output: `qa.json` + `stills/00/03/07/…png`. **Ye stills hi agent ka "aankh" hain** (agar free model vision support kare).

### 4.8 Critic + repair loop
- `scripts/critic.ts` → Claude Code headless call: stills + transcript + qa.json → `critique.json` (sirf *actionable* diffs: "beat b2 8→5 sec", "palette contrast kam").
- Agent **spec patch** karta hai (director.json v2) → engine dobara chalta hai. **Max 2 iterations** (quota guard).
- Human approval gate: `out/<id>/review.html` — video + stills + metrics, ek page par. Approve → publish pack.

### 4.9 Publish + metrics
- `scripts/publish/pack.ts` — title/desc/tags/thumbnail/captions.srt + `disclosure` fields (YouTube "AI use" disclosure ke liye ready).
- Upload: Phase 1 haath se; Phase 3 `youtube-data-api` (OAuth) + TikTok Content Posting API (approval chahiye).
- `scripts/metrics/ingest.ts` — views/retention CSV → `priors.json` (hook formula → avg retention). Agli batch ke hook ranking mein use ho.

---

## 5. Claude Code integration (aapka "always yes" hissa)

### 5.1 Wiring
```
FreeLLMAPI (localhost:3001) ── /v1/messages ── Claude Code
   ANTHROPIC_BASE_URL=http://localhost:3001
   ANTHROPIC_AUTH_TOKEN=<unified-key>
   ANTHROPIC_MODEL=<strong tool-caller from catalog>
```
- `npx freellmapi launch` use karo (credentials disk par nahi).
- **Model mapping:** FreeLLMAPI ke Claude mapping ko 3 alag models par map karo — *planner* (strong, kam calls), *writer* (fast/creative), *fixer* (tool-call reliable). `setup-claude` + `auto:<profile>` chains se.
- **Fallback chain:** coding chain = deepseek/qwen/glm/kimi flavours; agar sab khatam → local Ollama (custom provider) → tab hi fail.

### 5.2 Permissions — "always yes" ka safe version
```jsonc
// .claude/settings.json  (commit ho)
{
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Read(/**)",
      "Edit(/**)", "Write(/**)",
      "Bash(npm ci)", "Bash(npm run *)",
      "Bash(npx remotion *)", "Bash(npx tsc *)",
      "Bash(ffmpeg *)", "Bash(ffprobe *)",
      "Bash(git status)", "Bash(git diff *)", "Bash(git log *)",
      "Bash(git add *)", "Bash(git commit *)",
      "Bash(node scripts/*)", "Bash(python3 scripts/*)",
      "Agent(Explore)", "Skill(remotion*)"
    ],
    "ask": ["Bash(git push *)"],
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)", "Read(/**/*.pem)",
      "Bash(rm -rf *)", "Bash(sudo *)", "Bash(curl * | sh)", "Bash(chmod 777 *)",
      "Bash(git push --force *)", "WebFetch"
    ]
  }
}
```
- **PreToolUse hook** (`hooks/guard.ts`): allow sab, magar *deny* `git push` agar branch `main`/`arena/*` na ho, deny `npm install <unvetted>`, deny repo root ke bahar writes. Hook `exit 2` = hard block (bypass mein bhi chalta hai).
- **Container rule:** bypass mode sirf disposable devcontainer mein. Aapke laptop par `dontAsk` + allowlist.
- **Audit:** `claude -p ... --output-format json` se `permission_denials` collect karo → `logs/agent/`. Isse pata chalega agent kya karna chahta tha.

### 5.3 Skills (project ka "brain")
`npx remotion skills add` (13 official skills) + apna layer:
```
.claude/skills/video-director/SKILL.md        // orchestration playbook
.claude/skills/viral-structure/SKILL.md       // hook formulas, beat templates, word budgets
.claude/skills/director-spec/SKILL.md         // schema + validation errors + repair etiquette
.claude/skills/asset-licensing/SKILL.md       // kya allowed, attribution kaise likho
.claude/skills/qa-gates/SKILL.md              // kya fail matlab kya
.claude/skills/longform-chapters/SKILL.md     // long-form pacing rules
```
Ye files **is repo ki asli product** hain — model badalta rahega, skills rehti hain.

### 5.4 Subagents (parallelism, quota-aware)
| Agent | Kaam | Model tier |
|---|---|---|
| `scout` | trend/topic research, GitHub repo shortlist | cheap/fast |
| `writer` | hooks + script beats | creative |
| `fixer` | schema/TS errors repair (tight loop) | tool-call strong |
| `critic` | stills QA review | vision-capable (agar mile) |
| `librarian` | asset catalogue maintenance | cheap |

**Cost control:** `budget.maxLLMCalls` spec mein; engine hard-fail kare agar exceeded.

---

## 6. Repo folder layout (proposed)

```
Video-Director/
├─ docs/                       # ye planning docs
├─ .claude/
│  ├─ settings.json            # permissions (committed)
│  ├─ skills/                  # custom skills
│  └─ agents/                  # subagent definitions
├─ schemas/
│  ├─ director.schema.json
│  └─ props.schema.json
├─ src/                        # Remotion project
│  ├─ Root.tsx
│  ├─ engine/   scenes/   transitions/   brands/
│  └─ compositions/{Short,Long}.tsx
├─ scripts/
│  ├─ pipeline/{spec,voice,timeline,assets,render,qa,publish}.ts
│  ├─ assets/   providers/ (pexels, pixabay, openverse, nasa, wikimedia, local)
│  └─ cli.ts                   # single entrypoint
├─ assets/
│  ├─ stock/  sfx/  music/  fonts/  captures/   # gitignored, cached
│  └─ registry.json            # license + attribution index (committed)
├─ projects/                   # per-video workspaces (gitignored except specs)
│  └─ <id>/{brief.json, director.json, timeline.json, props.json, qa.json}
├─ out/                        # renders (gitignored)
├─ data/                       # metrics CSVs, priors.json (committed)
├─ .github/workflows/
│  ├─ render.yml               # workflow_dispatch + artifact
│  └─ nightly-spec.yml         # optional
└─ package.json
```

**Git hygiene:** `assets/stock`, `out/`, `node_modules`, `.venv` gitignored. Specs + timeline + qa.json **commit hote hain** (ye aapka "video source" hai). Renders release artifacts / S3.

---

## 7. Short vs Long — ek hi engine, do modes

| | Short (15–60s) | Long (5–20 min) |
|---|---|---|
| Aspect | 9:16 | 16:9 |
| Beats | 6–10, har 2–4s par visual change | 8–14 chapters × 45–120s |
| Hook | 0–1.5s disruption | 0–15s cold open + promise |
| Re-hook | loop at end | har 60–90s |
| Captions | karaoke word-by-word | line-level lower-third + chapters |
| Visual variety | intensity high | b-roll + charts + screen-caps mix |
| LLM load | 1 spec, ~5 calls | 1 spec (chapterized), ~8–12 calls |
| Render | seconds–minutes | 5–40 min (CI recommended) |
| Risk | inauthentic policy | retention drop-off |

**Same `director.json` schema dono handle karta hai** — `format: "long"` par beats ke andar `chapters: [{...beats}]` ajda hoti hai. Short ke scenes 100% reuse hote hain. **Short = "vertical distillation" of long**: ek long-form ka transcript → 4 shorts (`scripts/shorts-from-long.ts`). Ye aapke "dono power" requirement ka cheapest implementation hai — ek transcript se 1 long + N shorts.

---

## 8. Alternative approaches (agar mera tareeqa na chale)

Aapne kaha "agar mere tareeke se nahi toh aur kis tarah se hoga" — toh ye honest options matrix:

### Option A — **Agent-as-Director + Remotion engine** (recommended)
- Pros: deterministic, fast iterations, free, brandable, license-safe, scales to 100s of videos.
- Cons: motion-graphics look; "cinematic AI footage" nahi; scene library banana padta hai (Phase 2 ka asli kaam).
- Best if: aap tech/knowledge/explainer/commentary content banate hain.

### Option B — **MoneyPrinterTurbo fork** (fastest to first video)
- Kya: Python, MoviePy, Pexels footage + EdgeTTS + captions. 120k+ stars, MIT.
- Pros: 1 din mein chalta hua pipeline.
- Cons: MoviePy timeline = hard to brand/control; "template look" = YouTube inauthentic risk; bundled music commercially unsafe; Pexels dependency; debugging community largely Chinese; **agent ke liye codebase LLM-unfriendly** (bade monolithic files).
- Best if: aap sirf volume test karna chahte hain. **Mera verdict: as a *pattern reference* use karo, base ke tor par nahi.**

### Option C — **FFmpeg-first (no Remotion)**
- Kya: JSON → FFmpeg filter_complex ya `konva`/`sharp` frames → mp4.
- Pros: no Remotion license, ultra light, server-friendly.
- Cons: text/typography/layout ka koi sane model nahi; har scene custom code; iteration slow. **Remotion yahan clearly jeetta hai.**
- Best if: aap sirf simple slideshow/narration bana rahe hote.

### Option D — **Motion Canvas / Revideo**
- Revideo = Motion Canvas fork with server-side render API + variables template system (MIT).
- Pros: MIT (Remotion license issue nahi), built-in REST render API.
- Cons: chhota ecosystem, no official agent skills, generator-function model agents ke liye less forgiving, community chhoti.
- Best if: license/cost aapke liye blocker hai.

### Option E — **HyperFrames (HeyGen)** — HTML/CSS/GSAP, Apache 2.0 + Claude plugin.
- Pros: permissive license, no seat fees, Claude integration mojood.
- Cons: naya, chhota ecosystem; aapko React/Remotion ecosystem (Recharts, Shiki, Three) nahi milta.
- Best if: company 4+ log aur license cost bachana hai.

### Option F — **Bina-Kisi-LLM (pure template factory)**
- 20 handcrafted templates × data slots × topic feed. Zero agent.
- Pros: 100% deterministic, sasta, fast.
- Cons: variation limited, aap khud content likhenge.
- **Best hybrid: F + A.** Templates (A ka scene library) + agent jo unhe *choose* aur *fill* kare. Issi ko main recommend kar raha hoon.

**Final recommendation:** **A (engine) + F (template-first) + B (pattern reference) + D/E (fallback agar license issue).**

---

## 9. Failure modes aur unka design-level hal

| Failure | Symptom | Design fix |
|---|---|---|
| Free model ne invalid JSON diya | engine crash | schema + auto-repair (max 2 tries) + heuristic default spec |
| Free model ne beats ke durations galat diye | captions drift | timing TTS se, LLM se nahi |
| Quota khatam mid-run | agent ruk gaya | `--reuse-spec` par resume; engine LLM-free; checkpoint per step |
| Model tool-calling flaky | loop | `dontAsk` + chhote tasks + tool-call rescue + fixer agent |
| Render OOM | crash | `--concurrency 1`, draft mode, CI par shift |
| Fonts missing | fallback font | self-hosted OFL fonts, `delayRender` |
| Stock footage repeat | "inauthentic" | perceptual-hash dedupe + variation seed + original data visuals |
| Asset license miss | takedown | `registry.json` gate, build fail |
| "Boring" output | low retention | critic loop + hook A/B + template rotation |
| Agent destructive | data loss | deny list + PreToolUse hook + container + git checkpoint |

---

## 10. Definition of Done (system "ready" kab hoga)

Phase 1 ke baad ek command:
```
node scripts/cli.ts make --brief "why shorts die at 2s" --format short --count 3
```
→ 3 different videos (different hooks, palettes, template families), each with:
`out/<id>/video.mp4` (validated), `qa.json` (all gates green), `manifest.json` (licenses), `publish.json` (title/desc/tags/thumb/srt), `review.html`.

Aur wo teen videos **alag lagne chahiye** — ye "inauthentic content" test hai.
