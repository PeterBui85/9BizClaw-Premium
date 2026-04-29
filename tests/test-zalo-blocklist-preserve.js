const assert = require('assert');
const path = require('path');

const {
  normalizeZaloBlocklist,
  resolveZaloBlocklistSave,
} = require(path.join(__dirname, '..', 'electron', 'lib', 'zalo-settings'));

{
  const result = resolveZaloBlocklistSave({
    existingBlocklist: ['u1', 'u2'],
    incomingBlocklist: [],
    userBlocklistTouched: false,
  });
  assert.deepStrictEqual(result.blocklist, ['u1', 'u2']);
  assert.strictEqual(result.shouldWrite, false);
  assert.strictEqual(result.preservedExisting, true);
}

{
  const result = resolveZaloBlocklistSave({
    existingBlocklist: ['u1', 'u2'],
    incomingBlocklist: [],
    userBlocklistTouched: true,
  });
  assert.deepStrictEqual(result.blocklist, []);
  assert.strictEqual(result.shouldWrite, true);
  assert.strictEqual(result.preservedExisting, false);
}

{
  const result = resolveZaloBlocklistSave({
    existingBlocklist: ['u1'],
    incomingBlocklist: ['u3'],
    userBlocklistTouched: false,
  });
  assert.deepStrictEqual(result.blocklist, ['u3']);
  assert.strictEqual(result.shouldWrite, true);
}

assert.deepStrictEqual(
  normalizeZaloBlocklist([{ id: ' u1 ' }, 'u2', '', null, { id: 'u3' }]),
  ['u1', 'u2', 'u3']
);

{
  const manyFriends = Array.from({ length: 2800 }, (_, i) => `friend-${i + 1}`);
  const result = resolveZaloBlocklistSave({
    existingBlocklist: [],
    incomingBlocklist: manyFriends,
    userBlocklistTouched: true,
  });
  assert.strictEqual(result.blocklist.length, 2800);
  assert.deepStrictEqual(result.blocklist.slice(0, 3), ['friend-1', 'friend-2', 'friend-3']);
  assert.deepStrictEqual(result.blocklist.slice(-3), ['friend-2798', 'friend-2799', 'friend-2800']);
}

{
  const fs = require('fs');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert(!mainSource.includes('blocklist_trimmed'), 'boot must not trim large Zalo friend blocklists');
  assert(!/zalo-blocklist\.json[\s\S]{0,600}slice\(0,\s*200\)/.test(mainSource), 'boot must not slice Zalo blocklist to 200');
  assert(!mainSource.includes('function cleanBlocklist'), 'legacy destructive cleanBlocklist() must stay removed');
  assert(mainSource.includes('never truncate user intent'), 'large friend-list preservation rationale should stay documented');
  assert(mainSource.includes('function saveZaloRealtimeManagerFiles'), 'workspace Zalo settings should be saveable independently from gateway restart');
  assert(mainSource.includes('forceDisableZaloFailClosed'), 'Zalo master-off must fail closed while gateway is booting');
  assert(/if \(booting\)[\s\S]*enabled === false[\s\S]*forceDisableZaloFailClosed/.test(mainSource), 'save-zalo-manager-config must allow disabling Zalo during BOOT_IN_PROGRESS');
  assert(/if \(booting\)[\s\S]*saveZaloRealtimeManagerFiles/.test(mainSource), 'save-zalo-manager-config must allow realtime blocklist/group saves during BOOT_IN_PROGRESS');
}

{
  const fs = require('fs');
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ui', 'dashboard.html'), 'utf8');
  const toggleAllMatch = dashboardSource.match(/function toggleAllFriends\(checked\) \{[\s\S]*?\n    \}/);
  assert(toggleAllMatch, 'toggleAllFriends() not found');
  assert(toggleAllMatch[0].includes('saveZaloManager();'), 'bulk friend toggle must save immediately, not wait for debounce');
  assert(!toggleAllMatch[0].includes('autoSaveZaloManager();'), 'bulk friend toggle must not rely on debounced autosave');
  assert(dashboardSource.includes('f.phoneNumber'), 'friend phone number should remain visible when OpenZCA provides it');
  assert(/displayName[\s\S]{0,120}phoneNumber/.test(dashboardSource), 'friend search should include phone number');
}

console.log('zalo blocklist preserve tests passed');
