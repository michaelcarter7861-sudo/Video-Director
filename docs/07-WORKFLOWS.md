# 07 — WORKFLOWS (daily / per-video / batch / long-form)

> System ready hone ke baad aap *actually* kaise kaam karenge. Har workflow ke saath: kaun karta hai (agent vs engine vs insaan), aur kitna time lagta hai.

---

## W1 — "Ek short" (daily driver) · ~6–10 min wall clock

```
INSAN      brief likhta hai (2 line) → briefs/today.json
AGENT      research + thesis + 3 hooks + beats → director.json
ENGINE     schema validate → fix loop (max 2) → kokoro VO → timestamps
ENGINE     timeline → assets (motion-only, no download) → props
ENGINE     draft render (480p, stills) → qa.json
AGENT      critic: stills + transcript → patch ya ship
INSAN      review.html dekhta hai → approve / reject with note
ENGINE     final render 1080x1920 → publish.json + srt + thumbnail
INSAN      upload (Phase 3 tak manual)
```

**Cost:** 4–6 LLM calls, 0 API keys for media, 2 render passes.
**Rule:** insaan sirf 2 jagah touch karta hai — brief aur approve. Baaki agent + engine.

---

## W2 — "Batch of 5 variations" · ~25–40 min

Ek brief, 5 alag videos (different `variationSeed`, different hook, different template family):

```
ENGINE    5 × director.json?  NAHI — agent ek "series spec" deta hai:
          { thesis, shared_beats, hooks: [5], variants: [5 seeds + families] }
ENGINE    har variant ko independently build + draft render (parallel, concurrency 2)
AGENT     critic: 5 drafts ke beech pairwise distinctness check karo
INSAN     best 2-3 approve karo
```

**Kyun aisa:** 5 alag LLM scripts likhwana = 5x quota + inconsistency. Ek thesis + 5 variants = **YouTube "inauthentic content" policy ke against aapka defense** (same substance, visibly different treatment).

**Distinctness check (QA gate):**
- palette hash alag
- font pair alag (ya display font alag)
- template family alag
- pehla on-screen frame alag
- asset perceptual hash overlap < 20%

---

## W3 — "Long-form" · 1.5–3 hours

```
INSAN      brief + sources list (links, notes, data files)
AGENT      research (outline + 8-10 chapters + claims-with-sources)
ENGINE     chapter beats → VO (per-chapter files, taake ek chapter re-render ho sake)
ENGINE     timeline (chapter boundaries = audio boundaries)
ENGINE     chart/code/diagram scenes ke liye data files consume
ENGINE     CI render (chunked) → assemble → loudness pass
AGENT      critic per chapter (drop-off prediction)
INSAN      full watch (ye step skip mat karo — long form mein pacing ka judgment insaan ka kaam hai)
```

**Long-form specific rules:**
- Per-chapter audio files (monolithic VO = har edit par poora re-render).
- Chapter scenes: `ChapterCard` (1.5s), `LowerThird` (speaker/topic), `RecapGrid` (end).
- Re-hook every 60–90s → spec mein `rehook: true` beat flag.
- Render chunks in CI (`--frames=0-1799`, `1800-3599`, …) → FFmpeg concat. 6h job limit se bacho.

---

## W4 — "Long → shorts" (ek transcript se 5 shorts) · ~20 min

```
ENGINE     long transcript + captions.json lo
AGENT      5 candidate windows choose karo (self-contained 30-45s, strong opening line)
AGENT      har window ke liye 3 hooks (long ke content se, naya nahi)
ENGINE     har short ka spec + vertical reframe (kinetic-type re-treatment, sirf crop nahi)
ENGINE     batch draft render
INSAN      approve
```

**Important:** "crop karke short banao" = lazy = inauthentic. Vertical version ka **apna** visual treatment hona chahiye (text bade, pacing tez, captions karaoke). Isliye re-treatment, re-crop nahi.

---

## W5 — "Weekly research / catalogue" (background) · 30 min, hafte mein ek

```
AGENT(scout)  GitHub search + topic pages → candidate repos
AGENT(scout)  license + last-commit + deps check
AGENT(scout)  docs/catalogue/<date>.md + PR (max 10 entries)
INSAN         PR review (10 min) → merge
```

Isse aapka "thousands of repos" wala idea **sustainably** chalta hai: catalogue barhta hai, codebase saaf rehta hai.

---

## W6 — "Metrics → next batch" (learning loop) · hafte mein ek

```
ENGINE   YouTube Analytics / manual CSV → data/metrics/<date>.json
ENGINE   aggregate: hook_formula × avg_3s_retention, template_family × completion
ENGINE   data/priors.json update (committed → reproducible decisions)
AGENT    next brief ke hooks ko priors se rank karo
```

**Rule:** priors.json ke baghair koi "data-driven" claim nahi. Warna aap andaza laga rahe hain.

---

## W7 — "Emergency / model down" (resilience)

Agar FreeLLMAPI ke saare free tiers down ya quota khatam:

```
1. ENGINE abhi bhi chalta hai (LLM-free) — purane spec se re-render karo
2. Local Ollama add karo custom provider ke tor par (FreeLLMAPI dashboard → custom)
3. AGENT ke bina: spec haath se likho (schema 20 min ka kaam hai)
4. Template factory mode: data/queue.json → 10 pre-written specs → render
```

**Isliye architecture LLM se decoupled hai.** Video production kabhi model availability par nahi rukta.

---

## Roles summary

| Kaam | Kaun | Kyun |
|---|---|---|
| Thesis, hooks, beats | Agent (LLM) | Creativity + language |
| Timing, frames, captions | Engine | Deterministic, accurate |
| Asset selection | Engine (rules) + Agent (query) | License safety engine mein |
| Render | Engine/CI | Reproducible |
| Numeric QA | Engine | Trustworthy |
| Taste/judgment | **Insaan** | LLM nahi kar sakta |
| Publish decision | **Insaan** (Phase 5 tak) | Reputation risk |

---

## Time budget (realistic, per week)

| Activity | Time |
|---|---|
| 5 shorts (W1 × 3, W2 × 1, W4 × 1) | 3–4 hours |
| 1 long-form (W3) | 2–3 hours |
| Review + approve | 1 hour |
| Catalogue + metrics (W5, W6) | 45 min |
| **Total** | **~7–9 hours/week for 5 shorts + 1 long** |

Vs. manual editing: 5 shorts + 1 long = 15–25 hours. **Yahi asli ROI hai** — virality nahi, throughput + consistency.

---

## Failure drills (mahine mein ek baar)

1. **Chaos spec:** deliberately invalid director.json inject karo → kya pipeline recover karta hai?
2. **Quota exhaustion:** ek din ke liye top model block karo → fallback chain kaam karta hai?
3. **Asset drought:** stock provider band karo → motion-only mode mein render hota hai?
4. **Distinctness test:** 5 videos side by side → kya ek insaan 3 second mein farq bata sakta hai?
5. **License audit:** random video ka manifest kholo → har asset traceable?
