// electron/fb/generator.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: context assembly + 5-skill prompt + JSON schema output

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const fbGraph = require('./graph');
const fbConfig = require('./config');

function _readFileSafe(p, maxBytes = 50 * 1024) {
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return raw.length > maxBytes ? raw.slice(0, maxBytes) + '\n...(truncated)' : raw;
  } catch { return null; }
}

function _workspace() {
  if (process.env['9BIZ_WORKSPACE']) return process.env['9BIZ_WORKSPACE'];
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', '9bizclaw');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '9bizclaw');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), '9bizclaw');
}

async function gatherContext({ pageId, pageToken }) {
  const ws = _workspace();
  const ctx = {
    agents: _readFileSafe(path.join(ws, 'AGENTS.md')),
    identity: _readFileSafe(path.join(ws, 'IDENTITY.md')),
    company: _readFileSafe(path.join(ws, 'knowledge', 'cong-ty', 'index.md')),
    products: _readFileSafe(path.join(ws, 'knowledge', 'san-pham', 'index.md')),
    industry: _readFileSafe(path.join(ws, 'industry', 'active.md')),
    performance: _readFileSafe(path.join(ws, 'memory', 'fb-performance-history.md')),
    recentMemory: [],
    recentPosts: [],
    skills: {},
  };

  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const mem = _readFileSafe(path.join(ws, 'memory', `${iso}.md`), 10 * 1024);
    if (mem) ctx.recentMemory.push({ date: iso, content: mem });
  }

  const skills = ['fb-post-writer', 'fb-industry-voice', 'fb-repetition-avoider', 'fb-trend-aware', 'fb-ab-variant'];
  for (const s of skills) {
    ctx.skills[s] = _readFileSafe(path.join(ws, 'skills', `${s}.md`));
  }

  if (pageId && pageToken) {
    try {
      const since = new Date(); since.setDate(since.getDate() - 14);
      const res = await fbGraph.fetchRecentPosts(pageId, pageToken, since.toISOString());
      ctx.recentPosts = res.data || [];
    } catch (e) {
      ctx.recentPosts = [];
      ctx.recentPostsError = e.message;
    }
  }

  return ctx;
}

function buildPrompt(ctx) {
  const parts = [];
  parts.push('Ban la copywriter Facebook cho CEO Viet Nam. Soan 1 Main + 0-2 Variants cho bai dang Fanpage hom nay.');
  parts.push('\n=== AGENTS.md (voice, rules) ===\n' + (ctx.agents || '(empty)'));
  if (ctx.identity) parts.push('\n=== IDENTITY.md ===\n' + ctx.identity);
  if (ctx.company) parts.push('\n=== Company knowledge ===\n' + ctx.company);
  if (ctx.products) parts.push('\n=== Products knowledge ===\n' + ctx.products);
  if (ctx.industry) parts.push('\n=== Industry tone ===\n' + ctx.industry);

  parts.push('\n=== Skills (apply all 5 in order) ===');
  const order = ['fb-post-writer', 'fb-industry-voice', 'fb-repetition-avoider', 'fb-trend-aware', 'fb-ab-variant'];
  for (const s of order) {
    if (ctx.skills[s]) parts.push(`\n--- ${s} ---\n${ctx.skills[s]}`);
  }

  if (ctx.recentMemory.length) {
    parts.push('\n=== Recent memory (7 days) ===');
    for (const m of ctx.recentMemory) parts.push(`\n[${m.date}]\n${m.content}`);
  }
  if (ctx.recentPosts.length) {
    parts.push('\n=== Recent FB posts (14 days) ===');
    for (const p of ctx.recentPosts) {
      parts.push(`[${p.created_time}] ${(p.message || '').slice(0, 120)}`);
    }
  }
  if (ctx.performance && ctx.performance !== '(No entries yet.)') {
    parts.push('\n=== Performance history ===\n' + ctx.performance);
  }

  parts.push('\n=== Output ===');
  parts.push('Return STRICT JSON. No prose outside JSON. Schema:');
  parts.push(`{
  "generatedAt": "ISO8601",
  "date": "YYYY-MM-DD",
  "main": { "id": "YYYY-MM-DD-main", "angle": "educational|story|question|promotional|testimonial",
            "message": "...", "imageHint": "path_or_null", "suggestedTimes": ["HH:MM"],
            "hashtags": [], "status": "pending" },
  "variants": [
    { "id": "YYYY-MM-DD-a", ... },
    { "id": "YYYY-MM-DD-b", ... }
  ]
}
Variants array: min 0, max 2.`);

  return parts.join('\n');
}

function parseGeneratorOutput(raw) {
  let text = String(raw || '').trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) throw new Error('No JSON in generator output');
  text = text.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(text);
  if (!parsed.main?.id) throw new Error('Missing main.id');
  parsed.variants = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 2) : [];
  return parsed;
}

async function generateDrafts({ pageId, pageToken, llmCall }) {
  const ctx = await gatherContext({ pageId, pageToken });
  const prompt = buildPrompt(ctx);
  const raw = await llmCall(prompt);
  return parseGeneratorOutput(raw);
}

module.exports = { gatherContext, buildPrompt, parseGeneratorOutput, generateDrafts };
