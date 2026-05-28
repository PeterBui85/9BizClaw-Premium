# MODOROClaw Marketplace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a marketplace where users browse and install skill/agent packages from within the Electron app via an embedded web catalog.

**Architecture:** Web catalog (Next.js SSG on Vercel) embedded as `<webview>` in Dashboard. Install engine (`marketplace-installer.js`) handles download, Ed25519 signature verification, and installation of `.clawpkg` zip packages into the workspace. Communication via `contextBridge` preload + IPC.

**Tech Stack:** Electron (existing), Node.js `crypto` (Ed25519), `adm-zip` (new dep), Next.js 15 + Tailwind + MDX (web catalog, separate project)

**Spec:** `docs/superpowers/specs/2026-05-20-marketplace-design.md`

---

## Chunk 1: Install Engine Core

The install engine is the heart of the marketplace — it downloads, verifies, extracts, and installs `.clawpkg` packages. Pure Node.js module with no Electron dependencies, fully testable via scripts.

### Task 1: Add `adm-zip` dependency

**Files:**
- Modify: `electron/package.json` — add `adm-zip` to dependencies

- [ ] **Step 1: Install adm-zip**

```bash
cd electron && npm install adm-zip@0.5.16 --save
```

- [ ] **Step 2: Verify**

```bash
node -e "require('adm-zip'); console.log('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add electron/package.json electron/package-lock.json
git commit -m "chore: add adm-zip dependency for marketplace package extraction"
```

---

### Task 2: Manifest validation module

**Files:**
- Create: `electron/lib/marketplace-manifest.js`
- Create: `electron/scripts/smoke-marketplace-manifest.js`

- [ ] **Step 1: Write smoke test**

```js
// electron/scripts/smoke-marketplace-manifest.js
'use strict';
const { validateManifest } = require('../lib/marketplace-manifest');

const VALID_SKILL = {
  id: 'test-skill',
  type: 'skill',
  name: 'Test Skill',
  version: '1.0.0',
  description: 'A test skill',
  category: 'customer-service',
  author: 'MODORO',
  authorType: 'modoro',
  appliesTo: ['zalo'],
  price: { type: 'included', vnd: 0 },
  requires: { minAppVersion: '2.4.0' },
  installTarget: 'user-skills'
};

const VALID_AGENT = {
  ...VALID_SKILL,
  id: 'test-agent',
  type: 'agent',
  installTarget: 'workspace',
  industry: 'restaurant'
};

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } }

// Valid manifests
let r = validateManifest(VALID_SKILL);
assert(r.valid, 'valid skill should pass');

r = validateManifest(VALID_AGENT);
assert(r.valid, 'valid agent should pass');

// Missing required fields
r = validateManifest({ id: 'x' });
assert(!r.valid, 'incomplete manifest should fail');
assert(r.errors.length > 0, 'should have errors');

// Invalid type
r = validateManifest({ ...VALID_SKILL, type: 'plugin' });
assert(!r.valid, 'invalid type should fail');

// Invalid category
r = validateManifest({ ...VALID_SKILL, category: 'invalid' });
assert(!r.valid, 'invalid category should fail');

// Invalid appliesTo
r = validateManifest({ ...VALID_SKILL, appliesTo: ['facebook'] });
assert(!r.valid, 'invalid channel should fail');

// Version compatibility check
r = validateManifest(VALID_SKILL, '2.3.0');
assert(!r.valid, 'version below minAppVersion should fail');

r = validateManifest(VALID_SKILL, '2.5.0');
assert(r.valid, 'version above minAppVersion should pass');

console.log(`manifest validation: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run smoke test — expect FAIL (module missing)**

```bash
cd electron && node scripts/smoke-marketplace-manifest.js
```
Expected: `Cannot find module '../lib/marketplace-manifest'`

- [ ] **Step 3: Implement marketplace-manifest.js**

```js
// electron/lib/marketplace-manifest.js
'use strict';

const VALID_TYPES = ['skill', 'agent'];
const VALID_CATEGORIES = ['customer-service', 'marketing', 'operations', 'sales', 'hr', 'finance', 'custom'];
const VALID_CHANNELS = ['zalo', 'telegram'];
const VALID_AUTHOR_TYPES = ['modoro', 'partner'];
const VALID_INSTALL_TARGETS = ['user-skills', 'workspace'];
const VALID_PRICE_TYPES = ['included', 'addon'];

const REQUIRED_FIELDS = ['id', 'type', 'name', 'version', 'description', 'category', 'author', 'authorType', 'appliesTo', 'price', 'requires', 'installTarget'];

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function validateManifest(manifest, currentAppVersion) {
  const errors = [];

  for (const f of REQUIRED_FIELDS) {
    if (manifest[f] === undefined || manifest[f] === null) {
      errors.push(`missing required field: ${f}`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  if (!VALID_TYPES.includes(manifest.type)) errors.push(`invalid type: ${manifest.type}`);
  if (!VALID_CATEGORIES.includes(manifest.category)) errors.push(`invalid category: ${manifest.category}`);
  if (!VALID_AUTHOR_TYPES.includes(manifest.authorType)) errors.push(`invalid authorType: ${manifest.authorType}`);
  if (!VALID_INSTALL_TARGETS.includes(manifest.installTarget)) errors.push(`invalid installTarget: ${manifest.installTarget}`);

  if (!Array.isArray(manifest.appliesTo) || manifest.appliesTo.length === 0) {
    errors.push('appliesTo must be a non-empty array');
  } else {
    for (const ch of manifest.appliesTo) {
      if (!VALID_CHANNELS.includes(ch)) errors.push(`invalid channel in appliesTo: ${ch}`);
    }
  }

  if (!VALID_PRICE_TYPES.includes(manifest.price?.type)) errors.push(`invalid price.type`);
  if (typeof manifest.price?.vnd !== 'number') errors.push('price.vnd must be a number');

  if (typeof manifest.id !== 'string' || !/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('id must be kebab-case');
  }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('version must be semver (x.y.z)');
  }

  if (currentAppVersion && manifest.requires?.minAppVersion) {
    if (compareVersions(currentAppVersion, manifest.requires.minAppVersion) < 0) {
      errors.push(`app version ${currentAppVersion} below required ${manifest.requires.minAppVersion}`);
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

module.exports = { validateManifest, compareVersions, VALID_CATEGORIES, VALID_CHANNELS };
```

- [ ] **Step 4: Run smoke test — expect PASS**

```bash
cd electron && node scripts/smoke-marketplace-manifest.js
```
Expected: `manifest validation: 7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add electron/lib/marketplace-manifest.js electron/scripts/smoke-marketplace-manifest.js
git commit -m "feat(marketplace): add manifest validation module + smoke test"
```

---

### Task 3: Package signing and verification

**Files:**
- Create: `electron/lib/marketplace-signing.js`
- Create: `electron/scripts/smoke-marketplace-signing.js`

- [ ] **Step 1: Write smoke test**

```js
// electron/scripts/smoke-marketplace-signing.js
'use strict';
const crypto = require('crypto');
const { computeContentHash, signPackage, verifyPackage } = require('../lib/marketplace-signing');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } }

// Generate ephemeral key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const manifest = { id: 'test', type: 'skill', name: 'Test', version: '1.0.0' };
const files = [
  { path: 'skill.md', content: Buffer.from('# Test skill content') },
  { path: 'icon.png', content: Buffer.from('fake-png-bytes') }
];

// Compute content hash
const hash = computeContentHash(manifest, files);
assert(typeof hash === 'string' && hash.length === 64, 'hash should be 64-char hex');

// Deterministic
const hash2 = computeContentHash(manifest, files);
assert(hash === hash2, 'hash should be deterministic');

// Different files = different hash
const hash3 = computeContentHash(manifest, [{ path: 'a.md', content: Buffer.from('other') }]);
assert(hash !== hash3, 'different files should produce different hash');

// Sign + verify round-trip
const signature = signPackage(hash, privPem);
assert(typeof signature === 'string', 'signature should be base64 string');

const ok = verifyPackage(hash, signature, pubPem);
assert(ok === true, 'valid signature should verify');

// Tampered hash fails
const bad = verifyPackage('0'.repeat(64), signature, pubPem);
assert(bad === false, 'tampered hash should fail verification');

console.log(`signing: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run smoke test — expect FAIL**

```bash
cd electron && node scripts/smoke-marketplace-signing.js
```

- [ ] **Step 3: Implement marketplace-signing.js**

```js
// electron/lib/marketplace-signing.js
'use strict';
const crypto = require('crypto');

function computeContentHash(manifest, files) {
  const cleanManifest = { ...manifest };
  delete cleanManifest.signature;
  delete cleanManifest.checksum;
  const sortedKeys = Object.keys(cleanManifest).sort();
  const filtered = {};
  for (const k of sortedKeys) filtered[k] = cleanManifest[k];
  const manifestCanonical = JSON.stringify(filtered);

  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const fileHashes = sortedFiles.map(f => {
    const h = crypto.createHash('sha256').update(f.content).digest('hex');
    return `${f.path}:${h}`;
  });

  const payload = manifestCanonical + '\n' + fileHashes.join('\n');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function signPackage(contentHash, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(contentHash, 'hex'), key);
  return sig.toString('base64');
}

function verifyPackage(contentHash, signatureBase64, publicKeyPem) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, Buffer.from(contentHash, 'hex'), key, Buffer.from(signatureBase64, 'base64'));
  } catch { return false; }
}

module.exports = { computeContentHash, signPackage, verifyPackage };
```

- [ ] **Step 4: Run smoke test — expect PASS**

```bash
cd electron && node scripts/smoke-marketplace-signing.js
```
Expected: `signing: 7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add electron/lib/marketplace-signing.js electron/scripts/smoke-marketplace-signing.js
git commit -m "feat(marketplace): add Ed25519 package signing/verification + smoke test"
```

---

### Task 4: Install engine — download, extract, validate

**Files:**
- Create: `electron/lib/marketplace-installer.js`
- Create: `electron/scripts/smoke-marketplace-installer.js`

- [ ] **Step 1: Write smoke test for download + extract + validate flow**

```js
// electron/scripts/smoke-marketplace-installer.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { computeContentHash, signPackage } = require('../lib/marketplace-signing');
const {
  extractAndValidate,
  installSkill,
  uninstallSkill,
  getInstalledPackages,
  updateInstalledRegistry
} = require('../lib/marketplace-installer');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } }

// Setup: temp dirs
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-test-'));
const workspace = path.join(tmpDir, 'workspace');
fs.mkdirSync(path.join(workspace, 'user-skills'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'user-skills', '_registry.json'), JSON.stringify({ version: 1, skills: [] }));

// Generate test key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

// Build a valid .clawpkg
const manifest = {
  id: 'test-skill',
  type: 'skill',
  name: 'Test Skill',
  version: '1.0.0',
  description: 'A test',
  category: 'customer-service',
  author: 'MODORO',
  authorType: 'modoro',
  appliesTo: ['zalo'],
  price: { type: 'included', vnd: 0 },
  requires: { minAppVersion: '2.4.0' },
  installTarget: 'user-skills'
};
const skillContent = Buffer.from('# Test Skill\nDo something useful.');
const files = [{ path: 'skill.md', content: skillContent }];
const contentHash = computeContentHash(manifest, files);
manifest.signature = signPackage(contentHash, privPem);

const zip = new AdmZip();
zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
zip.addFile('skill.md', skillContent);
const zipPath = path.join(tmpDir, 'test-skill-1.0.0.clawpkg');
zip.writeZip(zipPath);
manifest.checksum = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
// Rewrite with checksum
const zip2 = new AdmZip();
const manifestWithChecksum = { ...manifest };
zip2.addFile('manifest.json', Buffer.from(JSON.stringify(manifestWithChecksum, null, 2)));
zip2.addFile('skill.md', skillContent);
zip2.writeZip(zipPath);

// Test extract + validate
let result = extractAndValidate(zipPath, pubPem, '2.5.0');
assert(result.valid, 'valid package should extract OK');
assert(result.manifest.id === 'test-skill', 'should parse manifest');

// Test size limit (fake)
let result2 = extractAndValidate(zipPath, pubPem, '2.5.0', { maxSizeBytes: 1 });
assert(!result2.valid, 'oversized package should fail');

// Test install skill
installSkill(result.extractDir, result.manifest, workspace);
assert(fs.existsSync(path.join(workspace, 'user-skills', 'test-skill', 'skill.md')), 'skill.md should be copied');
assert(fs.existsSync(path.join(workspace, 'user-skills', 'test-skill', 'manifest.json')), 'manifest.json should be copied');

// Test registry update
updateInstalledRegistry(manifest, workspace);
const reg = getInstalledPackages(workspace);
assert(reg.packages.length === 1, 'registry should have 1 package');
assert(reg.packages[0].id === 'test-skill', 'registry should have test-skill');

// Test uninstall
uninstallSkill('test-skill', workspace);
assert(!fs.existsSync(path.join(workspace, 'user-skills', 'test-skill')), 'skill dir should be removed');

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`installer: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run smoke — expect FAIL**

```bash
cd electron && node scripts/smoke-marketplace-installer.js
```

- [ ] **Step 3: Implement marketplace-installer.js**

```js
// electron/lib/marketplace-installer.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const AdmZip = require('adm-zip');
const { validateManifest } = require('./marketplace-manifest');
const { computeContentHash, verifyPackage } = require('./marketplace-signing');

const SKILL_MAX_BYTES = 10 * 1024 * 1024;
const AGENT_MAX_BYTES = 50 * 1024 * 1024;
const INSTALLED_REGISTRY = 'installed-packages.json';

function extractAndValidate(zipPath, publicKeyPem, currentAppVersion, opts = {}) {
  const stat = fs.statSync(zipPath);
  const maxSize = opts.maxSizeBytes ?? SKILL_MAX_BYTES;
  if (stat.size > maxSize) {
    return { valid: false, error: `package size ${stat.size} exceeds limit ${maxSize}` };
  }

  let zip;
  try { zip = new AdmZip(zipPath); } catch (e) {
    return { valid: false, error: `invalid zip: ${e.message}` };
  }

  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) return { valid: false, error: 'missing manifest.json' };

  let manifest;
  try { manifest = JSON.parse(manifestEntry.getData().toString('utf-8')); } catch (e) {
    return { valid: false, error: `invalid manifest JSON: ${e.message}` };
  }

  const maxSizeByType = manifest.type === 'agent' ? AGENT_MAX_BYTES : SKILL_MAX_BYTES;
  if (stat.size > maxSizeByType) {
    return { valid: false, error: `package size ${stat.size} exceeds ${manifest.type} limit ${maxSizeByType}` };
  }

  const validation = validateManifest(manifest, currentAppVersion);
  if (!validation.valid) return { valid: false, error: `manifest invalid: ${validation.errors.join(', ')}` };

  // Verify signature
  const entries = zip.getEntries().filter(e => e.entryName !== 'manifest.json' && !e.isDirectory);
  const files = entries.map(e => ({ path: e.entryName, content: e.getData() }));
  const contentHash = computeContentHash(manifest, files);

  if (!manifest.signature) return { valid: false, error: 'missing signature' };
  if (!verifyPackage(contentHash, manifest.signature, publicKeyPem)) {
    return { valid: false, error: 'signature verification failed' };
  }

  // Checksum verification (if present in manifest)
  if (manifest.checksum) {
    const actualChecksum = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
    if (actualChecksum !== manifest.checksum) {
      return { valid: false, error: `checksum mismatch: expected ${manifest.checksum}, got ${actualChecksum}` };
    }
  }

  // Path traversal check
  for (const e of zip.getEntries()) {
    const normalized = path.normalize(e.entryName);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      return { valid: false, error: `path traversal detected: ${e.entryName}` };
    }
  }

  // Extract to temp
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpkg-'));
  zip.extractAllTo(extractDir, true);

  return { valid: true, manifest, extractDir, contentHash };
}

function installSkill(extractDir, manifest, workspace) {
  const targetDir = path.join(workspace, 'user-skills', manifest.id);
  fs.mkdirSync(targetDir, { recursive: true });

  const skillSrc = path.join(extractDir, 'skill.md');
  if (fs.existsSync(skillSrc)) fs.copyFileSync(skillSrc, path.join(targetDir, 'skill.md'));

  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Register in _registry.json
  const regPath = path.join(workspace, 'user-skills', '_registry.json');
  let registry = { version: 1, skills: [] };
  try { registry = JSON.parse(fs.readFileSync(regPath, 'utf-8')); } catch {}
  registry.skills = registry.skills.filter(s => s.id !== manifest.id);
  registry.skills.push({
    id: manifest.id,
    name: manifest.name,
    type: 'marketplace',
    appliesTo: manifest.appliesTo.map(ch => `operations/${ch}`),
    trigger: '',
    summary: manifest.description.slice(0, 120),
    enabled: true,
    createdAt: new Date().toISOString(),
    layout: 'folder',
    createdVia: 'marketplace'
  });
  fs.writeFileSync(regPath, JSON.stringify(registry, null, 2));

  // Copy ALL content files from package (not just skill.md)
  for (const entry of fs.readdirSync(extractDir)) {
    if (entry === 'manifest.json') continue;
    const src = path.join(extractDir, entry);
    const dest = path.join(targetDir, entry);
    if (fs.statSync(src).isDirectory()) {
      copyDirSync(src, dest);
    } else if (!fs.existsSync(path.join(targetDir, entry)) || entry === 'skill.md') {
      fs.copyFileSync(src, dest);
    }
  }
}

function uninstallSkill(packageId, workspace) {
  const targetDir = path.join(workspace, 'user-skills', packageId);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });

  const regPath = path.join(workspace, 'user-skills', '_registry.json');
  try {
    const registry = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
    registry.skills = registry.skills.filter(s => s.id !== packageId);
    fs.writeFileSync(regPath, JSON.stringify(registry, null, 2));
  } catch {}
}

function installAgent(extractDir, manifest, workspace) {
  const profileDir = path.join(workspace, 'profiles', manifest.id);
  fs.mkdirSync(profileDir, { recursive: true });

  const wsSrc = path.join(extractDir, 'workspace');
  if (fs.existsSync(wsSrc)) {
    copyDirSync(wsSrc, profileDir);
  }
  fs.writeFileSync(path.join(profileDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Update profiles index
  const indexPath = path.join(workspace, 'profiles', '_index.json');
  let index = { profiles: [], activeProfile: null };
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch {}
  index.profiles = index.profiles.filter(p => p.id !== manifest.id);
  index.profiles.push({
    id: manifest.id,
    name: manifest.name,
    installedAt: new Date().toISOString(),
    active: false
  });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function activateProfile(profileId, workspace) {
  const indexPath = path.join(workspace, 'profiles', '_index.json');
  let index;
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch {
    return { success: false, error: 'profiles index not found' };
  }

  const profile = index.profiles.find(p => p.id === profileId);
  if (!profile) return { success: false, error: `profile ${profileId} not found` };

  // Deactivate current if any
  if (index.activeProfile) deactivateProfile(index.activeProfile, workspace);

  const profileDir = path.join(workspace, 'profiles', profileId);

  // Backup current state
  const agentsMd = path.join(workspace, 'AGENTS.md');
  const schedJson = path.join(workspace, 'schedules.json');
  if (fs.existsSync(agentsMd)) fs.copyFileSync(agentsMd, agentsMd + '.backup');
  if (fs.existsSync(schedJson)) fs.copyFileSync(schedJson, schedJson + '.backup');

  // Apply profile AGENTS.md (full replace)
  const profileAgents = path.join(profileDir, 'AGENTS.md');
  if (fs.existsSync(profileAgents)) fs.copyFileSync(profileAgents, agentsMd);

  // Copy skills (additive)
  const profileSkills = path.join(profileDir, 'skills');
  if (fs.existsSync(profileSkills)) {
    const destSkills = path.join(workspace, 'user-skills');
    for (const f of fs.readdirSync(profileSkills)) {
      const dest = path.join(destSkills, f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(profileSkills, f), dest);
    }
  }

  // Merge schedules (additive)
  const profileSched = path.join(profileDir, 'schedules.json');
  if (fs.existsSync(profileSched)) {
    try {
      const current = JSON.parse(fs.readFileSync(schedJson, 'utf-8'));
      const profileData = JSON.parse(fs.readFileSync(profileSched, 'utf-8'));
      if (Array.isArray(profileData.schedules)) {
        const existingIds = new Set((current.schedules || []).map(s => s.id || s.label));
        for (const s of profileData.schedules) {
          if (!existingIds.has(s.id || s.label)) {
            current.schedules = current.schedules || [];
            current.schedules.push(s);
          }
        }
        fs.writeFileSync(schedJson, JSON.stringify(current, null, 2));
      }
    } catch {}
  }

  // Seed knowledge (additive)
  const profileKnowledge = path.join(profileDir, 'knowledge');
  if (fs.existsSync(profileKnowledge)) {
    copyDirSync(profileKnowledge, path.join(workspace, 'knowledge'), true);
  }

  // Update index
  index.activeProfile = profileId;
  for (const p of index.profiles) p.active = (p.id === profileId);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  // Heal config drift after profile swap
  try { require('./workspace').ensureDefaultConfig?.(); } catch {}

  return { success: true };
}

function deactivateProfile(profileId, workspace) {
  const agentsMd = path.join(workspace, 'AGENTS.md');
  const schedJson = path.join(workspace, 'schedules.json');

  if (fs.existsSync(agentsMd + '.backup')) {
    fs.copyFileSync(agentsMd + '.backup', agentsMd);
    fs.unlinkSync(agentsMd + '.backup');
  }
  if (fs.existsSync(schedJson + '.backup')) {
    fs.copyFileSync(schedJson + '.backup', schedJson);
    fs.unlinkSync(schedJson + '.backup');
  }

  const indexPath = path.join(workspace, 'profiles', '_index.json');
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    index.activeProfile = null;
    for (const p of index.profiles) p.active = false;
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  } catch {}

  return { success: true };
}

function uninstallAgent(packageId, workspace) {
  const indexPath = path.join(workspace, 'profiles', '_index.json');
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (index.activeProfile === packageId) deactivateProfile(packageId, workspace);
    index.profiles = index.profiles.filter(p => p.id !== packageId);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  } catch {}

  const dir = path.join(workspace, 'profiles', packageId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function getInstalledPackages(workspace) {
  const regPath = path.join(workspace, INSTALLED_REGISTRY);
  try { return JSON.parse(fs.readFileSync(regPath, 'utf-8')); } catch {
    return { packages: [] };
  }
}

function updateInstalledRegistry(manifest, workspace) {
  const reg = getInstalledPackages(workspace);
  reg.packages = reg.packages.filter(p => p.id !== manifest.id);
  reg.packages.push({
    id: manifest.id,
    type: manifest.type,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    manifestHash: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  });
  fs.writeFileSync(path.join(workspace, INSTALLED_REGISTRY), JSON.stringify(reg, null, 2));
}

function removeFromInstalledRegistry(packageId, workspace) {
  const reg = getInstalledPackages(workspace);
  reg.packages = reg.packages.filter(p => p.id !== packageId);
  fs.writeFileSync(path.join(workspace, INSTALLED_REGISTRY), JSON.stringify(reg, null, 2));
}

function copyDirSync(src, dest, skipExisting = false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, skipExisting);
    } else {
      if (skipExisting && fs.existsSync(destPath)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function downloadPackage(url, destDir, _redirectCount = 0) {
  if (_redirectCount > 5) throw new Error('too many redirects');
  if (!url.startsWith('https://')) throw new Error(`unsafe download URL protocol: ${url}`);

  const https = require('https');
  return new Promise((resolve, reject) => {
    const fileName = url.split('/').pop() || 'package.clawpkg';
    const destPath = path.join(destDir, fileName);
    const file = fs.createWriteStream(destPath);

    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadPackage(res.headers.location, destDir, _redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (e) => { file.close(); reject(e); });
  });
}

module.exports = {
  extractAndValidate,
  installSkill,
  uninstallSkill,
  installAgent,
  uninstallAgent,
  activateProfile,
  deactivateProfile,
  getInstalledPackages,
  updateInstalledRegistry,
  removeFromInstalledRegistry,
  downloadPackage,
  copyDirSync
};
```

- [ ] **Step 4: Run smoke — expect PASS**

```bash
cd electron && node scripts/smoke-marketplace-installer.js
```
Expected: `installer: 6 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add electron/lib/marketplace-installer.js electron/scripts/smoke-marketplace-installer.js
git commit -m "feat(marketplace): add install engine — download, extract, validate, install/uninstall"
```

---

## Chunk 2: Electron App Integration

Wire the install engine into the Electron app: IPC handlers, preload bridges, Dashboard tab with webview embed, offline fallback.

### Task 5: Marketplace preload script

**Files:**
- Create: `electron/lib/marketplace-preload.js`

- [ ] **Step 1: Create marketplace-preload.js**

```js
// electron/lib/marketplace-preload.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__claw_bridge', {
  getInstalledPackages: () => ipcRenderer.invoke('marketplace-get-installed'),
  requestInstall: (pkg) => ipcRenderer.sendToHost('marketplace-install', pkg),
  requestUninstall: (packageId) => ipcRenderer.sendToHost('marketplace-uninstall', packageId),
  onInstallResult: (cb) => {
    ipcRenderer.removeAllListeners('marketplace-install-result');
    ipcRenderer.on('marketplace-install-result', (_e, r) => cb(r));
    return () => ipcRenderer.removeAllListeners('marketplace-install-result');
  }
});
```

- [ ] **Step 2: Verify syntax**

```bash
cd electron && node -e "require('./lib/marketplace-preload.js')" 2>&1 || echo "Expected: contextBridge only works in renderer — OK"
```
The file will error outside Electron renderer context, but should have no syntax errors.

- [ ] **Step 3: Add to asarUnpack in package.json build config**

In `electron/package.json`, inside `build.asarUnpack` (create if not exists), add `"lib/marketplace-preload.js"`.

Look at the current `build` config structure. If `asarUnpack` doesn't exist, add it under `build`:
```json
"asarUnpack": [
  "lib/marketplace-preload.js"
]
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/marketplace-preload.js electron/package.json
git commit -m "feat(marketplace): add webview preload script with contextBridge"
```

---

### Task 6: IPC handlers for marketplace

**Files:**
- Modify: `electron/lib/dashboard-ipc.js` — add marketplace IPC handlers
- Read first: `electron/lib/dashboard-ipc.js` line 1-30 for imports/structure, and the end of `registerAllIpcHandlers()`

- [ ] **Step 1: Read dashboard-ipc.js structure**

Read the top of the file (imports, function signature) and find where to add handlers.

- [ ] **Step 2: Add marketplace IPC handlers at the end of `registerAllIpcHandlers()`**

Add these handlers inside the function, following the existing `{ success, data/error }` pattern:

```js
// === MARKETPLACE ===

ipcMain.handle('marketplace-get-installed', async () => {
  try {
    const { getInstalledPackages } = require('./marketplace-installer');
    const { getWorkspace } = require('./workspace');
    const ws = getWorkspace();
    return { success: true, data: getInstalledPackages(ws) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// NOTE: marketplace-install is triggered via the two-hop path:
// webview preload sendToHost → dashboard.html ipc-message listener → window.claw.marketplaceInstall → this handler.
// The webview preload uses sendToHost (not ipcRenderer.invoke) because webview guest → main process
// requires going through the host page first.
ipcMain.handle('marketplace-install', async (_event, pkg) => {
  let tmpDir = null;
  let extractDir = null;
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { downloadPackage, extractAndValidate, installSkill, installAgent, updateInstalledRegistry } = require('./marketplace-installer');
    const { getWorkspace } = require('./workspace');
    const ws = getWorkspace();
    const pubKeyPath = path.join(__dirname, 'license-public.pem');
    const pubKey = fs.readFileSync(pubKeyPath, 'utf-8');
    const pkgJson = require(path.join(__dirname, '..', 'package.json'));
    const appVersion = pkgJson.version;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-dl-'));
    const zipPath = await downloadPackage(pkg.downloadUrl, tmpDir);

    const result = extractAndValidate(zipPath, pubKey, appVersion);
    if (!result.valid) {
      return { success: false, error: result.error };
    }
    extractDir = result.extractDir;

    if (result.manifest.type === 'skill') {
      installSkill(result.extractDir, result.manifest, ws);
    } else if (result.manifest.type === 'agent') {
      installAgent(result.extractDir, result.manifest, ws);
    }

    updateInstalledRegistry(result.manifest, ws);

    return { success: true, data: { id: result.manifest.id, type: result.manifest.type, version: result.manifest.version } };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    const fs = require('fs');
    if (tmpDir) try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    if (extractDir) try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
});

ipcMain.handle('marketplace-uninstall', async (_event, packageId) => {
  try {
    const { getInstalledPackages, uninstallSkill, uninstallAgent, removeFromInstalledRegistry } = require('./marketplace-installer');
    const { getWorkspace } = require('./workspace');
    const ws = getWorkspace();
    const reg = getInstalledPackages(ws);
    const pkg = reg.packages.find(p => p.id === packageId);
    if (!pkg) return { success: false, error: 'package not found' };

    if (pkg.type === 'skill') uninstallSkill(packageId, ws);
    else if (pkg.type === 'agent') uninstallAgent(packageId, ws);
    removeFromInstalledRegistry(packageId, ws);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('marketplace-activate-profile', async (_event, profileId) => {
  try {
    const { activateProfile } = require('./marketplace-installer');
    const { getWorkspace } = require('./workspace');
    return activateProfile(profileId, getWorkspace());
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('marketplace-deactivate-profile', async (_event, profileId) => {
  try {
    const { deactivateProfile } = require('./marketplace-installer');
    const { getWorkspace } = require('./workspace');
    return deactivateProfile(profileId, getWorkspace());
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('marketplace-get-preload-path', async () => {
  const path = require('path');
  const { app } = require('electron');
  // In ASAR builds, preload must be in app.asar.unpacked/ (listed in asarUnpack config)
  const appPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
  return path.join(appPath, 'lib', 'marketplace-preload.js');
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/dashboard-ipc.js
git commit -m "feat(marketplace): add IPC handlers for install/uninstall/profiles"
```

---

### Task 7: Register marketplace session in header stripper

**Files:**
- Modify: `electron/main.js` — add `persist:embed-marketplace` partition to `installEmbedHeaderStripper()`

- [ ] **Step 1: Read `installEmbedHeaderStripper` in main.js**

Find the function (~line 519-579 per exploration) and locate the three `attach()` calls at the bottom.

- [ ] **Step 2: Add marketplace session**

After the existing `attach(session.fromPartition('persist:embed-9router'), ...)` line, add:

```js
attach(session.fromPartition('persist:embed-marketplace'), 'persist:embed-marketplace');
```

Note: The marketplace loads from an external URL (Vercel), not localhost. The header stripper only strips headers for `TRUSTED_LOCAL` origins. The marketplace partition registration ensures cookies/sessions persist — the header stripping won't fire for `https://marketplace.clawhub.ai/` (which is correct — external sites don't need XFO stripping).

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(marketplace): register persist:embed-marketplace session"
```

---

### Task 8: Preload bridge additions

**Files:**
- Modify: `electron/preload.js` — add `getMarketplacePreloadPath` bridge

- [ ] **Step 1: Read electron/preload.js**

Find the `contextBridge.exposeInMainWorld('claw', { ... })` block.

- [ ] **Step 2: Add marketplace bridge**

Inside the `claw` object, add:

```js
getMarketplacePreloadPath: () => ipcRenderer.invoke('marketplace-get-preload-path'),
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.js
git commit -m "feat(marketplace): add preload bridge for marketplace preload path resolution"
```

---

### Task 9: Dashboard tab — sidebar + webview + offline fallback

**Files:**
- Modify: `electron/ui/dashboard.html` — add sidebar item, tab page, webview creation, offline handling

This is the largest UI task. Read the existing patterns first.

- [ ] **Step 1: Read dashboard.html sidebar structure**

Find the `.rail` element and the existing `.rail-item` entries to understand the pattern. Also find `EMBED_PARTITIONS` and `EMBED_URLS` constants, and the `ensureEmbedLoaded` / webview creation function.

- [ ] **Step 2: Add MARKETPLACE to embed constants**

Near the top where `EMBED_PARTITIONS` and `EMBED_URLS` are defined, add:

```js
// In EMBED_PARTITIONS:
'marketplace': 'persist:embed-marketplace'

// In EMBED_URLS:
'marketplace': 'https://marketplace.clawhub.ai/'
```

- [ ] **Step 3: Add sidebar rail item**

In the `.rail` element, after the existing items (before the bottom spacer/settings), add:

```html
<div class="rail-item" data-target="page-marketplace" title="Marketplace">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
    <path d="M9 22V12h6v10"/>
  </svg>
  <span class="rail-label">Marketplace</span>
</div>
```

(Use a store/storefront icon SVG. Exact icon can be refined later.)

- [ ] **Step 4: Add tab page container**

In the tab content area (after the last `<div class="content-tab" id="page-...">` block), add:

```html
<div class="content-tab" id="page-marketplace">
  <div class="embed-wrap" id="embed-wrap-marketplace"></div>
  <div id="marketplace-offline" style="display:none; text-align:center; padding:80px 20px; color:var(--text-secondary);">
    <h3 style="margin-bottom:8px;">Marketplace</h3>
    <p>Marketplace can kết nối internet. Cac goi da cai hoat dong binh thuong offline.</p>
  </div>
</div>
```

Note: Use proper Vietnamese characters (dấu) — "Marketplace cần kết nối internet. Các gói đã cài hoạt động bình thường offline."

- [ ] **Step 5: Add webview creation + offline handling in JS**

In the script section, add the marketplace webview creation function. Follow the existing `ensureEmbedLoaded(name)` pattern but add marketplace-specific logic for the preload and ipc-message handling:

```js
async function ensureMarketplaceLoaded() {
  const wrap = document.getElementById('embed-wrap-marketplace');
  if (wrap.querySelector('webview')) return;

  const preloadPath = await window.claw.getMarketplacePreloadPath();
  const wv = document.createElement('webview');
  wv.id = 'iframe-marketplace';
  wv.setAttribute('partition', EMBED_PARTITIONS['marketplace']);
  wv.setAttribute('preload', 'file://' + preloadPath);
  wv.setAttribute('allowpopups', '');
  wv.src = EMBED_URLS['marketplace'];
  wrap.appendChild(wv);

  wv.addEventListener('did-fail-load', (_e) => {
    wrap.style.display = 'none';
    document.getElementById('marketplace-offline').style.display = 'block';
  });

  wv.addEventListener('did-finish-load', () => {
    wrap.style.display = '';
    document.getElementById('marketplace-offline').style.display = 'none';
  });

  // Handle install requests from webview
  wv.addEventListener('ipc-message', async (event) => {
    if (event.channel === 'marketplace-install') {
      const pkg = event.args[0];
      const result = await window.claw.marketplaceInstall(pkg);
      wv.send('marketplace-install-result', result);
    } else if (event.channel === 'marketplace-uninstall') {
      const packageId = event.args[0];
      const result = await window.claw.marketplaceUninstall(packageId);
      wv.send('marketplace-install-result', result);
    }
  });
}
```

- [ ] **Step 6: Wire tab switch to load marketplace**

In the existing tab-switching logic (the `rail-item` click handler), add a case for `page-marketplace` that calls `ensureMarketplaceLoaded()`, similar to how 9Router and OpenClaw embeds are loaded lazily.

- [ ] **Step 7: Add marketplace IPC bridges to preload.js**

In `electron/preload.js`, add inside the `claw` object:

```js
marketplaceInstall: (pkg) => ipcRenderer.invoke('marketplace-install', pkg),
marketplaceUninstall: (id) => ipcRenderer.invoke('marketplace-uninstall', id),
```

- [ ] **Step 8: Verify manually**

Run: `cd electron && npm start`
- Click Marketplace in sidebar → webview should attempt to load (will show offline fallback if URL not deployed yet)
- Check console for errors

- [ ] **Step 9: Commit**

```bash
git add electron/ui/dashboard.html electron/preload.js
git commit -m "feat(marketplace): add Dashboard tab with webview embed + offline fallback"
```

---

### Task 10: Seed `profiles/` directory in workspace

**Files:**
- Modify: `electron/lib/workspace.js` — add `profiles/` to `seedWorkspace()`

- [ ] **Step 1: Read seedWorkspace() in workspace.js**

Find the function and the list of directories it creates.

- [ ] **Step 2: Add profiles directory creation**

In the directory creation list inside `seedWorkspace()`, add:

```js
path.join(ws, 'profiles')
```

And create `_index.json` if not exists:

```js
const profilesIndex = path.join(ws, 'profiles', '_index.json');
if (!fs.existsSync(profilesIndex)) {
  fs.writeFileSync(profilesIndex, JSON.stringify({ profiles: [], activeProfile: null }, null, 2));
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/workspace.js
git commit -m "feat(marketplace): seed profiles/ directory in workspace"
```

---

## Chunk 3: Build Pipeline + Sample Packages

Scripts for building, signing, and publishing `.clawpkg` packages from the `catalog/` directory. Plus sample content for testing.

### Task 11: catalog-build.js — validate manifests, zip packages, generate catalog.json

**Files:**
- Create: `electron/scripts/catalog-build.js`

- [ ] **Step 1: Create the build script**

```js
// electron/scripts/catalog-build.js
'use strict';
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const { validateManifest } = require('../lib/marketplace-manifest');

const CATALOG_DIR = path.join(__dirname, '..', '..', 'catalog');
const DIST_DIR = path.join(__dirname, '..', '..', 'dist', 'marketplace');

function buildCatalog() {
  if (!fs.existsSync(CATALOG_DIR)) {
    console.error(`catalog/ directory not found at ${CATALOG_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });

  const packages = [];
  for (const type of ['skills', 'agents']) {
    const typeDir = path.join(CATALOG_DIR, type);
    if (!fs.existsSync(typeDir)) continue;

    for (const id of fs.readdirSync(typeDir)) {
      const pkgDir = path.join(typeDir, id);
      if (!fs.statSync(pkgDir).isDirectory()) continue;

      const manifestPath = path.join(pkgDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        console.error(`SKIP ${type}/${id}: no manifest.json`);
        continue;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        console.error(`FAIL ${type}/${id}: ${validation.errors.join(', ')}`);
        process.exit(1);
      }

      // Build zip
      const zip = new AdmZip();
      addDirToZip(zip, pkgDir, '', ['page.mdx', 'screenshots']);
      const zipName = `${manifest.id}-${manifest.version}.clawpkg`;
      const zipPath = path.join(DIST_DIR, zipName);
      zip.writeZip(zipPath);

      const checksum = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');

      packages.push({
        id: manifest.id,
        type: manifest.type,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        category: manifest.category,
        industry: manifest.industry || null,
        author: manifest.author,
        appliesTo: manifest.appliesTo,
        price: manifest.price,
        icon: `/${type}/${id}/icon.png`,
        downloadUrl: `PLACEHOLDER_CDN_URL/${zipName}`,
        checksum
      });

      console.log(`OK ${type}/${id} → ${zipName} (${fs.statSync(zipPath).size} bytes)`);
    }
  }

  const catalog = {
    version: new Date().toISOString().slice(0, 10),
    packages
  };
  const catalogPath = path.join(DIST_DIR, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`\ncatalog.json: ${packages.length} packages → ${catalogPath}`);
}

function addDirToZip(zip, dir, prefix, skip) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirToZip(zip, fullPath, zipPath, skip);
    } else {
      zip.addFile(zipPath, fs.readFileSync(fullPath));
    }
  }
}

buildCatalog();
```

- [ ] **Step 2: Commit**

```bash
git add electron/scripts/catalog-build.js
git commit -m "feat(marketplace): add catalog-build.js — validates + zips packages + generates catalog.json"
```

---

### Task 12: catalog-sign.js — sign built packages

**Files:**
- Create: `electron/scripts/catalog-sign.js`

- [ ] **Step 1: Create the sign script**

```js
// electron/scripts/catalog-sign.js
'use strict';
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { computeContentHash, signPackage } = require('../lib/marketplace-signing');

const DIST_DIR = path.join(__dirname, '..', '..', 'dist', 'marketplace');
const PRIVATE_KEY_PATH = process.env.CLAW_SIGN_KEY || path.join(require('os').homedir(), '.claw-license-private.pem');

function signCatalog() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`Private key not found: ${PRIVATE_KEY_PATH}`);
    console.error('Set CLAW_SIGN_KEY env var or place key at ~/.claw-license-private.pem');
    process.exit(1);
  }
  const privKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');

  const clawpkgs = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.clawpkg'));
  if (clawpkgs.length === 0) {
    console.error('No .clawpkg files found. Run catalog:build first.');
    process.exit(1);
  }

  for (const zipName of clawpkgs) {
    const zipPath = path.join(DIST_DIR, zipName);
    const zip = new AdmZip(zipPath);

    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) { console.error(`SKIP ${zipName}: no manifest.json`); continue; }

    const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));

    const entries = zip.getEntries().filter(e => e.entryName !== 'manifest.json' && !e.isDirectory);
    const files = entries.map(e => ({ path: e.entryName, content: e.getData() }));

    const contentHash = computeContentHash(manifest, files);
    manifest.signature = signPackage(contentHash, privKey);

    // Rewrite zip with signed manifest
    const newZip = new AdmZip();
    newZip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    for (const f of files) newZip.addFile(f.path, f.content);
    newZip.writeZip(zipPath);

    console.log(`SIGNED ${zipName}`);
  }

  // Update catalog.json checksums (zip content changed after signing)
  const catalogPath = path.join(DIST_DIR, 'catalog.json');
  if (fs.existsSync(catalogPath)) {
    const crypto = require('crypto');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    for (const pkg of catalog.packages) {
      const pkgZipName = `${pkg.id}-${pkg.version}.clawpkg`;
      const pkgZipPath = path.join(DIST_DIR, pkgZipName);
      if (fs.existsSync(pkgZipPath)) {
        pkg.checksum = crypto.createHash('sha256').update(fs.readFileSync(pkgZipPath)).digest('hex');
      }
    }
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    console.log('Updated catalog.json checksums');
  }
}

signCatalog();
```

- [ ] **Step 2: Commit**

```bash
git add electron/scripts/catalog-sign.js
git commit -m "feat(marketplace): add catalog-sign.js — signs .clawpkg with Ed25519 key"
```

---

### Task 13: Sample skill package for testing

**Files:**
- Create: `catalog/skills/zalo-auto-reply-faq/manifest.json`
- Create: `catalog/skills/zalo-auto-reply-faq/skill.md`
- Create: `catalog/skills/zalo-auto-reply-faq/page.mdx` (placeholder)

- [ ] **Step 1: Create sample skill**

```json
// catalog/skills/zalo-auto-reply-faq/manifest.json
{
  "id": "zalo-auto-reply-faq",
  "type": "skill",
  "name": "Tu dong tra loi FAQ Zalo",
  "version": "1.0.0",
  "description": "Bot tu nhan dien cau hoi thuong gap va tra loi tu knowledge base",
  "longDescription": "Skill giup bot tu dong nhan dien cac cau hoi thuong gap tren Zalo va tra loi chinh xac dua tren knowledge base da upload. Phu hop cho: nha hang, phong kham, shop online.",
  "category": "customer-service",
  "author": "MODORO",
  "authorType": "modoro",
  "appliesTo": ["zalo"],
  "price": { "type": "included", "vnd": 0 },
  "requires": { "minAppVersion": "2.4.0" },
  "installTarget": "user-skills"
}
```

Note: Use proper Vietnamese dấu in the actual file — "Tự động trả lời FAQ Zalo", "Bot tự nhận diện câu hỏi thường gặp và trả lời từ knowledge base", etc.

```md
<!-- catalog/skills/zalo-auto-reply-faq/skill.md -->
---
name: zalo-auto-reply-faq
description: Tu dong tra loi cau hoi thuong gap tren Zalo tu knowledge base
appliesTo:
  - operations/zalo
trigger: ""
---

Khi khach hoi cau hoi thuong gap (FAQ) tren Zalo:
1. Tim trong knowledge base (folder san-pham va cong-ty) cau tra loi khop nhat
2. Tra loi bang tieng Viet tu nhien, than thien, ngan gon
3. Neu khong tim thay cau tra loi phu hop, tra loi: "De em hoi lai sep va phan hoi anh/chi sau nhe"
4. KHONG bao gio tu tao thong tin — chi dung noi dung tu knowledge base
```

Again, use proper Vietnamese dấu in the actual file.

- [ ] **Step 2: Create placeholder page.mdx**

```mdx
<!-- catalog/skills/zalo-auto-reply-faq/page.mdx -->
# Tu dong tra loi FAQ Zalo

Bot tu dong nhan dien cau hoi thuong gap va tra loi tu knowledge base da upload.

## Tinh nang

- Nhan dien FAQ tu Zalo DM va group
- Tra loi dua tren knowledge base (san pham, cong ty)
- Escalate khi khong co cau tra loi

## Phu hop cho

- Nha hang, quan an
- Phong kham
- Shop online
```

- [ ] **Step 3: Test build pipeline**

```bash
cd electron && node scripts/catalog-build.js
```
Expected: `OK skills/zalo-auto-reply-faq → zalo-auto-reply-faq-1.0.0.clawpkg (N bytes)` + `catalog.json: 1 packages`

- [ ] **Step 4: Commit**

```bash
git add catalog/
git commit -m "feat(marketplace): add sample skill package — zalo-auto-reply-faq"
```

---

### Task 14: Sample agent package for testing

**Files:**
- Create: `catalog/agents/restaurant-bot/manifest.json`
- Create: `catalog/agents/restaurant-bot/workspace/AGENTS.md`
- Create: `catalog/agents/restaurant-bot/workspace/brand.json`
- Create: `catalog/agents/restaurant-bot/page.mdx` (placeholder)

- [ ] **Step 1: Create sample agent**

```json
// catalog/agents/restaurant-bot/manifest.json
{
  "id": "restaurant-bot",
  "type": "agent",
  "name": "Bot Nha hang",
  "version": "1.0.0",
  "description": "Tro ly AI cho nha hang — nhan don, tra loi menu, dat ban",
  "longDescription": "Agent day du cho nha hang: tu dong tra loi khach hoi menu, gia, giờ mo cua. Nhan don qua Zalo va Telegram. Dat ban tu dong.",
  "category": "customer-service",
  "industry": "restaurant",
  "author": "MODORO",
  "authorType": "modoro",
  "appliesTo": ["zalo", "telegram"],
  "price": { "type": "addon", "vnd": 2000000 },
  "requires": { "minAppVersion": "2.4.0" },
  "installTarget": "workspace"
}
```

```md
<!-- catalog/agents/restaurant-bot/workspace/AGENTS.md -->
# Restaurant Bot Agent

Ban la tro ly AI cua nha hang. Nhiem vu chinh:

1. Tra loi khach hoi ve menu, gia ca, gio mo cua
2. Nhan don dat ban qua tin nhan
3. Xac nhan don hang va thong bao cho sep

Phong cach: than thien, chuyen nghiep, ngan gon.
```

```json
// catalog/agents/restaurant-bot/workspace/brand.json
{
  "tone": "than thien, chuyen nghiep",
  "language": "vi",
  "constraints": ["khong bao gio hua giao hang mien phi", "luon hoi lai so luong khi nhan don"]
}
```

Use proper Vietnamese dấu throughout.

- [ ] **Step 2: Test build with both packages**

```bash
cd electron && node scripts/catalog-build.js
```
Expected: 2 packages built + catalog.json with 2 entries.

- [ ] **Step 3: Commit**

```bash
git add catalog/
git commit -m "feat(marketplace): add sample agent package — restaurant-bot"
```

---

### Task 15: Add npm scripts for catalog pipeline

**Files:**
- Modify: `electron/package.json` — add `catalog:build`, `catalog:sign`, `catalog:release` scripts

- [ ] **Step 1: Add scripts**

```json
"catalog:build": "node scripts/catalog-build.js",
"catalog:sign": "node scripts/catalog-sign.js",
"catalog:release": "node scripts/catalog-build.js && node scripts/catalog-sign.js"
```

- [ ] **Step 2: Commit**

```bash
git add electron/package.json
git commit -m "feat(marketplace): add catalog build/sign/release npm scripts"
```

---

### Task 16: End-to-end smoke test

**Files:**
- Create: `electron/scripts/smoke-marketplace-e2e.js`

- [ ] **Step 1: Write E2E smoke test**

This test builds a sample package, signs it with an ephemeral key, then installs it into a temp workspace and verifies the result.

```js
// electron/scripts/smoke-marketplace-e2e.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { computeContentHash, signPackage } = require('../lib/marketplace-signing');
const { extractAndValidate, installSkill, installAgent, activateProfile, deactivateProfile, getInstalledPackages, updateInstalledRegistry, uninstallSkill, uninstallAgent, removeFromInstalledRegistry } = require('../lib/marketplace-installer');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-e2e-'));
const workspace = path.join(tmpDir, 'workspace');
fs.mkdirSync(path.join(workspace, 'user-skills'), { recursive: true });
fs.mkdirSync(path.join(workspace, 'profiles'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'user-skills', '_registry.json'), JSON.stringify({ version: 1, skills: [] }));
fs.writeFileSync(path.join(workspace, 'profiles', '_index.json'), JSON.stringify({ profiles: [], activeProfile: null }));
fs.writeFileSync(path.join(workspace, 'AGENTS.md'), '# Original Agent\nOriginal content.');
fs.writeFileSync(path.join(workspace, 'schedules.json'), JSON.stringify({ schedules: [] }));

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

// === SKILL E2E ===
const skillManifest = {
  id: 'e2e-skill', type: 'skill', name: 'E2E Skill', version: '1.0.0',
  description: 'Test', category: 'custom', author: 'MODORO', authorType: 'modoro',
  appliesTo: ['zalo'], price: { type: 'included', vnd: 0 },
  requires: { minAppVersion: '2.4.0' }, installTarget: 'user-skills'
};
const skillContent = Buffer.from('# E2E Skill Content');
const skillFiles = [{ path: 'skill.md', content: skillContent }];
skillManifest.signature = signPackage(computeContentHash(skillManifest, skillFiles), privPem);

const skillZip = new AdmZip();
skillZip.addFile('manifest.json', Buffer.from(JSON.stringify(skillManifest)));
skillZip.addFile('skill.md', skillContent);
const skillZipPath = path.join(tmpDir, 'e2e-skill.clawpkg');
skillZip.writeZip(skillZipPath);

let r = extractAndValidate(skillZipPath, pubPem, '2.5.0');
assert(r.valid, 'skill package should extract OK');
installSkill(r.extractDir, r.manifest, workspace);
updateInstalledRegistry(r.manifest, workspace);
assert(fs.existsSync(path.join(workspace, 'user-skills', 'e2e-skill', 'skill.md')), 'skill installed');
assert(getInstalledPackages(workspace).packages.length === 1, 'registry has 1 package');

uninstallSkill('e2e-skill', workspace);
removeFromInstalledRegistry('e2e-skill', workspace);
assert(!fs.existsSync(path.join(workspace, 'user-skills', 'e2e-skill')), 'skill uninstalled');
assert(getInstalledPackages(workspace).packages.length === 0, 'registry empty');

// === AGENT E2E ===
const agentManifest = {
  id: 'e2e-agent', type: 'agent', name: 'E2E Agent', version: '1.0.0',
  description: 'Test', category: 'custom', industry: 'restaurant', author: 'MODORO',
  authorType: 'modoro', appliesTo: ['zalo', 'telegram'],
  price: { type: 'addon', vnd: 1000000 },
  requires: { minAppVersion: '2.4.0' }, installTarget: 'workspace'
};
const agentsContent = Buffer.from('# E2E Agent\nNew personality.');
const brandContent = Buffer.from(JSON.stringify({ tone: 'friendly', language: 'vi', constraints: [] }));
const agentFiles = [
  { path: 'workspace/AGENTS.md', content: agentsContent },
  { path: 'workspace/brand.json', content: brandContent }
];
agentManifest.signature = signPackage(computeContentHash(agentManifest, agentFiles), privPem);

const agentZip = new AdmZip();
agentZip.addFile('manifest.json', Buffer.from(JSON.stringify(agentManifest)));
agentZip.addFile('workspace/AGENTS.md', agentsContent);
agentZip.addFile('workspace/brand.json', brandContent);
const agentZipPath = path.join(tmpDir, 'e2e-agent.clawpkg');
agentZip.writeZip(agentZipPath);

r = extractAndValidate(agentZipPath, pubPem, '2.5.0');
assert(r.valid, 'agent package should extract OK');
const { installAgent: instAgent } = require('../lib/marketplace-installer');
instAgent(r.extractDir, r.manifest, workspace);
updateInstalledRegistry(r.manifest, workspace);
assert(fs.existsSync(path.join(workspace, 'profiles', 'e2e-agent', 'AGENTS.md')), 'agent profile created');

// Activate
let ar = activateProfile('e2e-agent', workspace);
assert(ar.success, 'activation should succeed');
assert(fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf-8').includes('E2E Agent'), 'AGENTS.md replaced');
assert(fs.existsSync(path.join(workspace, 'AGENTS.md.backup')), 'backup created');

// Deactivate
ar = deactivateProfile('e2e-agent', workspace);
assert(ar.success, 'deactivation should succeed');
assert(fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf-8').includes('Original'), 'AGENTS.md restored');
assert(!fs.existsSync(path.join(workspace, 'AGENTS.md.backup')), 'backup cleaned');

// Uninstall
uninstallAgent('e2e-agent', workspace);
removeFromInstalledRegistry('e2e-agent', workspace);
assert(!fs.existsSync(path.join(workspace, 'profiles', 'e2e-agent')), 'agent profile removed');

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`e2e: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run E2E smoke**

```bash
cd electron && node scripts/smoke-marketplace-e2e.js
```
Expected: `e2e: 12 passed, 0 failed`

- [ ] **Step 3: Add to smoke suite**

In `electron/package.json`, append `&& node scripts/smoke-marketplace-e2e.js` to the `smoke` script.

- [ ] **Step 4: Commit**

```bash
git add electron/scripts/smoke-marketplace-e2e.js electron/package.json
git commit -m "feat(marketplace): add E2E smoke test — full install/activate/deactivate/uninstall cycle"
```

---

## Chunk 4: Web Catalog (Next.js — separate project)

This chunk creates the Next.js SSG web catalog as a standalone project in `marketplace-web/`. This is an independent deliverable — the Electron side works without it (local .clawpkg install still functions). The web catalog provides the browsing/discovery UI.

**Note:** This chunk can be implemented in parallel with Chunks 1-3 by a separate developer.

### Task 17: Scaffold Next.js project

**Files:**
- Create: `marketplace-web/` (new directory at repo root)

- [ ] **Step 1: Create Next.js project**

```bash
cd c:\Users\buitu\Desktop\claw
npx create-next-app@latest marketplace-web --typescript --tailwind --app --src-dir --no-import-alias --eslint
```

When prompted, accept defaults.

- [ ] **Step 2: Install dependencies**

```bash
cd marketplace-web && npm install @next/mdx @mdx-js/loader @mdx-js/react fuse.js
```

- [ ] **Step 3: Configure MDX in next.config.ts**

Update `marketplace-web/next.config.ts`:
```ts
import createMDX from '@next/mdx';

const withMDX = createMDX({});

const nextConfig = {
  output: 'export',
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
};

export default withMDX(nextConfig);
```

- [ ] **Step 4: Commit**

```bash
git add marketplace-web/
git commit -m "feat(marketplace-web): scaffold Next.js 15 project with Tailwind + MDX"
```

---

### Task 18: Shared types + catalog loader

**Files:**
- Create: `marketplace-web/src/lib/types.ts`
- Create: `marketplace-web/src/lib/catalog.ts`

- [ ] **Step 1: Define types**

```ts
// marketplace-web/src/lib/types.ts
export interface PackageManifest {
  id: string;
  type: 'skill' | 'agent';
  name: string;
  version: string;
  description: string;
  longDescription?: string;
  category: string;
  industry?: string;
  author: string;
  authorType: 'modoro' | 'partner';
  appliesTo: ('zalo' | 'telegram')[];
  price: { type: 'included' | 'addon'; vnd: number };
  requires: { minAppVersion: string; dependencies?: string[] };
  installTarget: string;
  icon?: string;
  downloadUrl?: string;
  checksum?: string;
}

export interface CatalogIndex {
  version: string;
  packages: PackageManifest[];
}
```

- [ ] **Step 2: Create catalog loader (reads from local catalog/ dir at build time)**

```ts
// marketplace-web/src/lib/catalog.ts
import fs from 'fs';
import path from 'path';
import type { PackageManifest, CatalogIndex } from './types';

const CATALOG_ROOT = path.join(process.cwd(), '..', 'catalog');

export function loadCatalog(): CatalogIndex {
  const packages: PackageManifest[] = [];

  for (const type of ['skills', 'agents'] as const) {
    const typeDir = path.join(CATALOG_ROOT, type);
    if (!fs.existsSync(typeDir)) continue;

    for (const id of fs.readdirSync(typeDir)) {
      const pkgDir = path.join(typeDir, id);
      const manifestPath = path.join(pkgDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const manifest: PackageManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.icon = `/${type}/${id}/icon.png`;
      packages.push(manifest);
    }
  }

  return { version: new Date().toISOString().slice(0, 10), packages };
}

export function loadPackageById(type: 'skills' | 'agents', id: string): PackageManifest | null {
  const manifestPath = path.join(CATALOG_ROOT, type, id, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}
```

- [ ] **Step 3: Commit**

```bash
git add marketplace-web/src/lib/
git commit -m "feat(marketplace-web): add types + catalog loader"
```

---

### Task 19: Landing page

**Files:**
- Modify: `marketplace-web/src/app/page.tsx`
- Create: `marketplace-web/src/components/PackageCard.tsx`

- [ ] **Step 1: Create PackageCard component**

```tsx
// marketplace-web/src/components/PackageCard.tsx
import Link from 'next/link';
import type { PackageManifest } from '@/lib/types';

export function PackageCard({ pkg }: { pkg: PackageManifest }) {
  const href = `/${pkg.type === 'skill' ? 'skills' : 'agents'}/${pkg.id}`;
  return (
    <Link href={href} className="block border border-neutral-200 rounded-lg p-5 hover:border-neutral-400 transition-colors bg-white">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-neutral-100 rounded-lg flex-shrink-0" />
        <div className="min-w-0">
          <h3 className="font-medium text-neutral-900 text-sm">{pkg.name}</h3>
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{pkg.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs px-2 py-0.5 bg-neutral-100 rounded text-neutral-600">{pkg.category}</span>
        {pkg.price.type === 'addon' && (
          <span className="text-xs text-neutral-500">{pkg.price.vnd.toLocaleString('vi-VN')} VND</span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Update landing page**

```tsx
// marketplace-web/src/app/page.tsx
import { loadCatalog } from '@/lib/catalog';
import { PackageCard } from '@/components/PackageCard';

export default function Home() {
  const catalog = loadCatalog();
  const skills = catalog.packages.filter(p => p.type === 'skill');
  const agents = catalog.packages.filter(p => p.type === 'agent');

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-neutral-900">Marketplace</h1>
      <p className="text-neutral-500 mt-2 text-sm">Skills va agents cho 9BizClaw</p>

      {agents.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-neutral-800 mb-4">Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(a => <PackageCard key={a.id} pkg={a} />)}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-neutral-800 mb-4">Skills</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skills.map(s => <PackageCard key={s.id} pkg={s} />)}
          </div>
        </section>
      )}
    </main>
  );
}
```

Use proper Vietnamese dấu ("Skills và agents cho 9BizClaw").

- [ ] **Step 3: Verify dev server**

```bash
cd marketplace-web && npm run dev
```
Open `http://localhost:3000` → should see landing page with sample packages listed.

- [ ] **Step 4: Commit**

```bash
git add marketplace-web/src/
git commit -m "feat(marketplace-web): add landing page + PackageCard component"
```

---

### Task 20: Skill and Agent browse pages

**Files:**
- Create: `marketplace-web/src/app/skills/page.tsx`
- Create: `marketplace-web/src/app/agents/page.tsx`

- [ ] **Step 1: Skills browse page**

```tsx
// marketplace-web/src/app/skills/page.tsx
import { loadCatalog } from '@/lib/catalog';
import { PackageCard } from '@/components/PackageCard';

export default function SkillsPage() {
  const catalog = loadCatalog();
  const skills = catalog.packages.filter(p => p.type === 'skill');

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-neutral-900">Skills</h1>
      <p className="text-neutral-500 mt-2 text-sm">{skills.length} skills</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        {skills.map(s => <PackageCard key={s.id} pkg={s} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Agents browse page**

```tsx
// marketplace-web/src/app/agents/page.tsx
import { loadCatalog } from '@/lib/catalog';
import { PackageCard } from '@/components/PackageCard';

export default function AgentsPage() {
  const catalog = loadCatalog();
  const agents = catalog.packages.filter(p => p.type === 'agent');

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-neutral-900">Agents</h1>
      <p className="text-neutral-500 mt-2 text-sm">{agents.length} agents</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        {agents.map(a => <PackageCard key={a.id} pkg={a} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add marketplace-web/src/app/skills/ marketplace-web/src/app/agents/
git commit -m "feat(marketplace-web): add skills + agents browse pages"
```

---

### Task 21: Detail pages with install button

**Files:**
- Create: `marketplace-web/src/app/skills/[id]/page.tsx`
- Create: `marketplace-web/src/app/agents/[id]/page.tsx`
- Create: `marketplace-web/src/components/InstallButton.tsx`

- [ ] **Step 1: Create InstallButton client component**

```tsx
// marketplace-web/src/components/InstallButton.tsx
'use client';
import { useState } from 'react';
import type { PackageManifest } from '@/lib/types';

declare global {
  interface Window {
    __claw_bridge?: {
      getInstalledPackages: () => Promise<{ packages: { id: string; version: string }[] }>;
      requestInstall: (pkg: { packageId: string; packageType: string; version: string; downloadUrl: string }) => void;
      onInstallResult: (cb: (result: { success: boolean; error?: string }) => void) => () => void;
    };
  }
}

export function InstallButton({ pkg }: { pkg: PackageManifest }) {
  const [status, setStatus] = useState<'idle' | 'installing' | 'installed' | 'error'>('idle');
  const [error, setError] = useState('');

  const inApp = typeof window !== 'undefined' && !!window.__claw_bridge;

  async function handleInstall() {
    if (!window.__claw_bridge) return;
    setStatus('installing');
    const unsub = window.__claw_bridge.onInstallResult((result) => {
      if (result.success) setStatus('installed');
      else { setStatus('error'); setError(result.error || 'Unknown error'); }
      unsub();
    });
    window.__claw_bridge.requestInstall({
      packageId: pkg.id,
      packageType: pkg.type,
      version: pkg.version,
      downloadUrl: pkg.downloadUrl || ''
    });
  }

  if (!inApp) {
    return (
      <div className="mt-6 p-4 bg-neutral-50 rounded-lg text-sm text-neutral-600">
        Mo 9BizClaw de cai dat package nay.
      </div>
    );
  }

  return (
    <div className="mt-6">
      {status === 'idle' && (
        <button onClick={handleInstall} className="px-4 py-2 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-800 transition-colors">
          Cai dat
        </button>
      )}
      {status === 'installing' && <p className="text-sm text-neutral-500">Dang cai dat...</p>}
      {status === 'installed' && <p className="text-sm text-green-600">Da cai dat</p>}
      {status === 'error' && <p className="text-sm text-red-600">Loi: {error}</p>}
    </div>
  );
}
```

Use proper Vietnamese dấu.

- [ ] **Step 2: Skill detail page**

```tsx
// marketplace-web/src/app/skills/[id]/page.tsx
import { loadCatalog, loadPackageById } from '@/lib/catalog';
import { InstallButton } from '@/components/InstallButton';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  const catalog = loadCatalog();
  return catalog.packages.filter(p => p.type === 'skill').map(p => ({ id: p.id }));
}

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = loadPackageById('skills', id);
  if (!pkg) notFound();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-neutral-900">{pkg.name}</h1>
      <p className="text-neutral-500 mt-2">{pkg.description}</p>
      <div className="flex gap-2 mt-4">
        <span className="text-xs px-2 py-1 bg-neutral-100 rounded">{pkg.category}</span>
        {pkg.appliesTo.map(ch => (
          <span key={ch} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">{ch}</span>
        ))}
      </div>
      {pkg.price.type === 'addon' && (
        <p className="mt-4 text-sm font-medium">{pkg.price.vnd.toLocaleString('vi-VN')} VND</p>
      )}
      <InstallButton pkg={pkg} />
      {pkg.longDescription && (
        <div className="mt-8 prose prose-neutral prose-sm">{pkg.longDescription}</div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Agent detail page (same pattern)**

```tsx
// marketplace-web/src/app/agents/[id]/page.tsx
import { loadCatalog, loadPackageById } from '@/lib/catalog';
import { InstallButton } from '@/components/InstallButton';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  const catalog = loadCatalog();
  return catalog.packages.filter(p => p.type === 'agent').map(p => ({ id: p.id }));
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = loadPackageById('agents', id);
  if (!pkg) notFound();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-neutral-900">{pkg.name}</h1>
      <p className="text-neutral-500 mt-2">{pkg.description}</p>
      <div className="flex gap-2 mt-4">
        <span className="text-xs px-2 py-1 bg-neutral-100 rounded">{pkg.category}</span>
        {pkg.industry && <span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded">{pkg.industry}</span>}
        {pkg.appliesTo.map(ch => (
          <span key={ch} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">{ch}</span>
        ))}
      </div>
      {pkg.price.type === 'addon' && (
        <p className="mt-4 text-sm font-medium">{pkg.price.vnd.toLocaleString('vi-VN')} VND</p>
      )}
      <InstallButton pkg={pkg} />
      {pkg.longDescription && (
        <div className="mt-8 prose prose-neutral prose-sm">{pkg.longDescription}</div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify**

```bash
cd marketplace-web && npm run dev
```
Open `http://localhost:3000/skills/zalo-auto-reply-faq` → detail page should render. Install button shows "Mo 9BizClaw de cai dat" (since not in webview).

- [ ] **Step 5: Commit**

```bash
git add marketplace-web/src/
git commit -m "feat(marketplace-web): add detail pages with install button + client bridge"
```

---

### Task 22: Static export verification

- [ ] **Step 1: Build static export**

```bash
cd marketplace-web && npm run build
```
Expected: `Export successful` with pages generated in `out/`.

- [ ] **Step 2: Verify output**

```bash
ls marketplace-web/out/
```
Should contain: `index.html`, `skills/`, `agents/`, `skills/zalo-auto-reply-faq/`, `agents/restaurant-bot/`.

- [ ] **Step 3: Commit any build config fixes**

If build failed, fix `next.config.ts` and retry. Then commit.

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Install Engine Core | 1-4 | Manifest validation, Ed25519 signing, download/extract/install engine |
| 2: App Integration | 5-10 | Dashboard tab, IPC handlers, webview preload, offline fallback |
| 3: Build Pipeline | 11-16 | catalog-build, catalog-sign, sample packages, E2E smoke test |
| 4: Web Catalog | 17-22 | Next.js SSG site with browse + detail + install button |

**Parallelism:** Chunks 1-3 (Electron) and Chunk 4 (Web) are fully independent and can be built in parallel.

**After completion:** Deploy `marketplace-web` to Vercel, update `EMBED_URLS.marketplace` in `dashboard.html` with the real URL, and replace `PLACEHOLDER_CDN_URL` in `catalog-build.js` with the actual CDN endpoint.
