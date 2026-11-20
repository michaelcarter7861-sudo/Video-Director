# Video-Director

**Agent-as-Director, Engine-as-Renderer** — Claude Code + free LLM APIs + Remotion se viral short aur long videos, bina kisi video model ke.

> Status: **Planning / Research phase.** Filhaal koi code nahi. Ye repo abhi sirf architecture aur roadmap rakhta hai.

## Documents

| File | Kya hai |
|---|---|
| [`docs/00-RESEARCH.md`](docs/00-RESEARCH.md) | Research findings: FreeLLMAPI, Claude Code permissions, Remotion, free TTS, stock/asset sources, viral structure data, GitHub repos, risk register |
| [`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md) | Poora system design: 3-tier model, director spec schema, component inventory, folder layout, short vs long, alternative approaches, failure modes |
| [`docs/02-PLAN.md`](docs/02-PLAN.md) | Phase 0–5 roadmap, milestones, exit criteria, effort breakdown, budget, anti-scope |
| [`docs/03-REPO-CATALOGUE.md`](docs/03-REPO-CATALOGUE.md) | Kaunse GitHub repos *kaise* use karein (pin / read / data / skill) + acceptance gate + weekly scout process |
| [`docs/04-OPEN-QUESTIONS.md`](docs/04-OPEN-QUESTIONS.md) | Wo decisions jo aapke jawab par depend karte hain (defaults ke saath) |

## 30-second summary

```
Claude Code (FreeLLMAPI ke zariye free models)
      ↓  likhta hai
director.json  ← strict schema: thesis, hook variants, beats, visual types, style, audio, budget
      ↓  deterministic engine (koi LLM nahi)
Kokoro TTS → word timestamps → timeline → assets (license-gated) → props
      ↓
Remotion render (local draft / GitHub Actions final) → mp4 + stills + manifest
      ↓
QA gates (loudness, blackdetect, caption overflow) → critic loop → review → publish pack
```

**Kyun:** video banane ka kharcha $0, output reproducible, iteration seconds mein, aur aapka asli asset *template library + agent skills* ban jaata hai — model badle toh bhi kaam chalta rahe.

## Shuru kahan se

1. `docs/04-OPEN-QUESTIONS.md` par apne jawab dein (10 decisions).
2. `docs/02-PLAN.md` ka **Phase 0** (2–3 din ke spikes) chalayein — architecture assumptions verify karne ke liye.
3. Uske baad Phase 1: "one video, end-to-end".

## Boundaries (honest)

- "Viral" guaranteed nahi hai. Ye pipeline *volume + structure + measurement* deti hai, luck nahi.
- Koi video model (Sora/Veo/Kling) use nahi hoga → look motion-graphics/kinetic-type hoga, cinematic AI footage nahi.
- Free tiers/quotas waqt ke saath badalte hain → multi-provider fallback + local Ollama fallback built-in.
- Remotion source-available hai: individuals aur ≤3 employees ke liye free (commercial bhi); usse barhe toh license chahiye.
