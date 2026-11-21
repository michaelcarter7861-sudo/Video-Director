---
name: director-spec
description: Write or repair projects/<id>/director.json for this repo's video engine. Use whenever a video brief must become a spec, or when `npm run build` reports spec issues.
---

# Writing director.json

The engine renders **only** what the spec says. Every field has a consumer; inventing fields is a hard error.

## Output rules
- Emit ONE JSON object. No prose, no markdown fences, no trailing commas.
- Validate before you build: `npx tsx src/cli.ts spec --brief projects/<id>/director.json --out projects/<id>/director.json`
- If validation prints `[CODE] path: message → fix`, apply exactly that fix and re-validate.

## Visual library (pick one per beat, never the same twice in a row)
| type | use for | required payload |
|---|---|---|
| `kinetic-type` | hooks, payoff lines, punchlines | `onScreen` (<=5 words), `emphasis[]` |
| `code` | showing a snippet/template | `code`, `lang`, `highlight[]` (1-based lines) |
| `terminal` | commands, CLI output, "it runs" | `lines[]` (prefix commands with `$`, results with `✓`) |
| `stat` | one number that carries the argument | `value`, `prefix`/`suffix`, `decimals` |
| `chart` | comparison, before/after | `chartType`, `data[{label,value}]` |
| `diagram` | a 2-4 step system | `nodes[]`, `edges[[from,to]]` |
| `split` | wrong vs right | `left`, `right` |
| `abstract` | loop/CTA, transitions | `seed` |

## Hard rules
1. `beats[0].role` MUST be `hook`. No greeting, no "in this video".
2. Last beat role MUST be `loop`, and its `vo` must echo the hook.
3. `maxSec` is a **cap**, not a duration. Audio wins; the engine extends the beat and reports it.
   Keep `maxSec` close to the real spoken length (~2.5 words/sec) or QA will warn.
4. `onScreen` <= 5 words, and must NOT repeat the `vo` verbatim — it is a headline, not a transcript.
5. `visual.seed` / `style.variationSeed`: integers 1..99999.
6. `originality.uniqueInput` must name the concrete data, test, or experience behind the video.
7. Total beats 6-9 for a 25-45s short. Each beat = one idea.
8. Do not touch `schemas/` or `src/` to make a spec pass. Fix the spec.

## Beat skeleton for a short
```
hook       2-3s   chain-breaking claim          kinetic-type (slam)
tension    3-4s   the wrong default             split
payoff x3  4-6s   number, comparison, method    stat / chart / diagram / code
loop       4-6s   restate hook as a resolution  abstract
```
