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

console.log('zalo blocklist preserve tests passed');
