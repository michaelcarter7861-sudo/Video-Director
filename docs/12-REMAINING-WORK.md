# What is left — honest breakdown

Written 2026-11-20, after Phase 4b. This is the answer to "kitna kaam rehta hai".

## Done

| Phase | Scope | State |
| --- | --- | --- |
| 0 | spikes: canvas render, fonts, ffmpeg pipe, TTS ladder, QA probes | done |
| 1 | spec contract → timing → render → QA → publish pack | done |
| 2 | variation engine, batch builds | done |
| 3 | long-form 16:9, shorts-from-long (re-directed, not cropped) | done |
| 4 | critic, distinctness, thumbnails, review page, hook A/B, priors ingest, dashboard | done |
| — | OpenFilm export + skill (human editing handoff) | done |
| — | CI: test job, render job, publish-batch job, Kokoro compose | done |

37 tests, `tsc --noEmit` clean, every demo/long/showcase/shorts/A-B render QA PASS.

## Remaining, in the order that actually unblocks value

### 1. Real voice — ~1 hour, no code
`docker compose -f docker-compose.tts.yml up -d` then `build --voice kokoro`. Every validation
run so far used the deterministic dummy tone, which is a test signal, not a narrator. Until this
runs, "does the pacing survive real speech?" is unanswered. **Highest value per minute spent.**

### 2. Real metrics round-trip — ~half a day
`ingest` accepts a hand-exported CSV. The YouTube Analytics API (OAuth + `yt-analytics.readonly`)
removes the copy-paste. Blocked on credentials, not on code: the parser, shrinkage and ranking all
exist and are tested.

### 3. Publishing — 1–2 days, mostly waiting on platform approval
Not written on purpose (plan says Phase 5, human approval first):
- YouTube Data API v3 upload + scheduled publish + synthetic-media disclosure flag
- TikTok Content Posting API (needs app audit), IG Reels Graph API
- A `publish --approved out/dashboard.html` gate so a build cannot upload itself

### 4. Topic scout — ~1 day
Trend sources → `brief.json` queue. No code yet; the spec contract already accepts a brief.

### 5. OpenFilm pixel parity — a few hours, needs Chromium
`openfilm --spec` output validates but has never been rendered to video in this sandbox (no
Chromium download). Run `npx -y openfilm@latest look` and `render` on a machine with network to
confirm page output matches the MP4, and promote the simplified scenes.

### 6. Scale — ongoing
- Long-form timing: 30s ≈ 2 min CPU on 2 cores; a 10-min video wants CI or a bigger box.
- Self-hosted runner / Cloud Run if GitHub's 60-minute job timeout is hit.
- Multi-channel: `brands/<channel>/tokens.ts` per channel with its own prior set.

## Deliberately NOT done

- **No AI video model.** Visuals stay code-drawn. That was the brief.
- **No auto-publish without approval.** Monetization policy risk is not worth the minutes saved.
- **No music library shipped.** Bundled "free" beds in similar repos are often YouTube-ripped;
  our bed is synthesised from scratch, SFX must be added from a CC0 source with a licence entry.

## Rough estimate

| Path | Remaining effort |
| --- | --- |
| "A real channel could run on this" | 3–5 days (real voice, metrics API, YouTube upload, topic scout) |
| "Someone else can install and use it" | +2–3 days (setup guide tested on a clean machine, error messages, first-run wizard) |
| "Fully hands-off pipeline" | +1–2 weeks (approval dashboard actions, scheduling, multi-channel, retries) |

The engine is finished as an engine. What is left is plumbing to platforms and other people's machines.
