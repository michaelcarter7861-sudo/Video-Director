# 04 — Open Questions (jo aapke jawab par depend karte hain)

> Ye wo decisions hain jo main aapke bina lock nahi kar sakta. Har ek ka **default** likha hai — agar aap chup rahein, main default maan lunga.

## 1. Content niche (sabse important)
**Default:** tech / AI / creator-economy explainers.
Kyun: code-text visuals, terminal aesthetics, charts, aur screen-captures — sab aapki zero-cost engine ki strength hain. Finance/health mein "B-roll" aur "trust" ki zaroorat zyada hoti hai.
**Sawal:** kis niche ke liye videos chahiye?

## 2. Language
**Default:** English (single-language TTS pipeline).
Urdu chahiye toh: Kokoro Urdu support nahi (EN + kuch European/Asian), isliye Urdu ke liye Chatterbox/CosyVoice route ya Piper-urdu — alag Phase. Bilingual captions (EN VO + UR subtitles) aasan hai.

## 3. Pehla milestone
**Default:** *"ek video end-to-end"* (Phase 1), phir volume.
Alternative: 5 handcrafted templates pehle, phir agent — agar aapka focus *design quality* hai.

## 4. Renders kahan
**Default:** drafts laptop par, finals GitHub Actions par.
Agar aapke paas achha machine nahi (8GB RAM) → CI-first.

## 5. Video style
**Default:** kinetic typography + stock b-roll + charts + code (motion-graphics documentary look).
Aap "cinematic AI footage" chahte hain? Wo is architecture mein **nahi** milega — uske liye image-gen + img2video model chahiye, jo aapki requirement ke khilaf hai. Confirm karein ke motion-graphics look acceptable hai.

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
