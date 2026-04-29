const assert = require('assert');
const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf-8');

assert(
  mainSrc.includes('let _gatewayIntentionalStopDepth = 0'),
  'tracks intentional gateway stops separately from crashes'
);

assert(
  mainSrc.includes("console.log('[restart-guard] gateway exit is intentional") &&
    mainSrc.includes('caller owns restart'),
  'gateway exit handler ignores intentional stop/restart exits'
);

assert(
  mainSrc.includes('cooldownUntil > now && !opts.ignoreCooldown') &&
    mainSrc.includes('cooldown ignored for explicit gateway restart'),
  'explicit restarts can bypass transient network cooldown'
);

const explicitRestarts = (mainSrc.match(/startOpenClaw\(\{ ignoreCooldown: true \}\)/g) || []).length;
assert(
  explicitRestarts >= 2,
  'Zalo save/resume hard restarts bypass cooldown after intentional stop'
);

assert(
  mainSrc.includes('_gatewayIntentionalStopDepth++') &&
    mainSrc.includes('_gatewayIntentionalStopDepth = Math.max(0, _gatewayIntentionalStopDepth - 1)'),
  'stopOpenClaw wraps process exit with intentional-stop depth'
);

console.log('gateway intentional restart tests passed');
