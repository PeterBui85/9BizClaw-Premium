'use strict';
const http = require('http');
const { rejectIfBooting } = require('./gateway');
const { getGatewayAuthToken } = require('./channels');
const { extractConversationHistoryRaw } = require('./conversation');

async function sendChatMessage(text) {
  const bootCheck = rejectIfBooting('send-chat-message');
  if (bootCheck) return { ok: false, error: bootCheck.error };

  const token = getGatewayAuthToken();
  if (!token) return { ok: false, error: 'no_gateway_token' };

  return new Promise((resolve) => {
    const payload = JSON.stringify({ message: text, channel: 'telegram' });
    const req = http.request({
      hostname: '127.0.0.1', port: 18789, path: '/api/v1/chat',
      method: 'POST', timeout: 120000,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200 || !d) {
          return resolve({ ok: false, error: 'gateway_error' });
        }
        const reply = _parseGatewayResponse(d);
        resolve({ ok: true, reply });
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'gateway_offline' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function _parseGatewayResponse(body) {
  try {
    const parsed = JSON.parse(body);
    const payloads = parsed?.result?.payloads || parsed?.payloads || [];
    if (payloads.length > 0) return payloads[0].text || '';
    if (parsed?.result?.text) return parsed.result.text;
    if (parsed?.text) return parsed.text;
    return body;
  } catch {
    return body;
  }
}

function getChatHistory(maxMessages = 50) {
  return extractConversationHistoryRaw({ maxMessages, channels: ['telegram'] });
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
