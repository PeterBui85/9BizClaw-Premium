'use strict';

// Each channel entry has two identity fields:
//   key   — the lookup key used by 9BizClaw internally (matches the CHANNELS object key)
//   id    — the openclaw plugin name used in openclaw.json channels.* config
// These differ for channels where the plugin name doesn't match our display name
// (e.g. key='lark' but id='feishu' because the openclaw plugin is named 'feishu').
const CHANNELS = {
  telegram: {
    key: 'telegram',
    id: 'telegram',
    label: 'Telegram',
    icon: 'brand-telegram',
    role: 'ceo',
    hasAllowlist: false,
    hasPause: true,
    loginChannel: null,
    pluginPkg: null,
  },
  zalo: {
    key: 'zalo',
    id: 'modoro-zalo',
    label: 'Zalo',
    icon: 'brand-zalo',
    role: 'customer',
    hasAllowlist: true,
    hasPause: true,
    loginChannel: null,
    pluginPkg: null,
  },
  whatsapp: {
    key: 'whatsapp',
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'brand-whatsapp',
    role: 'customer',
    hasAllowlist: true,
    hasPause: true,
    loginChannel: 'whatsapp',
    pluginPkg: '@openclaw/whatsapp',
  },
  lark: {
    key: 'lark',
    id: 'feishu',
    label: 'Lark',
    icon: 'brand-lark',
    role: 'internal',
    hasAllowlist: false,
    hasPause: true,
    loginChannel: 'feishu',
    pluginPkg: null,
  },
};

function getChannel(key) { return CHANNELS[key] || null; }
function listChannels() { return Object.values(CHANNELS); }
function listNewChannels() { return Object.entries(CHANNELS).filter(([k]) => k === 'whatsapp' || k === 'lark').map(([, v]) => v); }
function getChannelByOpenClawId(ocId) { return Object.values(CHANNELS).find(c => c.id === ocId) || null; }

module.exports = { CHANNELS, getChannel, listChannels, listNewChannels, getChannelByOpenClawId };
