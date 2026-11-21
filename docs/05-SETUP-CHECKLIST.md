# 05 — SETUP CHECKLIST (commands, in order)

> Ye wo exact sequence hai jo Phase 0/1 se pehle chalani hai. Har step ke saath ek **verification** hai — agar verify fail ho, aage na barhein.
> Jo cheezein version-dependent hain unhein `⚠️ verify` mark kiya gaya hai.

---

## Step 0 — Prerequisites

| Cheez | Version | Check |
|---|---|---|
| Node.js | 20+ (Remotion ke liye 20 ya 22 LTS behtar) | `node -v` |
| npm | 10+ | `npm -v` |
| Git | latest | `git --version` |
| Docker | latest (FreeLLMAPI + Kokoro ke liye) | `docker --version` |
| FFmpeg | latest (system, QA ke liye) | `ffmpeg -version` |
| Python | 3.11+ (sirf scripts/spikes) | `python3 --version` |
| RAM | 8GB+ (16GB comfortable) | — |
| Disk | 20GB+ (stock cache + renders) | — |

**Verify:** saare commands output dein, koi "command not found" nahi.

---

## Step 1 — FreeLLMAPI (free LLM gateway)

```bash
# Option A — Docker one-liner (recommended)
curl -fsSL https://freellmapi.co/install.sh | bash
# → ~/freellmapi banata hai, ENCRYPTION_KEY generate karta hai, container start

# Option B — manual docker compose
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi
ENCRYPTION_KEY="$(openssl rand -hex 32)"
printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "$ENCRYPTION_KEY" > .env
docker compose up -d
```

**Verify:**
- `http://localhost:3001` khulta hai (dashboard).
- **Keys** page par kam se kam 2 providers ki keys add ho jaayein.
- Unified key (`freellmapi-…`) copy ho jaye.

**Provider keys — priority order (motion-graphics/tech niche ke liye):**

| Priority | Provider | Kyun | Milne ka tareeqa |
|---|---|---|---|
| 1 | **Groq** | sabse tez, tool-calling theek | console.groq.com |
| 2 | **Google AI Studio** | quality + long context | aistudio.google.com |
| 3 | **Cerebras** | speed (fixer loop ke liye best) | cloud.cerebras.ai |
| 4 | **OpenRouter** (free models) | breadth / fallback | openrouter.ai |
| 5 | **Mistral** | backup | console.mistral.ai |
| 6 | **NVIDIA NIM** | extra capacity (⚠️ trial ToS = evaluation only) | build.nvidia.com |
| ❌ | **Cohere** | **chain se hatao** — ToS personal use forbid karta hai | — |

**Fallback chain set karo (dashboard → Fallback Chain):**
```
coding chain : cerebras(fast) → groq → google → openrouter → ollama(local)
writing chain: google → groq → openrouter → mistral
```
> FreeLLMAPI ke "named profiles" (`auto:<profile>`) se do alag chains banao — ek *fixer* (tool-call reliable, fast) aur ek *writer* (creative).

**Verify:** dashboard → Playground → `auto:coding` par ek test prompt chalao, response aaye.

---

## Step 2 — Claude Code ko FreeLLMAPI par point karo

```bash
# Claude Code install (agar nahi hai)
npm i -g @anthropic-ai/claude-code
claude --version

# Recommended: credential-free launch (key disk par nahi jaati)
export FREELLMAPI_API_KEY="freellmapi-xxxxxxxx"
npx freellmapi launch

# Manual equivalent (agar launch kaam na kare)
export ANTHROPIC_BASE_URL="http://localhost:3001"   # BARE origin — /v1 NAHI
export ANTHROPIC_AUTH_TOKEN="$FREELLMAPI_API_KEY"
export ANTHROPIC_API_KEY=""                          # khali rakho
claude
```

**Verify (ye 4 cheezein):**
1. `claude` start hota hai aur ek prompt ka jawab deta hai.
2. Ek file read kar sakta hai ("read README.md").
3. Ek file edit kar sakta hai (permission prompt aaye — abhi default mode).
4. Dashboard → analytics par request dikhe (yani traffic gateway se ja raha hai).

**Agar fail ho:**
- 404 `/v1/v1/messages` → base URL se `/v1` hata do.
- Auth error → `ANTHROPIC_API_KEY` khali hai? unified key `ANTHROPIC_AUTH_TOKEN` mein hai?
- Tool calls plain text mein aa rahe hain → dashboard mein tool-call rescue on hai? model badlo (qwen/deepseek/glm flavours).

---

## Step 3 — Repo bootstrap (Remotion)

```bash
cd ~/Video-Director
# Remotion project (ya manual scaffold — Phase 1 doc dekho)
npx create-video@latest --blank .     # ⚠️ verify: existing folder mein flag behaviour

npm i
npm i zod
npm i -D typescript vitest eslint prettier

# Official agent skills — SABSE IMPORTANT STEP
npx remotion skills add
# ya: npx skills add remotion-dev/skills
```

**Verify:**
- `claude` ke andar `/remotion` type karo → 13 skills list hon.
- `npx remotion studio` chalta hai aur browser preview khulta hai.

**Optional (global plugin, har project mein skills):**
```bash
claude plugin marketplace add remotion-dev/claude-code-plugin
claude plugin install remotion@remotion
```

---

## Step 4 — Permissions (aapka "always yes", safely)

```bash
mkdir -p .claude
# .claude/settings.json → docs/06-AGENT-PROMPTS.md se copy karo
# .claude/hooks/guard.(ts|js) → docs/06 se copy (PreToolUse deny rules)
```

**Verify:**
- `claude --permission-mode dontAsk -p "read package.json and tell me the version"` → bina prompt jawab de.
- `claude --permission-mode dontAsk -p "try to read .env"` → **deny** ho.
- `claude --permission-mode dontAsk -p "run rm -rf node_modules"` → **block** ho (deny list).
- `--output-format json` ke saath `permission_denials` array mile.

> Ye teen tests aapki safety ka proof hain. Inke baghair bypass mode mat sochna bhi.

---

## Step 5 — TTS service (Kokoro, local, free)

```bash
# CPU (default — aapke laptop par theek chalega)
docker run -d --name kokoro-tts -p 8880:8880 \
  ghcr.io/remsky/kokoro-fastapi-cpu:latest
# ⚠️ verify: image tag name ghcr par confirm karo (cpu / gpu variants)
```

**Verify:**
```bash
curl -s http://localhost:8880/v1/audio/voices | head -c 300      # voices list
curl -X POST http://localhost:8880/dev/captioned_speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Your first two seconds are lying to you.","voice":"af_heart","response_format":"wav","stream":false}' \
  -o /tmp/t.json
python3 -c "import json,base64;d=json.load(open('/tmp/t.json'));print(len(d['timestamps']));print(d['timestamps'][:3])"
```
**Pass criteria:** timestamps array aaye, aur har entry mein word ka `start`/`end` ho. **Yahi hamari timing truth hai.**

Agar Kokoro image na chale → fallback: `pip install kokoro soundfile` + `apt install espeak-ng`, ya FreeLLMAPI `/v1/audio/speech` (magar timestamps nahi milenge → Whisper step lazmi).

---

## Step 6 — Caption alignment fallback (Whisper)

```bash
npx remotion add @remotion/install-whisper-cpp
# pehli baar model download hoga (~1.5GB medium.en) — gitignored rakho
npx remotion ffmpeg -i out/test.wav -ar 16000 out/test16k.wav -y
```
**Verify:** `transcribe()` + `toCaptions()` chala kar `Caption[]` mile (word-level `startMs/endMs/confidence`).

---

## Step 7 — GitHub Actions render (final renders)

```bash
mkdir -p .github/workflows
# render.yml → docs/08-PHASE1-SCAFFOLD.md se copy
gh workflow run render.yml -f composition=Short -f props=projects/demo/props.json
gh run watch
gh run download   # artifact: video.mp4
```
**Verify:** artifact download ho, `ffprobe` se duration/resolution match kare. **Public repo = free minutes; private repo = minute limits.**

---

## Step 8 — Asset providers (keys + license registry)

| Source | Action | Note |
|---|---|---|
| Pexels | key lo (⚠️ Nov 2026: issuance paused ho sakta hai — check karo) | na mile → Pixabay par jao |
| Pixabay | key lo | cache required, hotlinking nahi |
| Openverse | key optional | keyless bhi chalta hai (rate limited) |
| NASA / Wikimedia / Met | key ki zaroorat nahi | public domain — safest |

**Verify:** `assets/registry.json` banao aur ek test entry add karo `{id, source, license, attribution, url, sha256}`. **Rule: koi bhi asset bina license field ke build mein na jaaye.**

> Motion-graphics style chunne ki wajah se aapko stock footage ki zaroorat **kam** padegi — Phase 1 mein zero stock se shuru karo. Ye dependency risk ko khatam karta hai.

---

## Step 9 — QA tooling

```bash
ffmpeg -version | head -1
# loudnorm, blackdetect, freezedetect FFmpeg mein built-in hain — extra install nahi
```
**Verify (test video par):**
```bash
ffprobe -v error -show_entries format=duration,bit_rate -of json out/test.mp4
ffmpeg -i out/test.mp4 -af loudnorm=print_format=json -f null - 2>&1 | tail -20
ffmpeg -i out/test.mp4 -vf blackdetect=d=0.4:pix_th=0.10 -f null - 2>&1 | grep blackdetect
```

---

## Step 10 — Final smoke test (ek hi command)

```bash
node scripts/cli.ts make --brief "why your shorts die at 2 seconds" --format short --draft
```

**Pass criteria (Phase 1 gate):**
1. `out/<id>/video.mp4` bane, duration 25–50s, 1080×1920, 30fps.
2. Audio stream majood, loudness −14 LUFS ±1.5.
3. Captions frame-accurate (spot-check 3 words).
4. `qa.json` → saare gates green.
5. `manifest.json` → licenses complete.
6. Render time < 3 min (draft mode).
7. Agent ne spec khud likha, insaan ne sirf brief diya.

---

## Troubleshooting quick table

| Symptom | Sabse pehle kya check karo |
|---|---|
| Claude Code 404 | base URL se `/v1` hatao |
| Claude Code tool calls ignore | tool-call rescue on? model change karo |
| "Model not found" | dashboard catalog mein model id dekho (`/v1/models`) |
| Quota khatam mid-run | `--reuse-spec` se resume; local Ollama fallback add karo |
| Remotion render black | `--log=verbose`; assets 404? fonts load hue? |
| OOM | `--concurrency 1`, `--jpeg-quality 80`, draft mode |
| Fonts fallback ho rahe | `@remotion/google-fonts` ya self-hosted `@font-face` + `delayRender` |
| Captions drift | timestamps TTS se lo, LLM se nahi; Whisper se verify karo |
| Render 6h limit | long-form ko chunks mein todo / Lambda / self-hosted runner |
| "Video boring lag raha" | template family badlo, hook badlo, pacing 2–3s par visual change |
