/**
 * Shared audit-log arg filter. Pure function, no electron deps, so both
 * electron/main.js (production) and electron/scripts/smoke-gcal.js (tests)
 * import the SAME impl — no drift.
 */
'use strict';

const ALLOWLIST = new Set([
  'summary','start','end','durationMin','location','guests','description',
  'eventId','dateFrom','dateTo','limit','patch',
  // Internal metadata flags — safe to log, useful for forensics
  'retriedAfter412','storedPlain',
]);

function auditSafeArgs(args) {
  if (!args || typeof args !== 'object') return args;
  if (Array.isArray(args)) return args.map(auditSafeArgs);
  const out = {};
  for (const k of Object.keys(args)) {
    if (!ALLOWLIST.has(k)) continue;
    const v = args[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = auditSafeArgs(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { auditSafeArgs, ALLOWLIST };
