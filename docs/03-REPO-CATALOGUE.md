# 03 — REPO CATALOGUE (jo asli kaam aayenge)

> "GitHub par pade thousands of repos ko kaise use karein" ka concrete jawab. Har repo ek role ke saath, aur *kaise* use karna hai (fork / pin / padho). Nov 2026 research.

**Legend — use mode:**
- **PIN** = dependency ke tor par `package.json`/docker mein pin karo (code chalega).
- **READ** = pattern/architecture samajhne ke liye padho, copy-pattern karo, fork na karo.
- **DATA** = assets/knowledge index, runtime par query ho sakta hai.
- **SKILL** = agent ko sikhane ke liye install karo.

---

## A. Video engine (core)

| Repo / package | Use | Kyun |
|---|---|---|
| `remotion-dev/remotion` | **PIN** | React video framework. Frame determinism + headless Chrome + FFmpeg. |
| `@remotion/*` (`transitions`, `captions`, `paths`, `shapes`, `noise`, `motion-blur`, `lottie`, `three`, `google-fonts`, `layout-utils`, `media-utils`, `renderer`) | **PIN** | Scene library ke building blocks. |
| `remotion-dev/skills` | **SKILL** | 13 official agent skills. `npx skills add remotion-dev/skills`. **Sabse pehla install.** |
| `remotion-dev/claude-code-plugin` | **SKILL** | Global plugin: `claude plugin marketplace add remotion-dev/claude-code-plugin`. |
| Remotion templates (`template-prompt-to-video`, `template-helloworld`) | **READ** | CI + props patterns. |
| `amaymour/Remotion-video-pipeline` | **READ** | GitHub Actions render + `--props=data/script.json` + artifact pattern. Exact shape jo humein chahiye. |
| `shasitianshi-cloud/remotion` | **READ** | "Control plane (VPS) → render plane (Actions) → artifact + evidence.json" pattern. Determinism/integrity ke liye best reading. |
| `idinlabs-dev/render-remotion` | **READ** | Auto-render on push + Release artifacts. |

## B. Agent layer

| Repo / tool | Use | Kyun |
|---|---|---|
| `tashfeenahmed/freellmapi` | **PIN (self-host)** | `/v1/messages` Anthropic surface → Claude Code free. Tool-call rescue, per-key quotas, failover, sticky sessions, `setup-claude`/`launch`. |
| `anthropics/claude-code` (CLI) | **PIN** | `-p` headless, `--permission-mode dontAsk`, `--output-format json`, hooks, skills, subagents. |
| `musistudio/claude-code-router` | READ (alt) | Agar FreeLLMAPI ke saath issue ho, ye doosra proxy option. |
| `Pushpenderrathore/claude-code` (free-claude-code) | READ (alt) | Anthropic-compatible proxy, 10+ providers, per-tier model routing. **Compare karo**, duplicate mat chalao. |
| Ollama / LM Studio | **PIN (fallback)** | Custom OpenAI-compatible endpoint → FreeLLMAPI "custom provider" ke tor par. Jab saare cloud free tiers khatam hon. |

## C. Voice / audio

| Repo / tool | Use | Kyun |
|---|---|---|
| `hexgrad/kokoro` (Kokoro-82M) | **PIN** | Apache 2.0, CPU-friendly, 54 voices. Default TTS. |
| `remsky/Kokoro-FastAPI` | **PIN (docker)** | OpenAI-compatible `/v1/audio/speech` + `/dev/captioned_speech` (per-word timestamps, multi-speaker, SSML). **Yahi hamari TTS service.** |
| `resemble-ai/chatterbox` | READ / Phase 3 | MIT, voice cloning + emotion tags. Jab brand voice chahiye. |
| `rhasspy/piper` | PIN (fallback) | Halka, offline, low quality fallback. |
| `openai/whisper` → `ggml` / whisper.cpp via `@remotion/install-whisper-cpp` | **PIN** | Timestamp fallback + alignment verification. |
| `FFmpeg` (`loudnorm`, `sidechaincompress`, `blackdetect`, `freezedetect`) | **PIN** | Loudness + QA gates. |
| Freesound (CC0 filter) / `lotsofsounds/free-sound-effects-api` | **DATA** | CC0 SFX (12k+), REST + MCP, keyless samples. |
| `skyzhao1223/free-for-creators` | **DATA (read)** | "License-verified free assets" index ka pattern — apna version banao. |

## D. Assets / visuals

| Source | Use | Note |
|---|---|---|
| Pexels API | **DATA** | Video+photo, 200/hr. ⚠️ Nov 2026: new key issuance paused — verify. |
| Pixabay API | **DATA** | Images+videos, 100/60s, cache required, no hotlinking. |
| Openverse API | **DATA** | Openly licensed, keyless. Attribution tracking. |
| Wikimedia Commons API | **DATA** | Public domain / CC. |
| NASA Image & Video Library | **DATA** | Public domain. Space/science niche ke liye best. |
| Met Museum API | **DATA** | Public domain art. Visual essays ke liye. |
| Lucide / Tabler / Phosphor icons | **PIN** | MIT icons. |
| Google Fonts (`@remotion/google-fonts`) ya self-hosted OFL | **PIN** | Inter, Space Grotesk, Manrope, JetBrains Mono. |
| `gl-transitions/gl-transitions` | **PIN (read/shaders)** | MIT, 90+ GLSL transitions. |
| `patriciogonzalezvivo/lygia` | **PIN (shaders)** | MIT GLSL library — grain, distortion, displacement. |
| `shikijs/shiki` | **PIN** | Code syntax highlighting (code scenes ke liye killer). |
| `d3` / `recharts` / `visx` | **PIN** | Data-viz scenes. |
| `pmndrs/three` / `@react-three/fiber` (via `@remotion/three`) | **PIN** | Abstract 3D scenes. |
| `microsoft/playwright` | **PIN** | Deterministic screen captures (apne hi b-roll). |
| `motion-canvas` / `revideo` | READ (alt) | Remotion license issue ho toh alternative engine. |

## E. Reference pipelines (padho, fork na karo)

| Repo | Kya seekhna hai |
|---|---|
| `harry0703/MoneyPrinterTurbo` | Pipeline shape (topic→script→footage→TTS→subs→render), config surface, failure modes. **License MIT magar bundled music commercially unsafe.** |
| `vincentsch/explainroo` | Aapke exact combo ka minimal version: local Kokoro + Whisper timing + canvas renderer + agent-driven. **Best single reference.** |
| `ShortGPT` (dormant) | Historical architecture; mat use karo (Bing Images licensing hazard). |
| `MoneyPrinterV2` | AI-image (Nano Banana) route; billing risk. |

## F. Publishing / metrics

| Tool | Use |
|---|---|
| YouTube Data API v3 | Upload, schedule, `madeForKids`/synthetic-media disclosure fields. |
| TikTok Content Posting API | Approval process, rate limits. |
| Instagram Graph API | Reels. |
| YouTube Analytics API | Retention/CTR → `priors.json`. |

---

## Repo acceptance gate (checklist)

Naya repo add karne se pehle:

1. **License** file majood? SPDX samajh aata hai? Aapke use ke mutabiq? (AGPL/GPL = product mein nahi)
2. **Last commit** < 12 months? Issues ka response?
3. **Executable code** hai ya data? (code → vetted dependency; data → catalogue)
4. `npm audit` / `pip-audit` clean? Postinstall scripts? (`ignore-scripts` default rakho)
5. Render-time par network calls? (ye determinism torta hai — reject)
6. Maintainer ka identity? Repo typosquat nahi?
7. **Kya hum isse sirf *seekh* rahe hain ya *ship* kar rahe hain?** Dono ke rules alag hain.

**Rule of thumb:** production `package.json` mein 25 se zyada direct deps nahi. Baaki sab READ/DATA.

---

## "Thousands of repos" ko practically kaise scan karein

`scout` agent ka haftawar run (human-approved PR):

```
1. GitHub search queries (topic + stars + pushed:>2025-11-01):
   topic:remotion, topic:programmatic-video, topic:text-to-speech,
   topic:video-generation, topic:ffmpeg, topic:captions, topic:shaders,
   "remotion template", "ai video pipeline", "faceless video"
2. Filter: license != none, license ∉ {GPL-3.0, AGPL-3.0} (agar ship karna hai),
   last_commit < 12mo, size < 50MB, has package.json | pyproject.toml
3. Classify: ENGINE / SCENE / AUDIO / ASSET / REFERENCE / DEAD
4. Score: stars/week, issue response, tests present, docs quality
5. Output: docs/catalogue/<date>.md + PR (max 10 naye entries)
6. Insaan 10 min mein review kare.
```

**Yehi "thousands of repos" ka honest, scalable version hai** — ek badhta hua, licensed, reviewed catalogue. Runtime par random repos clone karna nahi.

---

## Kya avoid karna hai (specific)

- `ShortGPT` — dormant + Bing Images licensing.
- Edge TTS commercial use (ToS risk).
- MoneyPrinterTurbo ka `resource/songs` folder — repo khud kehta hai copyright issue ho sakta hai.
- Koi bhi repo jismein `postinstall` script network se binary download kare — pinned Docker image ke andar chalao.
- "AI video generator" repos jo actually paid API wrappers hain (Veo/Kling keys) — aapki "bina video model" requirement ke khilaf, aur $ burn.
- GPL/AGPL scene libraries — agar aap commercial channel/product bana rahe hain.
