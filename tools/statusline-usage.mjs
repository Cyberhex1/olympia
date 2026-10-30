#!/usr/bin/env node
// Optional Claude Code status line that also feeds Olympia's usage meter.
// Claude Code runs a status-line command with a JSON description of the session on stdin, including
// your plan's rate limits. This prints a short status line and saves only the limits (percent used and
// reset times, no conversation data) to olympia.usage.json next to Olympia, where the island reads them.
//
// To use it, add this to ~/.claude/settings.json (Olympia never edits that file for you):
//   "statusLine": { "type": "command", "command": "node C:\\code\\Olympia\\tools\\statusline-usage.mjs" }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = process.env.OLYMPIA_USAGE_FILE || path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'olympia.usage.json');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; if (input.length > 1e6) process.exit(0); });
process.stdin.on('end', () => {
  let o = {};
  try { o = JSON.parse(input || '{}'); } catch {}
  const rl = o.rate_limits;
  if (rl && typeof rl === 'object') {
    try { fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), plan: o.subscription_type || null, rate_limits: rl })); } catch {}
  }
  // the line Claude Code shows: model · folder · 5-hour use when known
  const five = Array.isArray(rl?.limits) ? rl.limits.find((r) => r.kind === 'session')?.percent : rl?.five_hour?.utilization;
  const parts = [o.model?.display_name, o.workspace?.current_dir && path.basename(o.workspace.current_dir), typeof five === 'number' && `5h ${Math.round(five)}%`].filter(Boolean);
  process.stdout.write(parts.join(' · '));
});
