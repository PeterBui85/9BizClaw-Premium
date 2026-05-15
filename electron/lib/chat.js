'use strict';
const fs = require('fs');
const path = require('path');
const { rejectIfBooting } = require('./gateway');
const { getTelegramConfigWithRecovery } = require('./channels');
const { spawnOpenClawSafe } = require('./boot');
const { buildAgentArgs } = require('./cron');
const { buildSkillInjectionBlock } = require('./skill-manager');
const { getWorkspace } = require('./workspace');

const CHAT_HISTORY_MAX_BYTES = 512 * 1024; // 512KB cap

function _getChatHistoryPath() {
  const ws = getWorkspace();
  if (!ws) return null;
  const logsDir = path.join(ws, 'logs');
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}
  return path.join(logsDir, 'chat-history.jsonl');
}

function _appendChatEntry(role, text, ts, mediaUrls) {
  const fp = _getChatHistoryPath();
  if (!fp) return;
  try {
    const entry = JSON.stringify({ role, text, ts, mediaUrls: mediaUrls || [] }) + '\n';
    fs.appendFileSync(fp, entry, 'utf-8');
  } catch (e) {
    console.warn('[chat] history append failed:', e?.message);
  }
}

function _trimChatHistoryIfNeeded(fp) {
  try {
    const stat = fs.statSync(fp);
    if (stat.size <= CHAT_HISTORY_MAX_BYTES) return;
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const half = Math.floor(lines.length / 2);
    const trimmed = lines.slice(half).join('\n') + '\n';
    fs.writeFileSync(fp, trimmed, 'utf-8');
  } catch {}
}

// Lazy-match user-skills injection: read registry, filter by trigger keywords
// against the CEO's current chat message, inject ONLY matching skills.
// Replaces the earlier eager INLINE.md merge that loaded all skills every turn.
function _injectActiveSkills(text) {
  try {
    const block = buildSkillInjectionBlock(text);
    if (!block) return text;
    return `<active-user-skills>\n${block}\n</active-user-skills>\n\n${text}`;
  } catch { return text; }
}

// Parse openclaw agent --json output. Handle 3 stdout formats:
//   1. Single-line JSON: `{"result":{"payloads":[{"text":"..."}]}}`
//   2. Multi-line pretty-printed JSON (openclaw default for --json)
//   3. Noise-prefixed (npm warnings / boot logs before JSON)
// Strategy: try whole stdout first, then find balanced JSON block, then
// line-by-line as last resort.
function _parseAgentJsonOutput(stdout) {
  if (!stdout) return null;
  const trimmed = String(stdout).trim();
  if (!trimmed) return null;

  const extract = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return null;
    const payloads = parsed?.result?.payloads || parsed?.payloads || [];
    if (Array.isArray(payloads) && payloads.length > 0) {
      const first = payloads[0];
      const text = first?.text || '';
      const mediaUrls = first?.mediaUrls || first?.mediaUrl || [];
      const mediaArr = Array.isArray(mediaUrls) ? mediaUrls : (mediaUrls ? [mediaUrls] : []);
      if (text || mediaArr.length > 0) return { text, mediaUrls: mediaArr };
    }
    if (typeof parsed?.result?.text === 'string') return { text: parsed.result.text, mediaUrls: [] };
    if (typeof parsed?.text === 'string') return { text: parsed.text, mediaUrls: [] };
    return null;
  };

  // Strategy 1: try parsing entire trimmed stdout (handles pretty-printed JSON).
  try {
    const reply = extract(JSON.parse(trimmed));
    if (reply) return reply;
  } catch {}

  // Strategy 2: find the LAST balanced JSON block in stdout (handles noise-prefixed).
  // Walk from end, find last `}`, then scan back for matching `{`.
  const lastClose = trimmed.lastIndexOf('}');
  if (lastClose !== -1) {
    let depth = 0;
    let startIdx = -1;
    for (let i = lastClose; i >= 0; i--) {
      const ch = trimmed[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        depth--;
        if (depth === 0) { startIdx = i; break; }
      }
    }
    if (startIdx !== -1) {
      try {
        const reply = extract(JSON.parse(trimmed.slice(startIdx, lastClose + 1)));
        if (reply) return reply;
      } catch {}
    }
  }

  // Strategy 3: line-by-line scan for single-line JSON (legacy fallback).
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      const reply = extract(JSON.parse(line));
      if (reply) return reply;
    } catch {}
  }

  // Diagnostic: dump first 500 chars of stdout when ALL parse strategies fail.
  // This lets CEO send the log to support to debug openclaw output drift.
  console.warn('[chat] parse failed — stdout sample:', trimmed.slice(0, 500));
  return null;
}

async function sendChatMessage(text) {
  const bootCheck = rejectIfBooting('send-chat-message');
  if (bootCheck) return { ok: false, error: 'BOOT_IN_PROGRESS' };

  let chatId;
  try {
    const cfg = await getTelegramConfigWithRecovery();
    chatId = cfg?.chatId;
  } catch {}
  if (!chatId) return { ok: false, error: 'no_chat_id' };

  // --json + --channel/--to without --reply-channel/--reply-to: openclaw
  // returns the agent's reply as JSON and does NOT deliver to Telegram.
  // This is the same pattern cron.js uses for journaled agent runs that
  // we deliver ourselves to Zalo — proven safe in production.
  const enrichedText = _injectActiveSkills(text);
  const args = buildAgentArgs(enrichedText, chatId, true);

  const sendTs = Date.now();
  _appendChatEntry('user', text, sendTs);

  try {
    const res = await spawnOpenClawSafe(args, {
      timeoutMs: 600000,
      allowCmdShellFallback: !text.includes('\n'),
    });

    if (res.code !== 0) {
      const errSnippet = (res.stderr || res.stdout || '').slice(0, 300);
      console.error('[chat] agent failed (exit ' + res.code + '):', errSnippet);
      if (errSnippet.toLowerCase().includes('gateway not running') || errSnippet.toLowerCase().includes('econnrefused')) {
        return { ok: false, error: 'gateway_offline' };
      }
      return { ok: false, error: 'agent_error', detail: errSnippet.slice(0, 100) };
    }

    const parsed = _parseAgentJsonOutput(res.stdout);
    if (!parsed) {
      return { ok: true, reply: 'Trợ lý đã xử lý nhưng không có nội dung trả lời.' };
    }
    _appendChatEntry('assistant', parsed.text || '', Date.now(), parsed.mediaUrls);
    const hp = _getChatHistoryPath();
    if (hp) _trimChatHistoryIfNeeded(hp);
    return { ok: true, reply: parsed.text || '', mediaUrls: parsed.mediaUrls || [] };
  } catch (e) {
    console.error('[chat] spawn error:', e?.message || e);
    return { ok: false, error: 'spawn_error' };
  }
}

function getChatHistory(maxMessages = 50) {
  const fp = _getChatHistoryPath();
  if (!fp || !fs.existsSync(fp)) return [];
  try {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e && e.role && typeof e.ts === 'number') entries.push(e);
      } catch {}
    }
    return entries.slice(-maxMessages);
  } catch (e) {
    console.warn('[chat] history read failed:', e?.message);
    return [];
  }
}

function registerChatIpc() {
  const { ipcMain } = require('electron');
  ipcMain.handle('send-chat-message', async (_ev, text) => {
    if (!text || typeof text !== 'string') return { ok: false, error: 'empty_message' };
    return sendChatMessage(text.trim());
  });
  ipcMain.handle('get-chat-history', async () => {
    return getChatHistory();
  });
}

module.exports = { sendChatMessage, getChatHistory, registerChatIpc };
