# 04 — Open Questions (jo aapke jawab par depend karte hain)

> **UPDATE (answered):** aapne ye lock kar diya —
> - **Niche:** tech / AI explainers (Q1)
> - **Style:** motion graphics / kinetic typography — zero video model, zero stock dependency (Q5)
> - **Shuruaat:** poora Phase 1 scaffold (Q3)
> - **Extras:** agent prompts + skills drafts + setup checklist (dono)
>
> Yani architecture ab **`08-PHASE1-SCAFFOLD.md`** par locked hai. Neeche ke sawal sirf wo hain jo abhi bhi khule hain (language, long-form ki exact length, publish automation, provider keys).

## 1. Content niche — ✅ LOCKED
**tech / AI / creator-economy explainers.** Isliye scene library `KineticType`, `CodeTyping`, `TerminalCast`, `StatCard`, `ChartReveal`, `DiagramDraw` par focus karti hai, aur stock footage Phase 1 se bahar hai.

## 2. Language — ⏳ OPEN (default: English)
**Default:** English (single-language TTS pipeline).
Urdu chahiye toh: Kokoro Urdu support nahi (EN + kuch European/Asian), isliye Urdu ke liye Chatterbox/CosyVoice route ya Piper-urdu — alag Phase. Bilingual captions (EN VO + UR subtitles) aasan hai.

## 3. Pehla milestone
**Default:** *"ek video end-to-end"* (Phase 1), phir volume.
Alternative: 5 handcrafted templates pehle, phir agent — agar aapka focus *design quality* hai.

## 4. Renders kahan
**Default:** drafts laptop par, finals GitHub Actions par.
Agar aapke paas achha machine nahi (8GB RAM) → CI-first.

## 5. Video style — ✅ LOCKED
**motion graphics / kinetic typography.** Koi video model nahi, koi stock dependency nahi. Iska matlab: output "video-as-code" look hoga (text, code, charts, diagrams, procedural motion) — cinematic AI footage nahi. Ye $0 cost, deterministic aur copyright-safe hai.

## 6. Publish automation
**Default:** Phase 5 tak manual upload (review gate).
Auto-publish chahiye jaldi? Bolo — magar channels ka risk barhta hai.

## 7. Long-form ki definition
**Default:** 8–12 min, chapterized explainer, single narrator.
Alternative: 20–30 min deep dives (render cost 3–4x, CI mandatory), ya podcast-style (2 voices).

## 8. Remotion license context
**Default:** solo use → free tier.
Agar 4+ log / company / client work → license budget plan mein add.

## 9. Agent autonomy
**Default:** `dontAsk` + allowlist + deny + PreToolUse guard hook (aapka "always yes" isi mein milta hai, magar destructive commands block rehte hain).
Full `--dangerously-skip-permissions` chahiye? Sirf disposable container mein.

## 10. FreeLLMAPI keys
Kaunse providers ke keys aapke paas hain/mil sakte hain? (Groq, Cerebras, Google AI Studio, Mistral, OpenRouter, NVIDIA, Z.ai, HF...)
**Default chain:** Groq (speed) → Cerebras (speed) → Google (quality) → OpenRouter free (breadth) → Mistral → local Ollama fallback.
Cohere chain se **hata do** (ToS: personal use forbidden).

---

## Ek aakhri sawal (jo sab decide karta hai)

**Aap ise kis liye bana rahe hain?**
- (a) apna channel grow karne ke liye → variation engine + analytics loop priority
- (b) clients ke liye video service → brand token layer + review UI priority
- (c) ye khud ek product/tool banega (log ise use karein) → multi-tenant, docs, licensing priority
- (d) seekhne/experiment ke liye → thin slice, fastest dopamine

Har jawab ka architecture par asar hota hai. Bata dein toh `02-PLAN.md` ke phases re-prioritize kar dunga.

---

## Status summary

| # | Decision | Status |
|---|---|---|
| 1 | Content niche | ✅ tech / AI |
| 2 | Language | ⏳ English (default) |
| 3 | Pehla milestone | ✅ poora Phase 1 scaffold |
| 4 | Renders kahan | ✅ local draft / CI final (default) |
| 5 | Visual style | ✅ motion graphics (zero video/stock model) |
| 6 | Publish automation | ⏳ manual till Phase 5 (default) |
| 7 | Long-form length | ⏳ 8–12 min (default) |
| 8 | Remotion license | ⏳ solo → free tier (confirm employees ≤3) |
| 9 | Agent autonomy | ✅ allowlist + `dontAsk` + deny + guard hook |
| 10 | Provider keys | ⏳ Groq → Google → Cerebras → OpenRouter → Mistral → Ollama |

Locked decisions ka implementation map **`docs/08-PHASE1-SCAFFOLD.md`** mein hai.
