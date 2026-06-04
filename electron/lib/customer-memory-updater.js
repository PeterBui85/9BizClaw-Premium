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

module.exports = { sanitizeFact };
