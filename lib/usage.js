// The usage meter: tokens this PC's Claude sessions used (always available, from the ledger) and, when
// Claude Code shares them, your plan's limits (percent used of the 5-hour and weekly windows).
// Plan limits are not stored anywhere on disk by Claude Code. tools/statusline-usage.mjs, if you choose to
// run it as your status line, writes what Claude Code gives it to olympia.usage.json, which is read here.
import fs from 'node:fs';

const H = 3600_000;
const STALE = 30 * 60_000; // older plan numbers aren't shown as current

// rows: [{ label, percent, resetsAt }] from either shape Claude Code has used for status lines
export function planRows(rl) {
  if (!rl || typeof rl !== 'object') return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
  if (Array.isArray(rl.limits)) {
    return rl.limits.map((r) => ({
      label: r.scope?.model?.display_name ? `Weekly · ${r.scope.model.display_name}` : r.kind === 'session' ? '5-hour limit' : /weekly/.test(r.kind || r.group || '') ? 'Weekly · all models' : String(r.kind || r.group || 'Limit'),
      percent: num(r.percent), resetsAt: typeof r.resets_at === 'string' ? r.resets_at : null, active: Boolean(r.is_active), severity: typeof r.severity === 'string' ? r.severity : null,
    })).filter((r) => r.percent !== null);
  }
  const rows = [];
  const add = (label, w) => { if (!w || typeof w !== 'object') return; const p = num(w.utilization ?? w.percent ?? w.used_percentage); if (p !== null) rows.push({ label, percent: p, resetsAt: typeof w.resets_at === 'string' ? w.resets_at : null }); };
  add('5-hour limit', rl.five_hour); add('Weekly · all models', rl.seven_day); add('Weekly · Opus', rl.seven_day_opus); add('Weekly · Sonnet', rl.seven_day_sonnet);
  for (const m of Array.isArray(rl.model_scoped) ? rl.model_scoped : []) add(`Weekly · ${m.display_name}`, m);
  return rows.length ? rows : null;
}

export function readPlan(file, now = Date.now()) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    const at = Number(o.at) || 0;
    if (!at || now - at > STALE) return null;
    const rows = planRows(o.rate_limits);
    return rows ? { at, rows, plan: typeof o.plan === 'string' ? o.plan : null } : null;
  } catch { return null; }
}

export function usageSummary(ledger, { now = Date.now(), planFile } = {}) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  return {
    h5: ledger.usage(now - 5 * H, now + 1),
    today: ledger.usage(midnight.getTime(), now + 1),
    d7: ledger.usage(now - 7 * 24 * H, now + 1),
    plan: planFile ? readPlan(planFile, now) : null,
    at: now,
  };
}
