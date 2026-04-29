const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf-8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron', 'splash-preload.js'), 'utf-8');
const splashSrc = fs.readFileSync(path.join(root, 'electron', 'ui', 'splash.html'), 'utf-8');
const electronPackage = JSON.parse(fs.readFileSync(path.join(root, 'electron', 'package.json'), 'utf-8'));

assert(
  preloadSrc.includes("ipcRenderer.send('splash-ready')") ||
    preloadSrc.includes('ipcRenderer.send("splash-ready")'),
  'splash preload exposes ready signal'
);

assert(
  Array.isArray(electronPackage.build.files) &&
    electronPackage.build.files.includes('splash-preload.js'),
  'electron-builder includes splash-preload.js in packaged app'
);

assert(
  splashSrc.includes('window.splash.ready()'),
  'splash renderer signals ready after progress listeners are registered'
);

assert(
  mainSrc.includes("'splash-ready'") &&
    mainSrc.includes('waitForSplashReady') &&
    mainSrc.includes('await splashReady'),
  'main waits for splash-ready before vendor extraction'
);

assert(
  mainSrc.includes('backgroundThrottling: false'),
  'splash window disables background throttling during first-run extraction'
);

assert(
  mainSrc.includes('startSplashProgressHeartbeat'),
  'main has fallback splash progress heartbeat'
);

console.log('splash progress handshake tests passed');
