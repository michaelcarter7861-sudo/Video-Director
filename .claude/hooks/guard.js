#!/usr/bin/env node
/**
 * PreToolUse guard. Runs before every Bash call — including in bypassPermissions mode.
 * exit 0 = allow, exit 2 = block (reason goes to stderr, which Claude sees).
 *
 * Deny rules in .claude/settings.json are the first line; this is the second.
 */
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  let evt = {};
  try {
    evt = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    process.exit(0);
  }

  const cmd = String(evt?.tool_input?.command ?? '');
  const block = (why) => {
    process.stderr.write(`BLOCKED by .claude/hooks/guard.js: ${why}\n`);
    process.exit(2);
  };

  // never read or ship secrets
  if (/(cat|less|more|head|tail|base64|scp|rsync)\b[^\n]*(\.env\b|\/secrets\/|\.pem\b|id_rsa)/.test(cmd)) {
    block('possible secret read or exfiltration');
  }
  // no unpinned remote code execution
  if (/(curl|wget)[^|]*\|\s*(ba|z)?sh/.test(cmd)) block('pipe-to-shell is not allowed');
  // no publishing to npm
  if (/npm\s+publish/.test(cmd)) block('this repo is never published to npm');
  // no force-push / history rewrite
  if (/git\s+push[^\n]*--force|git\s+reset\s+--hard|git\s+clean\s+-fdx/.test(cmd)) {
    block('history-rewriting git commands are not allowed');
  }
  // no pushes to protected branches (feature branches only)
  if (/git\s+push[^\n]*\s(main|master|release\/\S+)\b/.test(cmd)) {
    block('push to a protected branch');
  }
  // protect renders and recorded audio
  if (/\brm\b[^\n]*\b(out|projects)\//.test(cmd)) block('do not delete renders or project audio');

  process.exit(0);
});
