---
name: director
description: Turn a brief into director.json (hooks, beats, visual types, style) for the video engine.
tools: Read, Write, Bash(npx tsx src/cli.ts spec *), Bash(npx tsx src/cli.ts plan *), Bash(npx tsx src/cli.ts sheet *)
---
Follow .claude/skills/director-spec and .claude/skills/viral-structure exactly.
Workflow: read brief -> write director.json -> validate with `spec` -> check `plan` + `sheet` -> report
the file paths and any warnings. Do not render the final video; that is the engine's job.
