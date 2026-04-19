/**
 * Google Calendar marker interception for bot-to-CEO Telegram output.
 *
 * Parses [[GCAL_<ACTION>: <json>]] from bot reply text using a
 * brace-balanced walker (not regex) — regex `\{[^\]]+\}` breaks on
 * Vietnamese titles containing `]`.
 *
 * Also exports neutralizeInbound() which rewrites customer-sent markers
 * to '[GCAL-blocked-<ACTION>...' so the bot can't be tricked into
 * quoting them back as active markers (§Input-side defense).
 */
'use strict';

const KNOWN_ACTIONS = new Set(['CREATE', 'LIST', 'UPDATE', 'DELETE', 'FREEBUSY']);

// Walk `text` starting at `startIdx` assuming we're one char after `{`.
// Return index of matching `}`, or -1 if unbalanced.
function matchBraces(text, startIdx) {
  let depth = 1;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Extract [[GCAL_<ACTION>: {...}]] spans. Returns array of
// { start, end, action, payload, malformed }.
function extractMarkers(text) {
  const out = [];
  const prefix = '[[GCAL_';
  let pos = 0;
  while (pos < text.length) {
    const idx = text.indexOf(prefix, pos);
    if (idx === -1) break;
    // Read action name: [A-Z_]+ up to ':'
    let j = idx + prefix.length;
    let action = '';
    while (j < text.length && /[A-Z_]/.test(text[j])) {
      action += text[j]; j++;
    }
    if (text[j] !== ':') {
      // Not a well-formed marker — flag malformed span from prefix to next ]] or 200 chars
      const endIdx = text.indexOf(']]', idx);
      const end = endIdx === -1 ? Math.min(idx + 200, text.length) : endIdx + 2;
      out.push({ start: idx, end, action: action || 'UNKNOWN', payload: null, malformed: true });
      pos = end;
      continue;
    }
    j++; // skip ':'
    while (j < text.length && text[j] === ' ') j++; // skip spaces
    if (text[j] !== '{') {
      // Malformed payload start
      const endIdx = text.indexOf(']]', idx);
      const end = endIdx === -1 ? Math.min(idx + 200, text.length) : endIdx + 2;
      out.push({ start: idx, end, action, payload: null, malformed: true });
      pos = end;
      continue;
    }
    const braceEnd = matchBraces(text, j + 1);
    if (braceEnd === -1) {
      // Unbalanced — scrub up to next ]] or 500 chars
      const endIdx = text.indexOf(']]', idx);
      const end = endIdx === -1 ? Math.min(idx + 500, text.length) : endIdx + 2;
      out.push({ start: idx, end, action, payload: null, malformed: true });
      pos = end;
      continue;
    }
    // Check that ']]' follows (with optional whitespace)
    let k = braceEnd + 1;
    while (k < text.length && text[k] === ' ') k++;
    if (text.substr(k, 2) !== ']]') {
      // Malformed close
      out.push({ start: idx, end: k + 2, action, payload: null, malformed: true });
      pos = k + 2;
      continue;
    }
    const jsonStr = text.substring(j, braceEnd + 1);
    let payload;
    try {
      payload = JSON.parse(jsonStr);
    } catch {
      out.push({ start: idx, end: k + 2, action, payload: null, malformed: true });
      pos = k + 2;
      continue;
    }
    const isKnown = KNOWN_ACTIONS.has(action);
    out.push({
      start: idx,
      end: k + 2,
      action,
      payload,
      malformed: !isKnown,
    });
    pos = k + 2;
  }
  return out;
}

// Replace markers in text. `handler` is an async function called per valid
// marker that returns the replacement string. Malformed markers are replaced
// with a scrub message. Returns the transformed text.
async function replaceMarkers(text, handler) {
  const spans = extractMarkers(text);
  if (spans.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    out += text.substring(cursor, span.start);
    if (span.malformed) {
      out += '[!] Bot thử gọi Google Calendar nhưng cú pháp lỗi — sếp thử lại.';
    } else {
      try {
        out += await handler(span);
      } catch (e) {
        out += `[!] Lỗi gọi Google Calendar: ${e.message}`;
      }
    }
    cursor = span.end;
  }
  out += text.substring(cursor);
  return out;
}

// Neutralize markers in INBOUND text — rewrite `[[GCAL_` to `[GCAL-blocked-`.
// Applies to customer Zalo / Telegram inbound + RAG-ingested content.
function neutralizeInbound(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\[\[GCAL_/g, '[GCAL-blocked-');
}

module.exports = { extractMarkers, replaceMarkers, neutralizeInbound };
