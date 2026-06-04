'use strict';
// Unit test for resolveModel — pure function extracted from call9Router.
// HTTP is NOT involved; this tests model-resolution logic only.
const assert = require('node:assert');
const { resolveModel } = require('../lib/nine-router');

// override wins, ninerouter/ prefix stripped
assert.strictEqual(resolveModel({ model: 'ninerouter/main' }, {}), 'main');
assert.strictEqual(resolveModel({ model: 'main' }, {}), 'main');

// no override -> reads agents.defaults.model, prefix stripped
assert.strictEqual(resolveModel({}, { agents: { defaults: { model: 'ninerouter/fast' } } }), 'fast');

// no override, no default -> provider first model id, else 'auto'
assert.strictEqual(resolveModel({}, { models: { providers: { ninerouter: { models: [{ id: 'combo-x' }] } } } }), 'combo-x');
assert.strictEqual(resolveModel({}, {}), 'auto');

console.log('resolveModel OK');
