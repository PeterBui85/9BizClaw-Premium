'use strict';

const POLL_INTERVAL_MS = 180_000;
const SETTLE_MS = 45_000;
const MAX_DEFER_MS = 600_000;
const EXTRACTOR_MODEL = 'ninerouter/main';
const WARN_EXTRACTIONS_PER_DAY = 200;
const FACT_STR_MAX = 200;
const PROFILE_MAX_BYTES = 50 * 1024;
const FACTS_START = '<!-- CUSTOMER-FACTS-START -->';
const FACTS_END = '<!-- CUSTOMER-FACTS-END -->';

const { sanitizeMemorySummary } = require('./conversation');

function sanitizeFact(s) {
  if (s == null) return '';
  let t = sanitizeMemorySummary(String(s));
  t = t.replace(/[\r\n]+/g, ' ');
  t = t.replace(/<!--[\s\S]*?-->|<!--|-->/g, ' ');
  t = t.replace(/\[(NGƯỜI NỘI BỘ|XƯNG HÔ|DỮ LIỆU KHÁCH)[^\]]*\]?/gi, ' ');
  t = t.replace(/(^|\s)#{1,6}\s+/g, ' ');
  t = t.replace(/(^|\s)(-{3,}|\*{3,}|_{3,})(\s|$)/g, ' ');
  t = t.replace(/^\s*[>*-]\s+/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.slice(0, FACT_STR_MAX);
}

// --- mergeFacts helpers ---

const _norm = (s) => sanitizeFact(s).toLowerCase().replace(/\s+/g, ' ').trim();

function _renderBlock(facts, prev) {
  const mergeArr = (oldArr, neu) => {
    const seen = new Set((oldArr || []).map(_norm).filter(Boolean));
    const out = [...(oldArr || [])];
    for (const x of (neu || [])) {
      const c = sanitizeFact(x);
      if (c && !seen.has(_norm(c))) { seen.add(_norm(c)); out.push(c); }
    }
    return out.slice(-30);
  };
  const summary    = facts.summary != null ? sanitizeFact(facts.summary) : (prev.summary || '');
  const personality = mergeArr(prev.personality, facts.personality);
  const preferences = mergeArr(prev.preferences, facts.preferences);
  const decisions   = mergeArr(prev.decisions,   facts.decisions);
  const tags        = mergeArr(prev.tags,        facts.tags);
  const li = (a) => a.length ? a.map(x => `- ${x}`).join('\n') : '(chưa có)';
  return (
    `${FACTS_START}\n` +
    `## Tóm tắt\n${summary || '(chưa có)'}\n\n` +
    `## Tính cách\n${li(personality)}\n\n` +
    `## Sở thích\n${li(preferences)}\n\n` +
    `## Quyết định\n${li(decisions)}\n\n` +
    `## Tags\n${li(tags)}\n` +
    `${FACTS_END}`
  );
}

function _parsePrev(content) {
  const s = content.indexOf(FACTS_START), e = content.indexOf(FACTS_END);
  if (s < 0 || e < s) return {};
  const block = content.slice(s, e);
  const grabList = (h) => {
    const m = block.match(new RegExp(`## ${h}\\n([\\s\\S]*?)(?:\\n## |$)`));
    if (!m) return [];
    return m[1].split('\n').map(x => x.replace(/^[-#]\s*/, '').trim()).filter(x => x && x !== '(chưa có)');
  };
  const sm = block.match(/## Tóm tắt\n([\s\S]*?)\n\n## /);
  return {
    summary: sm ? sm[1].trim().replace(/^\(chưa có\)$/, '') : '',
    personality: grabList('Tính cách'),
    preferences: grabList('Sở thích'),
    decisions:   grabList('Quyết định'),
    tags:        grabList('Tags'),
  };
}

// Merge a facts object into the CUSTOMER-FACTS fenced block in content.
// Summary replaces; arrays accumulate with content-dedup; block is placed
// right after the first # H1 line, before any dated ## YYYY-MM-DD section.
// Caller is responsible for trimZaloMemoryFile after writing (Task 7).
function mergeFacts(content, facts) {
  const prev  = _parsePrev(content);
  const block = _renderBlock(facts, prev);
  const s = content.indexOf(FACTS_START), e = content.indexOf(FACTS_END);
  let out;
  if (s >= 0 && e > s) {
    // Replace existing block in-place
    out = content.slice(0, s) + block + content.slice(e + FACTS_END.length);
  } else {
    // Insert after the first # H1 line
    const h1 = content.search(/^# .+$/m);
    if (h1 >= 0) {
      const nl = content.indexOf('\n', h1);
      const at = nl < 0 ? content.length : nl + 1;
      out = content.slice(0, at) + '\n' + block + '\n' + content.slice(at);
    } else {
      out = content.trimEnd() + '\n\n' + block + '\n';
    }
  }
  return out;
}

module.exports = { sanitizeFact, mergeFacts, FACTS_START, FACTS_END, _parsePrev };
