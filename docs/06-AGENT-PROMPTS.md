# 06 — AGENT PROMPTS & SKILLS (copy-paste ready)

> Ye drafts hain — Phase 1 mein `.claude/` ke andar inhi ko final shape dena hai. Har block independent hai.
> **Idea:** free models chhote, structured, single-purpose prompts par best chalte hain. Bade "sab kuch karo" prompt mat likho.

---

## 6.1 `.claude/settings.json` (permissions — aapka "always yes")

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Read(/**)",
      "Edit(/src/**)", "Edit(/scripts/**)", "Edit(/schemas/**)", "Edit(/projects/**)", "Edit(/docs/**)",
      "Write(/src/**)", "Write(/scripts/**)", "Write(/schemas/**)", "Write(/projects/**)", "Write(/out/**)",
      "Bash(npm ci)", "Bash(npm i *)", "Bash(npm run *)", "Bash(npx tsc *)", "Bash(npx vitest *)",
      "Bash(npx remotion *)", "Bash(npx skills *)",
      "Bash(node scripts/*)", "Bash(python3 scripts/*)",
      "Bash(ffmpeg *)", "Bash(ffprobe *)",
      "Bash(git status)", "Bash(git diff *)", "Bash(git log *)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(mkdir -p *)", "Bash(ls *)", "Bash(cat *)", "Bash(jq *)",
      "Agent(Explore)", "Skill(*)"
    ],
    "ask": ["Bash(git push *)"],
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(/**/.env)", "Read(/**/.env.*)",
      "Read(./secrets/**)", "Read(/**/*.pem)", "Read(/**/*.key)", "Read(~/.ssh/**)",
      "Bash(rm -rf *)", "Bash(sudo *)", "Bash(chmod 777 *)",
      "Bash(curl * | sh)", "Bash(curl * | bash)", "Bash(wget * | sh)",
      "Bash(git push --force *)", "Bash(git reset --hard *)", "Bash(git clean -fdx *)",
      "Bash(docker system prune *)", "Bash(npm publish *)",
      "WebFetch"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/guard.js" }]
      }
    ]
  }
}
```

**Note:** `WebFetch` deny hai kyunke asset fetching hum apne `scripts/assets/*` providers se karte hain (license metadata ke saath). Agent ko raw web scraping ki zaroorat nahi — aur ye determinism bachata hai. Agar research ke liye chahiye, ek alag `scout` profile banao jismein `WebFetch`/`WebSearch` allow ho.

---

## 6.2 `.claude/hooks/guard.js` (hard guardrail — bypass mein bhi chalta hai)

```js
#!/usr/bin/env node
// PreToolUse hook. stdin: {tool_name, tool_input}. exit 0 = allow, exit 2 = block (reason on stderr).
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  let evt = {};
  try { evt = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { process.exit(0); }

  const cmd = evt?.tool_input?.command ?? '';
  const cwd = process.cwd();
  const block = (why) => { process.stderr.write(`BLOCKED: ${why}\n`); process.exit(2); };

  // 1. Repo root ke bahar write/delete nahi
  if (/\b(rm|mv|del)\b.*(\s|^)(\/|~\/)/.test(cmd) && !cmd.includes(cwd)) block('destructive path outside repo');

  // 2. Protected branch par push nahi
  if (/git\s+push/.test(cmd) && /\s(main|master|release\/\S+)\b/.test(cmd)) block('push to protected branch');

  // 3. Secrets exfiltration patterns
  if (/\.env|\.pem|id_rsa|\.ssh/.test(cmd) && /(cat|less|more|head|tail|curl|base64|scp|rsync)/.test(cmd)) {
    block('possible secret read/exfiltration');
  }

  // 4. Unpinned remote code execution
  if (/(curl|wget)[^|]*\|\s*(ba)?sh/.test(cmd)) block('pipe-to-shell');
  if (/npm\s+i(nstall)?\s+(?!-D|--save-dev)[^@\s]*$/.test(cmd)) block('unpinned dependency (use exact version)');

  // 5. Render/asset safety: assets ko delete nahi
  if (/\brm\b/.test(cmd) && /\b(assets|out)\//.test(cmd)) block('do not delete recorded assets/outputs');

  process.exit(0);
});
```

---

## 6.3 Skill: `.claude/skills/viral-structure/SKILL.md`

```markdown
---
name: viral-structure
description: Short aur long form video ke liye hook formulas, beat structure, word budgets, aur retention rules. Jab bhi script, hook, ya beats likhne hon tab use karo.
---

# Viral structure (rules, not opinions)

## Short (15–60s) — beat skeleton
| Beat | Frames @30fps | Job |
|---|---|---|
| hook | 0–45 (0–1.5s) | Visual + verbal disruption. Koi greeting nahi, koi channel intro nahi. |
| tension | 45–225 | Problem ko specific banao. 1 idea per sentence. |
| payoff | 225–900 | 2–3 concrete takeaways. Har 60–90 frames par visual change. |
| loop/cta | last 90–120 | Last line ko hook se jodo (match cut). CTA sirf 1, aur soft. |

## Hard rules
1. **Word budget:** 2.5 words/second (≈75 words = 30s). Isse zyada = captions drift + pacing dead.
2. **Visual change every 60–90 frames** (2–3s). Ek beat mein do se zyada visual idea nahi.
3. **Hook pehle 45 frames mein poora ho.** On-screen text hook ke saath sync.
4. **Reading level:** 6th grade. Chhote jumle. Koi jargon bina explain.
5. **Numbers specific** ("37 failed" > "most failed"). Lekin **jhooth mat bolo** — agar data nahi hai, qualitative claim karo.
6. **Loop:** aakhri 8–10 words pehle 8–10 words se rhyme/meaning match karein.
7. **Har video mein ek "thesis"** — jo ek line mein likhi ja sake. Agar nahi likh sakte, video abhi ready nahi.

## Hook formulas (choose 1, generate 3 variants)
| id | formula | template |
|---|---|---|
| contrarian | Contrarian Reality | "Stop [common habit] if you want [result]." |
| curiosity | Curiosity Gap | "The [thing] that [surprising result] — and it's not [obvious]." |
| empathy | Empathy Callout | "If your [metric] has been stuck at [number] for [time], watch this." |
| number | Specific Number | "I tested [N] [things]. [N-k] failed." |
| interrupt | Pattern Interrupt | "Your first [N] seconds are lying to you." |
| steal | Steal This | "Steal the exact [asset] I used to [result]." |

## Long (8–12 min) — structure
- Cold open 0–15s (scene se shuru, intro se nahi)
- Promise 15–45s (viewer ko batao kya milega)
- 6–10 chapters × 45–120s
- Re-hook har 60–90s ("but here's where it gets weird")
- Har chapter ka ek takeaway jo screen par likha jaye
- End: recap grid + ek open loop next video ke liye

## Anti-patterns (script reject karo agar)
- Hook "In this video I will..." se shuru ho
- Teen se zyada CTA
- Ek hi sentence mein do ideas
- Generic stock-footage-friendly banal lines ("in today's fast-paced world")
- Claim jo verify nahi ho sakta (sources ke baghair)
```

---

## 6.4 Skill: `.claude/skills/director-spec/SKILL.md`

```markdown
---
name: director-spec
description: director.json spec likhne/repair karne ke rules. Schema, allowed values, aur validation errors ko kaise fix karna hai.
---

# director.json likhne ke rules

1. Sirf `schemas/director.schema.json` ke fields use karo. Naya field invent **mat** karo.
2. `visual.type` in values mein se ek hona chahiye:
   `kinetic-type | stock | code | chart | screen-cap | diagram | 3d | abstract | terminal | split-screen`
3. Durations **seconds** mein `maxSec` ke tor par do — frames engine calculate karega. Frame numbers khud mat likho.
4. `vo` hi sach hai: jo likha hai wahi bola jayega. `onScreen` chhota rakho (≤5 words), `vo` ka repeat nahi.
5. Har beat ka **ek** visual type. Do visual ideas = do beats.
6. `hooks` mein kam se kam 3 variants, different formulas se.
7. `originality.uniqueInput` khali nahi ho sakta — koi apna data, apna test, apna experience.
8. `budget.maxLLMCalls` ko chhoot kar aage mat barho.

## Validation error ko kaise fix karo
- `ENUM_INVALID` → allowed values ki list se koi ek chuno, spelling check karo.
- `MISSING_FIELD` → field add karo; agar value nahi pata toh schema ka default use karo.
- `DURATION_OVER_BUDGET` → `maxSec` kam karo ya beat ko todo.
- `WORD_BUDGET_EXCEEDED` → `vo` chhota karo (words ko kaatna hai, speed badhana nahi).
- `NO_UNIQUE_INPUT` → `originality` block bharo.

## Output format
Sirf ek valid JSON object return karo. Koi markdown fence nahi, koi commentary nahi, koi trailing comma nahi.
```

---

## 6.5 Director prompt (Phase 1 ka main prompt)

```
You are a video director. Output ONE valid director.json object. No prose, no markdown fences.

BRIEF:
{{brief}}

CONSTRAINTS:
- format: {{format}}   (short = 25-50s, long = 8-12min)
- platform: {{platforms}}
- language: en
- visual library available: kinetic-type, code, chart, terminal, diagram, 3d, abstract, split-screen
  (stock only if explicitly requested; default = NO stock)
- voice: af_heart, speed 1.05
- Max beats: {{maxBeats}}
- Max total words: {{maxWords}}

PROCESS (think silently, do not output):
1. State the thesis in one sentence.
2. Choose 3 hook variants from different formulas.
3. Break the thesis into beats: hook -> tension -> 3-5 payoff beats -> loop.
4. Assign exactly one visual.type per beat, chosen from the available library.
5. Assign on-screen text (<=5 words) per beat.
6. Fill originality.uniqueInput with the specific data/experience that makes this non-generic.
7. Check word budget: total words <= {{maxWords}}. Trim, don't speed up.
8. Emit JSON only.

RULES:
- No greeting beats. Beat 1 must be the hook.
- No two consecutive beats with the same visual.type.
- Last beat's vo must echo the first beat's vo (loop).
- Every claim in vo must be supportable from BRIEF; otherwise soften it.
- Set variationSeed to a random integer 1-99999.

SCHEMA: {{schema}}
```

---

## 6.6 Critic prompt (QA loop)

```
You are a retention-focused video editor. You get:
- transcript with timing
- qa.json (numeric gates)
- 6 stills (frames 0, 10%, 30%, 50%, 70%, 95%)

Output ONLY this JSON:
{
  "verdict": "ship" | "patch",
  "issues": [
    {"beatId": "b2", "severity": "high|med|low", "problem": "...", "patch": {"field": "maxSec", "from": 8, "to": 5}}
  ],
  "hookRewrite": null | "new hook text",
  "notes": "<=2 sentences"
}

Rules:
- Max 4 issues. Sirf wo jo measurable ho (timing, pacing, contrast, caption length, claim).
- "Looks nice" jaisa vague feedback mat do.
- Agar qa.json ke saare gates green hain aur hook pehle 45 frames mein poora hai -> "ship".
- patch hamesha director.json ke valid field par ho.
```

---

## 6.7 Fixer prompt (schema/TS error repair — tight loop)

```
You are a TypeScript fixer. Input: an error message and the file(s) it refers to.
Output: ONLY a unified diff (git apply format).

Rules:
- Minimal change. Koi refactor nahi, koi naye dependency nahi.
- Agar error schema validation ka hai, spec ko fix karo, schema ko nahi.
- Agar error TypeScript ka hai, type add karo — `any` use mat karo.
- Agar error render ka hai (OOM, timeout), `--concurrency` kam karo, code mat badlo.
- Ek attempt mein ek hi problem fix karo.
```

---

## 6.8 Subagent definitions (`.claude/agents/*.md`)

```markdown
<!-- .claude/agents/scout.md -->
---
name: scout
description: Trend aur asset research. GitHub repo shortlist banata hai, license check karta hai.
tools: WebSearch, WebFetch, Read, Write
model: haiku
---
Tum sirf research karte ho. Output: docs/catalogue/<date>.md with a table
(repo, license, last commit, role, use-mode: PIN/READ/DATA/SKILL, risk).
Koi repo clone nahi, koi install nahi. Max 10 naye entries per run.
```

```markdown
<!-- .claude/agents/fixer.md -->
---
name: fixer
description: Build/type/render errors ko minimal diff se fix karta hai.
tools: Read, Edit, Bash(npm run *), Bash(npx tsc *), Bash(npx remotion *)
---
Ek waqt mein ek error. Diff do. Tests chalao. Agar 2 attempts mein fix na ho,
error ko report karo aur ruk jao — guess mat karo.
```

```markdown
<!-- .claude/agents/critic.md -->
---
name: critic
description: Rendered stills + transcript par retention review.
tools: Read, Bash(ffmpeg *), Bash(ffprobe *)
---
Numeric + specific feedback only. docs/06 ka critic prompt follow karo.
```

---

## 6.9 Daily driver commands

```bash
# Ek video (interactive, agent sab kare)
claude

# Ek video (headless, CI-style)
claude -p "Read briefs/today.json. Write projects/<id>/director.json per .claude/skills/director-spec. Then run: node scripts/cli.ts build --id <id>" \
  --permission-mode dontAsk --permission-prompts none --output-format json > logs/agent/run.json

# Sirf spec likhwao (engine baad mein)
claude -p "briefs/today.json se director.json banao" --permission-mode plan

# Batch: 5 variations
node scripts/cli.ts make --brief briefs/today.json --count 5 --draft
```

> **Quota tip:** heavy agent runs subah karo (free tier quotas din ke saath khatam hote hain). Renders (LLM-free) raat ko chalao.
