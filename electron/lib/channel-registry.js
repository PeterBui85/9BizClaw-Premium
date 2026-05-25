'use strict';

const CHANNELS = {
  telegram: {
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
function listNewChannels() { return Object.entries(CHANNELS).filter(([k]) => k === 'whatsapp' || k === 'lark'); }
function getChannelByOpenClawId(ocId) { return Object.values(CHANNELS).find(c => c.id === ocId) || null; }

module.exports = { CHANNELS, getChannel, listChannels, listNewChannels, getChannelByOpenClawId };
