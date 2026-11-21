# 02 — PLAN (Roadmap, Milestones, Decisions)

> Ye document batata hai **kab, kis order mein, kis cheez se shuru** karna hai — aur kya *pehle* decide karna hai. Koi code nahi, sirf plan.

---

## 0. Pehle ye 7 decisions lock karo (ye na kiya toh baad mein rework hoga)

| # | Decision | Options | Mera recommendation |
|---|---|---|---|
| D1 | **Content niche** | tech/AI explainer, finance, health, history, commentary, product demos | **tech/AI/creator-economy** — kyunke code/text visuals aapki strength hai aur footage ki zaroorat kam |
| D2 | **Primary platform/format** | Shorts-first ya Long-first | **Short-first** (fast feedback loop), phir long |
| D3 | **Language** | English / Urdu / bilingual | **English primary** (TTS quality + monetization), Urdu Phase 3 |
| D4 | **Channel model** | faceless brand / personal brand / client work | **faceless brand** + brand token layer (multi-channel later) |
| D5 | **Engine choice** | Remotion / MIT canvas renderer | ✅ **MIT canvas renderer** (`@napi-rs/canvas` + ffmpeg) — dekho `docs/09-ENGINE-DECISION.md` |
| D6 | **Where renders run** | local laptop / GitHub Actions / VPS | **local for drafts, GitHub Actions for finals** |
| D7 | **Agent autonomy level** | full bypass / allowlist+deny / interactive | **allowlist + `dontAsk` + deny** (aapka "always yes" bhi ismein mil jaata hai) |

---

## Phase 0 — Spikes & Verification (2–3 din) · *code likhne se pehle*

Maqsad: architecture ke assumptions ko **toro ya confirm karo**. Yahan kuch bhi ship nahi hota, sirf seekhna.

| # | Spike | Success criteria | Output |
|---|---|---|---|
| 0.1 | FreeLLMAPI install + dashboard + keys | localhost:3001 par chal raha, 3 providers keys added | screenshot |
| 0.2 | `npx freellmapi launch` se Claude Code | Claude Code free model par 5 real tasks (read file, edit, run npm, render) ≥80% success | notes + latency |
| 0.3 | Permission model test | `dontAsk` + allowlist mein agent rukta hai ya nahi | denial log |
| 0.4 | Remotion skills install | `/remotion` menu 13 skills dikhata hai | screenshot |
| 0.5 | 15s handcrafted vertical video | script (manual) → Kokoro → captions → render | `spike/out.mp4` |
| 0.6 | Kokoro word timestamps accuracy | 20 captions ka manual check, drift < 120ms | table |
| 0.7 | GitHub Actions render | public repo par render + artifact download | workflow run link |
| 0.8 | Pexels API availability | key mili ya nahi (Nov 2026: paused) | decision: Pexels ya Pixabay |
| 0.9 | Vision capability check | kya aapka free model stills dekh sakta hai? | yes/no → critic design |
| 0.10 | Remotion license self-check | employees ≤3 → free tier confirm | written note |

**Gate:** 0.2, 0.5, 0.6 fail → architecture adjust (dekho `01-ARCHITECTURE.md §8`).

> **STATUS (2026-11-20):** Phase 0 spikes 0.5, 0.6 and the render path are **done** inside this repo without
> Chrome or ffmpeg installed on the host — because the engine ships its own binaries. Phase 1 is implemented:
> see `docs/08-PHASE1-SCAFFOLD.md` and `README.md`. Remotion is no longer used (`docs/09-ENGINE-DECISION.md`).

---

## Phase 1 — "One Video, End-to-End" (1–2 hafte)

**Goal:** ek hi command se ek accha short. Volume nahi, *quality baseline*.

**Deliverables**
- Repo scaffold: Remotion project, TS, zod, ESLint, Vitest, pre-commit.
- `schemas/director.schema.json` v1 (short-only).
- **6 scenes**: `KineticType`, `StockMontage`, `StatCard`, `ListReveal`, `QuoteCard`, `CodeTyping`.
- 4 transitions (`hard-cut`, `whip-pan`, 2 gl-transitions).
- `scripts/pipeline/`: `spec → voice → timeline → assets → props → render → qa` (linear, no branching).
- Kokoro-FastAPI + `docker-compose.tts.yml`.
- Captions: `createTikTokStyleCaptions` karaoke component.
- QA: ffprobe + loudness + blackdetect + caption overflow.
- `.claude/settings.json` + 2 skills (`viral-structure`, `director-spec`).
- `review.html` generator.

**Exit criteria (measurable)**
1. `node scripts/cli.ts make --brief "<topic>"` ek 30–45s short deta hai.
2. Render < 3 min (1080x1920, 45s, M-series ya 8-core laptop).
3. QA gates: 100% green.
4. Agent ne bina human nudge ke spec → video complete kiya, ≥3 baar mein se 2 baar.
5. **Aap khud 5 videos banayein aur dekhein** — agar aap 3rd video par bored feel karein, template library kaafi nahi hai.

**Time-box:** 2 hafte se zyada na do. Agar scenes par 2 hafte lag gaye → scope chhota karo (4 scenes).

---

## Phase 2 — Variation Engine + Batch (2–3 hafte)

**Goal:** ek brief → 5 **alag-lagne wali** videos. Ye YouTube inauthentic-policy ke against aapki asli defense hai.

**Deliverables**
- `variationSeed` → deterministic variation: palette, font pair, template family, transition kit, caption style, music mood, motion intensity.
- **Template families** (4): `kinetic-doc`, `terminal-explainer`, `data-story`, `cinematic-stock`.
- Asset resolver: Pexels/Pixabay/Openverse/NASA/Wikimedia + license registry + PHash dedupe.
- Asset provider interface (plugin-style) + caching + rate-limit aware.
- `make --count N` batch mode + parallel renders (`--concurrency` per job).
- `assets/registry.json` gate (missing license = build fail).
- 2 aur skills: `asset-licensing`, `qa-gates`.

**Exit criteria**
1. Ek brief → 5 videos, pairwise visually distinct (manual + PHash check).
2. Batch 5 videos < 25 min end-to-end (drafts par).
3. Zero license violations in manifest. Zero duplicate footage across the 5.
4. Free-model failure par pipeline auto-repair karke complete kare (chaos test: 1 invalid spec inject karo).

---

## Phase 3 — Long-form + Shorts-from-Long (2–3 hafte)

**Goal:** "short aur long dono" wali requirement.

**Deliverables**
- `Long.tsx` composition: chapters, `ChapterCard`, `LowerThird`, re-hook points.
- Long-specific scenes: `BrollStory`, `ChapterRecap`, `DiagramDraw`, `ChartRace` (Recharts).
- `scripts/shorts-from-long.ts`: long transcript → 3–5 vertical cuts (different hooks) → alag specs.
- Chapter-aware caption strategy (line-level for long).
- Music bed management (loop-safe, ducking, loudness continuity).
- CI: long renders GitHub Actions par (job timeout ke andar chunks).

**Exit criteria**
1. 8–12 min video ek spec se bane, chapters aligned, loudness consistent.
2. Ek long → 4 shorts, each with different hook.
3. Long render CI par < 45 min (10 min video).

---

## Phase 4 — Critic Loop + A/B Instrumentation (2 hafte)

> **STATUS (2026-11-20): DONE.** Critic + patches, distinctness gate, thumbnails, review page,
> hook A/B, `data/priors.json` ingest with shrinkage, `out/dashboard.html`, OpenFilm handoff,
> CI publish-batch. Detail: `docs/10-PHASE4-REVIEW.md`, `docs/11-PHASE4B-HOOKS-METRICS.md`.
> What is left: `docs/12-REMAINING-WORK.md`.

**Goal:** system khud improve kare, insaan sirf approve kare.

**Deliverables**
- `stills` + transcript → critic (vision model ya text-only heuristics fallback).
- Spec-patch repair loop (max 2 iterations), diff view.
- Hook A/B engine: same body, 3 hooks → 3 renders → alag publish slots.
- `data/priors.json`: hook formula → measured retention.
- `review.html` dashboard (local, static) — video grid + QA + metrics.
- Metrics ingest (manual CSV → automatic API).

**Exit criteria**
1. Critic ke proposed patches ka ≥50% "accept" rate ho (matlab useful hai).
2. Retention data ke saath hook ranking actually change ho.

---

## Phase 5 — Scale & Automation (ongoing)

- **Topic scout**: trend sources (YouTube trending API, Google Trends, Reddit, HN) → `brief.json` queue.
- **Scheduler**: din ke quota window ke hisaab se (free tiers UTC midnight reset) — heavy LLM runs subah, renders shaam.
- **Publish**: YouTube Data API v3 (upload, schedule, disclosure flag), TikTok Content Posting API (approval), IG Graph API.
- **Multi-channel**: `brands/<channel>/tokens.ts` + separate prior sets.
- **Self-hosted render**: Cloud Run / VPS + self-hosted GitHub runner (agar limits hit hon).
- **Optional AI visuals**: sirf *support* ke tor par (backgrounds/abstract), FreeLLMAPI `/v1/images/generations` — primary nahi.

---

## Timeline (realistic, part-time)

| Phase | Duration | Cumulative |
|---|---|---|
| 0 Spikes | 2–3 din | day 3 |
| 1 One video E2E | 1–2 hafte | day 17 |
| 2 Variation + batch | 2–3 hafte | day 38 |
| 3 Long + shorts-from-long | 2–3 hafte | day 59 |
| 4 Critic + A/B | 2 hafte | day 73 |
| 5 Scale | ongoing | — |

**Agar full-time:** Phase 1–3 ~2 hafte mein possible (magar Phase 0 mat skip karo).

---

## Effort breakdown (jahan asli kaam hai)

| Component | Effort | Note |
|---|---|---|
| Remotion scene library | **40%** | Ye product hai. Yahi pe quality decide hoti hai. |
| Pipeline scripts | 20% | Mostly plumbing, aasan. |
| Asset/licensing layer | 12% | Boring magar must. |
| Agent skills/permissions/hooks | 10% | Aapka "freely chalega" hissa. |
| QA/critic | 10% | System ko self-correcting banata hai. |
| Infra (CI, TTS docker) | 8% | Ek dafa set karo. |

**Sabse bada risk:** scene library ko "accha" banana. 20 mediocre scenes se 6 great scenes behtar hain.

---

## Milestone 1 ke liye "thin slice" (agar aap kal shuru karna chahein)

Absolute minimum jo end-to-end demo de:
1. Ek hardcoded `director.json` (LLM ke baghair).
2. `KineticType` + `StockMontage` scenes only.
3. Kokoro se VO + timestamps.
4. Render + ffprobe check.
5. Baad mein agent ko `director.json` likhne do.

**Isse pehle din aap ek video dekh sakte hain** — motivation + architecture validation dono.

---

## Budget (paise)

| Item | Cost |
|---|---|
| LLM (FreeLLMAPI free tiers) | $0 |
| TTS (Kokoro local) | $0 |
| Stock (Pexels/Pixabay/Openverse/NASA) | $0 |
| Remotion license | $0 (solo/≤3 employees) |
| Local render | $0 (bijli) |
| GitHub Actions (public repo) | $0 (limits ke andar) |
| **Total to first 100 videos** | **≈$0** |
| Domain/hosting (optional publish pages) | ~$12/yr |
| Agar company 4+ | $25/seat/mo ya $0.01/render |

**Time cost asli cost hai** — Phase 0–3 ≈ 60–75 din part-time.

---

## Kya *na* karna (anti-scope)

- ❌ Veo/Sora/Gen-3 integration Phase 4 tak — deterministic engine pehle.
- ❌ Auto-publish bina human approval ke Phase 5 tak.
- ❌ Random GitHub repos runtime par clone karna.
- ❌ 50 templates ek saath — 6 great scenes se shuru.
- ❌ Edge TTS commercial videos mein.
- ❌ `--dangerously-skip-permissions` daily-driver machine par.
- ❌ Ek hi template se 100 videos (channel ban ho jayega).
- ❌ LLM se timing/duration decide karwana.
