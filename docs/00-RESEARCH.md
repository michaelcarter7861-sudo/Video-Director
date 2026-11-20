# 00 — RESEARCH (Nov 2026)

> Ye document **sirf research aur findings** hai. Koi code nahi. Har claim ke saath source/date diya gaya hai, aur jo cheezein verify nahi hui unhein "unverified" mark kiya gaya hai.

---

## TL;DR — Seedha jawab

**Haan, ye bann sakta hai.** Architecture 100% feasible hai, aur poori pipeline **$0/infra cost** par chal sakti hai. Lekin 3 cheezein clear kar lena zaroori hai:

1. **"Viral" guarantee nahi hoti.** Pipeline *volume + hook structure + retention-friendly pacing + measurement loop* de sakti hai. Virality platform algorithm + audience + luck ka function hai. Jo bhi koi "guaranteed viral" bole, wo bech raha hai.
2. **"Bina video model" ka matlab visual style change ho jaata hai.** Koi Sora/Veo/Gen-3 nahi. Toh video **motion graphics + kinetic typography + stock footage + data-viz + code/terminal visuals + shaders** se banega — yani *Remotion-native* content. Ye actually ek advantage hai: 100% deterministic, brandable, editable, aur copyright-safe. Lekin "cinematic AI actor" wala content isse nahi banega.
3. **Claude Code free models par chalega — par reliability kam hogi.** FreeLLMAPI `/v1/messages` (Anthropic wire) deta hai, toh Claude Code technically chal jaata hai. Magar free-tier models ka tool-calling + long-context agentic reliability frontier Claude se kam hai, aur din ke aakhir mein quota khatam hone par router weaker models par degrade ho jaata hai (repo khud ye limitation likhta hai). Isliye architecture ko **"kam-LLM, zyada-deterministic"** rakhna hoga — LLM sirf *director* hoga, *renderer* nahi.

**Verdict: banao. Magar "agent sab kuch live likhega" model se shuru mat karo — "agent spec likhta hai, deterministic engine video banata hai" model se shuru karo.** Detail `01-ARCHITECTURE.md` mein.

---

## 1. FreeLLMAPI (tashfeenahmed/freellmapi)

**Kya hai:** Self-hosted, MIT-licensed, OpenAI-compatible gateway jo ~87 providers ke free tiers ko ek `/v1` endpoint ke peeche stack karta hai. Node 20+, SQLite (keys AES-256-GCM encrypted), dashboard `http://localhost:3001`. Claims: 1,313 free model endpoints, ~10.1B tokens/month theoretical. Docker one-liner install, macOS/Windows desktop apps bhi.

**Media surfaces bhi hain** (important!): `/v1/images/generations`, `/v1/videos/generations`, `/v1/audio/speech`, `/v1/audio/transcriptions`, `/v1/embeddings`. Yani **TTS aur image gen bhi isi gateway se free mil sakta hai** — chahe hum primary TTS local Kokoro rakhein, backup ke liye ye fallback hai.

**Claude Code wiring (documented):**
- Anthropic Messages surface: `/v1/messages` — Claude Code isi ko use karta hai.
- Base URL = **bare origin** (`http://localhost:3001` ya desktop app par `http://127.0.0.1:31415`), **`/v1` ke baghair** (Claude Code khud path append karta hai). Ye ek common mistake hai.
- `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN=<unified-key>`.
- Automated: `npx freellmapi setup-claude --url http://localhost:3001` (live catalog se model IDs, config backup + merge). `npx freellmapi launch` credentials ko disk par likhe baghair Claude Code start karta hai — **ye preferred hai** kyunke key config files mein nahi jaati.
- Router features jo hamare use-case ke liye critical hain:
  - **Tool-call rescue** — jo models tool calls ko plain text mein nikaalte hain, unhein structured `tool_calls` mein convert karta hai. Claude Code jaise agent ke liye ye must-have hai.
  - **Per-key RPM/RPD/TPM/TPD tracking + cooldowns + failover** (429/5xx par next model).
  - **Sticky sessions** (30 min) + **context handoff/compact note** — mid-chat model switch par thread coherent rehta hai.
  - **Named fallback-chain profiles** (`auto:<profile>`) — yani hum ek "coding chain" (strong tool-callers) aur ek "copywriting chain" (fast/creative) bana sakte hain. **Ye architecture ka hissa hona chahiye.**
  - **Fusion model** (multi-model synthesis) — hook/script brainstorming ke liye useful.

**Honest limitations (repo ke apne docs se):**
- Free-tier quota hi ceiling hai, model class nahi. **Din baad mein intelligence degrade hoti hai** (top models ke daily caps sabse chhote hain), UTC midnight par reset.
- Latency variable. Free tiers bina notice badalte hain. Koi SLA nahi.
- Single-user by design — internet par expose mat karo.
- ToS table: Gemini ⚠️, NVIDIA NIM ⚠️ (evaluation only), **Cohere ❌** (personal use forbidden), Z.ai ⚠️. → **Policy: per-video ki "commercially safe" providers list lock karo; Cohere chain se hata do.**

**Hamare liye implication:** Claude Code + FreeLLMAPI = *development-time* agent. **Render-time par LLM ki zaroorat nahi honi chahiye** — warna video generation quota par depend karega aur non-reproducible hoga.

---

## 2. Claude Code (agent + permissions)

Aaj Claude Code mein jo cheezein relevant hain:

- **Headless:** `claude -p "<prompt>" --output-format json` — CI/scheduled jobs ke liye. JSON output mein `permission_denials` aata hai (audit ke liye sona hai).
- **Permission modes:** `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`, `auto`.
- **"Always yes" ka sahi tareeqa:** blanket `--dangerously-skip-permissions` mat lagao. Uska matlab hai agent aapke `~/.ssh`, `.env`, aur production creds tak pahunch sakta hai. Iske bajaye:
  - `--permission-mode dontAsk` + explicit `allow` list + `deny` list + `--permission-prompts none` (jab koi jawab dene wala na ho).
  - **Deny rules `bypassPermissions` mein bhi lagu rehte hain** — yani deny list aapka real guardrail hai, allow list nahi.
  - Disposable container/VM + network restricted = tab bypass acceptable.
- **Scopes:** `.claude/settings.json` (project, commit karo), user settings, managed settings (enterprise `disableBypassPermissionsMode`).
- **Rules syntax:** `Bash(npm run test *)`, `Edit(/src/**)`, `Read(./.env)` deny, `WebFetch` deny, etc. Subagents bhi gated hain: `Agent(Explore)`, `deny: Agent(model:opus)`.
- **Hooks:** `PreToolUse` (allow/deny/ask/defer — arbitrary policy, e.g. "sirf `bot/*` branch par push"), `PermissionRequest` (human ki jagah decision), `PostToolUse`. **Yahan hum "video pipeline guardrails" likh sakte hain.**
- **Skills:** `SKILL.md` format. Remotion ka official skill pack isi format par hai — matlab hum apna `video-director` skill pack bhi isi tarah likh sakte hain.
- **Subagents:** parallel research/QA ke liye (e.g. `asset-scout`, `script-critic`, `render-qa`).

**Permission policy jo main recommend karta hoon (Phase 1):** `dontAsk` + allow: `Edit`, `Read(/**)`, `Bash(npm ci|npm run *)`, `Bash(npx remotion *)`, `Bash(ffmpeg *)`, `Bash(ffprobe *)`, `Bash(git add|commit|status|diff|log)`, `Bash(python3 scripts/*)`; ask: `Bash(git push *)`; deny: `Bash(rm -rf *)`, `Bash(sudo *)`, `Read(./.env*)`, `Read(./secrets/**)`, `Bash(curl * | sh)`, `WebFetch` (jab tak asset-fetch tool na bane). **Yani "always yes" jo aap chahte hain, wo *allowlist ke through* milega — blind YOLO se nahi.** Ye distinction aapko baad mein dard se bachayega.

---

## 3. Remotion (video engine)

**Kya hai:** React/TSX se video. Frame-based determinism (`useCurrentFrame`, `interpolate`, `spring`), headless Chrome + bundled FFmpeg se MP4/WebM/GIF. Studio mein HMR preview.

**Kyun yehi:** video = Git-friendly code, props se parameterizable (ek template → 1000 variants), CI par reproducible render, aur **Claude Code ke liye official Agent Skills** majood hain.

**Agent Skills (crucial):** `npx remotion skills add` (ya `npx skills add remotion-dev/skills`) → 13 skills `.agents/skills` mein + `.claude/skills` par linked. Claude Code plugin bhi hai: `claude plugin marketplace add remotion-dev/claude-plugin` / `claude plugin install remotion@remotion`. Main skill: `remotion-best-practices` (determinism, memory), plus `remotion-captions`, `remotion-transitions`, `remotion-multimedia`, `remotion-studio`, `remotion-render`. **Yehi hamare skill pack ki base hai — humein wheel reinvent nahi karna.**

**Render surfaces:** local CLI (`npx remotion render <id> out.mp4`, `--concurrency`, `--crf`, `--scale`), Node `@remotion/renderer` API, **GitHub Actions** (recommended projects mojood hain), AWS Lambda / GCP Cloud Run, `@remotion/player` (browser embed).

**Captions (important):** `@remotion/install-whisper-cpp` → `transcribe()` + `toCaptions()` → `Caption[]` (per-word `startMs/endMs/confidence`) → `@remotion/captions` ke `createTikTokStyleCaptions()` se word-by-word karaoke captions. Whisper API alternatives bhi hain (`@remotion/openai-whisper`, `@remotion/elevenlabs`), aur `.srt` parse karne ka option. **Yani word-level captions free + offline possible hain.**

**License — zaroori:** Remotion **source-available** hai, MIT nahi. Free License: individuals, non-profits, aur **3 ya kam employees wali for-profit companies**, commercial use allowed. 4+ employees → Creator seats ($25/seat/mo) ya Automators ($0.01/render, $100/mo minimum). **Aap solo hain toh $0 — magar agar channel/company 3 se barhe toh license lena hoga.** Ye planning mein budget line honi chahiye.

**Determinism ke rules (agent ke liye hard rules):** `setTimeout`/CSS keyframes nahi, `random()` ko seed karo, assets `staticFile()` se, fonts `@remotion/google-fonts` ya `delayRender` ke saath embed, network fetch render ke andar nahi (pre-fetch karo). Ye rules skill pack mein likhe jayenge.

---

## 4. Audio (voiceover) — free options

| Option | License | Word timestamps | Notes |
|---|---|---|---|
| **Kokoro-82M** (`hexgrad/kokoro`) | Apache 2.0 | ✅ (Kokoro-FastAPI `/dev/captioned_speech`) | 82M params, CPU par real-time se 90–210x tez, 1GB se kam weights. **Default pick.** |
| **Kokoro-FastAPI** (`remsky/Kokoro-FastAPI`) | MIT wrapper | ✅ per-word, multi-speaker | OpenAI-compatible `/v1/audio/speech` + caption endpoint + Docker. Yani apni pipeline ka "TTS service". |
| **Chatterbox / Chatterbox-Turbo** (`resemble-ai/chatterbox`) | MIT | ⚠️ check | Voice cloning (5–10s reference), emotion/paralinguistic tags. Blind test mein ElevenLabs se aage (vendor-adjacent claim — unverified independently). GPU chahiye. |
| **Piper** | MIT | partial | Sabse halka, quality kam. Fallback. |
| **Edge TTS** | ❌ ToS risk | ✅ | Free aur acha hai, **magar** Microsoft staff ke mutabiq Azure subscription ke baghair commercial use ToS violate kar sakta hai. **Commercial videos ke liye avoid.** |
| **FreeLLMAPI `/v1/audio/speech`** | aggregated | ⚠️ provider-dependent | Backup/failover ke liye. |

**Alignment strategy:** TTS ke timestamps = primary truth (Kokoro captioned endpoint). Agar timestamps na milein → `whisper.cpp` (medium.en, CPU) se force-align. **Kabhi bhi estimated duration par caption na banao.**

**Music/SFX:** CC0 sources — Freesound (CC0 filters), `lotsofsounds` (12,000+ CC0, REST + MCP; sample endpoints keyless), Pixabay audio (⚠️ standalone redistribution mana), YouTube Audio Library (platform-restricted). **Policy: har asset ke saath license + attribution metadata manifest mein record ho, warna video publish-unsafe hai.** Ek important gotcha: **MoneyPrinterTurbo ka bundled music repo khud kehta hai "YouTube se liya gaya, copyright issue ho toh delete karo"** — yani wo default path commercially unsafe hai. Hum wo galti nahi karenge.

---

## 5. Visual assets — stock, images, code-visuals

- **Pexels API** — video + photo, free 200 req/hr & 20k/month, attribution per API terms. ⚠️ **Nov 2026: repo/site ne note kiya ke naye API key issuance paused hain** — Phase 0 mein verify karo. Agar blocked → Pixabay.
- **Pixabay API** — images + videos, 100 req/60s, caching required, no permanent hotlinking.
- **Openverse API** — openly licensed images/audio, keyless (rate-limited). Good for CC-BY with attribution tracking.
- **Wikimedia Commons + NASA Image & Video Library + Met Museum API** — keyless, public-domain heavy. **NASA footage public domain hai** — space/science content ke liye goldmine, aur commercially safest.
- **Fonts:** `@remotion/google-fonts` (OFL), ya self-host OFL variable fonts (Inter, Space Grotesk, Manrope).
- **Icons:** Lucide, Tabler, Phosphor (MIT).
- **Motion:** `@remotion/transitions`, `@remotion/lottie` (LottieFiles free tier licenses careful), `@remotion/shapes`, `@remotion/paths` (SVG line drawing), `@remotion/noise` (organic motion), `@remotion/motion-blur`, Three.js via `@remotion/three` (3D).
- **Shaders/GLSL:** **gl-transitions** (MIT — 90+ transitions), **lygia** (MIT shader library), `@remotion/gl`/WebGL canvas injection.
- **Data-viz:** Recharts / Visx / D3 in React — Remotion ke andar chalte hain, yani "chart race", "animated map", "counter" scenes free.
- **Code visuals:** Shiki/Prism syntax highlighting + typing animation — **hamare niche (tech/coding content) ke liye killer format**.
- **Screen recordings:** Playwright scripts se actual website/terminal capture (deterministic, brandable).

---

## 6. "GitHub par pade thousands of repos" — kaise realistically use karein

Ye aapke idea ka sabse romantic hissa hai, aur ismein sabse zyada risk hai. Honest breakdown:

**Ye galat tareeqa hai:** "agent GitHub search karega aur random repos clone kar ke code chalayega." Reasons: (a) license violations (GPL/AGPL code aapke product mein), (b) supply-chain risk (`npm install` from unvetted repo), (c) quality/bitrot, (d) non-deterministic output, (e) agent ka time/quota burn.

**Ye sahi tareeqa hai — GitHub ko 4 alag tarah se use karo:**

1. **Curated dependency layer (npm/pip):** scene library ke liye mature packages pin karo (`remotion`, `@remotion/*`, `d3`, `shiki`, `gsap`(careful: license), `three`). `package.json` mein lockfile + `npm ci`. **Repos ko *padho*, code ko *pin* karo.**
2. **Curated skill/knowledge layer:** `remotion-dev/skills`, Remotion Claude plugin, aur 5–10 hand-picked "video pipeline" repos jo *patterns* sikhayein (MoneyPrinterTurbo ka pipeline shape, `vincentsch/explainroo` — "local Kokoro + Whisper timing + canvas renderer" wala exact combo, `amaymour/Remotion-video-pipeline` — GitHub Actions render + props, `shasitianshi-cloud/remotion` — VPS dispatch → Actions render → artifact evidence pattern). Inko **padho, copy-pattern karo, fork mat karo** (fork = maintenance debt + license mixing).
3. **Curated asset indices (data, not code):** CC0/PD asset repos — fonts (OFL), icons (MIT), sound effects (CC0), public-domain footage indices, LUT/palette collections (jaise `skyzhao1223/free-for-creators` jaisa "license-verified" index idea). Yahan agent *search* kar sakta hai kyunke data hai, code nahi.
4. **Discovery = periodic human-approved scan, not runtime:** hafte mein ek "scout" run jo GitHub search + topic pages se candidate repos nikaale, unka license/last-commit/deps check kare, aur **ek shortlist PR** banaye. Insaan 10 minute mein approve kare. **Yahi "thousands of repos" ka scalable, safe version hai — ek asset catalogue jo waqt ke saath barhta hai.**

**Ek repo accept karne ka gate (checklist):** license file majood + compatible? last commit < 12 months? `npm audit`/`pip-audit` clean? executable code hai ya data? network calls render-time par? maintainer unknown? → warna reject.

---

## 7. Viral structure — jo research actually kehti hai

Numbers marketing blogs se hain (self-reported sample sizes), isliye **hypothesis** treat karo, gospel nahi:

- **Hook 0–3s** sab kuch decide karta hai. Reportedly first-second hook = +41% retention; humor in first 3s = +51% shares. **Kahani channel intro se shuru nahi hoti — mid-action se hoti hai.**
- **4-block structure:** Hook (0–3s) → Tension/Agitate (3–8s) → Payoff (8–35s) → Loop/CTA (35–45s).
- **Visual change har 2–3s**, "one idea per sentence", 6th-grade reading level (reportedly ~2x views).
- **75 words ≈ 30 seconds.** Isse humein **word-budget → duration** ka deterministic formula milta hai. Ye pipeline design mein directly use hoga.
- **Seamless loop:** last line ko first line se connect karna completion ko double kar sakta hai (reportedly).
- **5 hook formulas:** Contrarian Reality, Curiosity Gap, Empathy Callout, Specific Number, Pattern Interrupt. (Plus "Steal This", "I Tried X", Bold Promise.) → **hook variants ko A/B test karo, ek hook par mat ruko.**
- **Long-form:** cold open (0–15s) → promise → chapters; har 60–90s par re-hook; 8th-grade level; payoff density > production value.

**Counter-weight (ye zaroori hai):** YouTube ne July 2025 mein "repetitious content" ko **"inauthentic content"** rename kiya, aur July 2026 mein 3 categories mein split kiya — *generic/repetitive*, *unsatisfying/off-putting*, *sensitive topics par AI personas*. Mass-produced template videos monetization-ineligible hain. Yani **100 near-identical shorts = channel death.** Isliye architecture mein "variation engine" (per-video style/format/pacing randomization + topics research) aur "originality layer" (data, unique angle, human-approved thesis) built-in hoga. **Volume strategy ko variation ke saath hi ship karna hai, warna scale karke nuksan hoga.**

---

## 8. Risk register (research-derived)

| Risk | Impact | Mitigation |
|---|---|---|
| Free models ka tool-calling flaky | Agent loops, wasted quota | Tool-call rescue (FreeLLMAPI), strong-tool-call models only, structured spec outputs, retries, `dontAsk` + narrow tasks |
| Din ke end mein intelligence degrade | Builds fail raat ko | Daily quota ko Phase ka hissa maano; deterministic scripts par zyada depend; UTC-midnight aware scheduling |
| Free tiers/keys band ho jayein | Pipeline ruk jaye | Multi-provider chain + `custom` OpenAI-compatible endpoint (Ollama/LM Studio local fallback) |
| Remotion license threshold | Legal/cost | Solo/family use → free; 4+ employees → budget $25/seat ya $0.01/render |
| Edge TTS ToS | Commercial risk | Kokoro/Piper default, Edge sirf internal drafts |
| Pexels key issuance paused | Asset supply | Pixabay + Openverse + NASA/Wikimedia + Playwright capture |
| YouTube inauthentic policy | Monetization | Variation engine + original data/angle + disclosure |
| Stock license/attribution miss | Takedown | Asset manifest mein license+attribution mandatory; build fail if missing |
| Agent destructive commands | Data loss | Deny list + `PreToolUse` hook + container + git checkpoints |
| Render time/cost | Slow iteration | Preview stills (`--frames`), low-crf drafts, GH Actions public-repo free minutes |

---

## 9. Phase-0 spikes (jo pehle *verify* karna hai, code likhne se pehle)

1. FreeLLMAPI + Claude Code: 10 real tasks (edit file, run test, render), success rate + p50 latency measure. Target: ≥80% task success without human nudge.
2. `npx remotion skills add` + ek 15s vertical video end-to-end (script→kokoro→captions→render).
3. Kokoro-FastAPI word timestamps ka accuracy check (manual vs reported).
4. GitHub Actions public repo par Remotion render: kitna time, artifact size, 6h limit se kitna door.
5. Pexels API key availability (aaj paused hai) → fallback confirm.
6. Agent ka "frame stills dekh kar self-critique" loop: kya free model vision deta hai? Agar nahi → numeric QA gates par depend karo.

**In 6 spikes ke bina architecture freeze mat karo.**
