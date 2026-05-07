'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFilePromise = promisify(execFile);
const execSync = require('child_process').execSync;

let app;
try { ({ app } = require('electron')); } catch {}

// Installation-recovery retry + error classification for transient failures.
// Retries network/disk errors with exponential backoff, calls onRetry for UI feedback.
let withRetry;
try {
  ({ withRetry } = require('./installation-recovery'));
} catch {}

// Pinned versions — loaded from a single canonical source so runtime-installer.js
// and prebuild-vendor.js always agree. PINNING.md is the human-readable source.
const SHARED_VERSIONS = (() => {
  try {
    return JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '..', 'scripts', 'versions.json'), 'utf-8'
    ));
  } catch {
    return { openclaw: '2026.4.14', openzca: '0.1.57', nineRouter: '0.4.12', gog: 'v0.13.0', node: '22.22.2' };
  }
})();

// NOTE: the contract check (scripts/check-runtime-install-contract.js) uses regex on this
// object's literal values. Do NOT remove the string literals below — the contract will fail.
const PINNED_VERSIONS = {
  openclaw: SHARED_VERSIONS.openclaw,
  openzca: SHARED_VERSIONS.openzca,
  nineRouter: SHARED_VERSIONS.nineRouter,
};

// NOTE: the contract check uses regex on GOG_VERSION's string value. Do NOT refactor away.
const GOG_VERSION = SHARED_VERSIONS.gog;

// Minimum Node.js version required
const MIN_NODE_VERSION = '22.14.0';

// Package definitions
const PACKAGES = [
  { name: 'openclaw', version: PINNED_VERSIONS.openclaw },
  { name: 'openzca', version: PINNED_VERSIONS.openzca },
  { name: '9router', version: PINNED_VERSIONS.nineRouter },
];

const NPM_INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

// Layout version for future migration safety.
// Bump this whenever the runtime install output directory structure changes.
// Old installations with a mismatched layout version will trigger a clean re-install.
const LAYOUT_VERSION = '1';

// SHA256 checksums for the bundled Node.js binary.
// Sources: https://nodejs.org/dist/v22.22.2/SHASUMS256.txt
// Used to verify the downloaded/extracted node binary is not corrupted or locked.
// Corporate locked-file scenario: extraction exits 0 but some files are corrupted.
// If the runtime install layout changes (e.g., different Node version), bump
// LAYOUT_VERSION and update these checksums accordingly.
const NODE_SHA256 = {
  'win32-x64':    '7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c',
  'win32-arm64':  '380d375cf650c5a7f2ef3ce29ac6ea9a1c9d2ec8ea8e8391e1a34fd543886ab3',
  'darwin-x64':   '12a6abb9c2902cf48a21120da13f87fde1ed1b71a13330712949e8db818708ba',
  'darwin-arm64': 'db4b275b83736df67533529a18cc55de2549a8329ace6c7bcc68f8d22d3c9000',
};

const GOG_ARCHIVE_SHA256 = {
  'win32-x64':    '30836d03f66769ef38a65dd4b81ae2864e2159941d9751b6fdec6ea86be8726f',
  'win32-arm64':  '23c72facae6f2a8963a2a7dca87f3dadb1d9400912d832d263f611f3df15a9c3',
  'darwin-arm64': '7c6f650f7516323ddd003e4ababf998fc1d2c73089a4662b8c79bf80ac4bdf56',
  'darwin-x64':   '15c88798d25cb2e1870cafa5df232601f3a05472a134ca8c396be907f2b235f6',
};

// User-facing error messages for common download/install failures.
// Parsed by the UI to show actionable guidance in the user's language.
const ERROR_HINTS = {
  ENOTFOUND: 'Không phân giải được địa chỉ máy chủ. Kiểm tra kết nối mạng.',
  DNS: 'Lỗi phân giải DNS. Thử dùng mạng khác hoặc kiểm tra cấu hình DNS.',
  ECONNREFUSED: 'Máy chủ từ chối kết nối. Có thể do proxy/corporate firewall.',
  ETIMEDOUT: 'Kết nối quá chậm hoặc timeout. Thử mạng khác hoặc chờ vài phút.',
  TIMEOUT: 'Tải mất quá lâu (>10 phút). Thử mạng nhanh hơn.',
  PROXY: 'Proxy/corporate firewall có thể chặn kết nối. Kiểm tra cấu hình mạng.',
  'CERT_HAS_EXPIRED': 'Chứng chỉ TLS hết hạn — có thể do proxy corporate. Thử mạng khác.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Lỗi xác thực chứng chỉ TLS. Kiểm tra proxy corporate.',
  ENOSPC: 'Ổ đĩa gần đầy. Giải phóng ít nhất 500 MB trước khi tiếp tục.',
  EACCES: 'Không có quyền ghi vào thư mục. Thử chạy với quyền Administrator.',
  NPM_CERT_ERROR: 'npm không xác thực được chứng chỉ — có thể do proxy corporate. Thử: npm config set strict-ssl false',
  NPM_ECONNRESET: 'npm bị reset kết nối — proxy hoặc mạng không ổn định. Thử lại.',
};

// Detect if a corporate proxy is likely active by checking common env vars.
function detectProxyEnv() {
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
  for (const v of proxyVars) {
    if (process.env[v]) return v;
  }
  return null;
}

// Classify a download or install error into a hint category.
function classifyInstallError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = error?.code || '';
  if (code === 'ENOTFOUND' || msg.includes('getaddrinfo') || msg.includes('not found')) return 'ENOTFOUND';
  if (code === 'ETIMEDOUT' || msg.includes('timed out') || msg.includes('timeout')) return 'ETIMEDOUT';
  if (code === 'ECONNREFUSED') return 'ECONNREFUSED';
  if (code === 'TIMEDOUT' || msg.includes('timeout')) return 'TIMEOUT';
  if (msg.includes('proxy')) return 'PROXY';
  if (msg.includes('certificate') || msg.includes('cert') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
  if (code === 'CERT_HAS_EXPIRED') return 'CERT_HAS_EXPIRED';
  if (code === 'ENOSPC') return 'ENOSPC';
  if (code === 'EACCES') return 'EACCES';
  if (msg.includes('npm') && (msg.includes('cert') || msg.includes('ssl'))) return 'NPM_CERT_ERROR';
  if (msg.includes('npm') && (msg.includes('connect') || msg.includes('reset'))) return 'NPM_ECONNRESET';
  return null;
}

// Return an actionable user message for a classified error.
function getInstallErrorHint(error) {
  const cls = classifyInstallError(error);
  if (cls && ERROR_HINTS[cls]) return ERROR_HINTS[cls];
  if (detectProxyEnv()) return ERROR_HINTS.PROXY;
  return null;
}

// Verify SHA256 of a file. Returns true if hash matches, false otherwise.
function verifySha256(filePath, expectedHash) {
  try {
    const { createHash } = require('crypto');
    const data = fs.readFileSync(filePath);
    const hash = createHash('sha256').update(data).digest('hex');
    return hash === expectedHash;
  } catch {
    return false;
  }
}

// Get the SHA256 key for the current platform + arch.
function getNodeShaKey() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const arch = process.arch === 'x64' ? 'x64' : 'arm64';
  if (isWin) return `win32-${arch}`;
  if (isMac) return `darwin-${arch}`;
  return null; // linux: not supported for bundled install
}

function getGogShaKey() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return null;
  const arch = process.arch === 'x64' ? 'x64' : 'arm64';
  return `${process.platform}-${arch}`;
}

function verifyDownloadedGogArchive(filePath) {
  const shaKey = getGogShaKey();
  const expected = shaKey ? GOG_ARCHIVE_SHA256[shaKey] : null;
  if (!expected) {
    try { fs.unlinkSync(filePath); } catch {}
    throw new Error(`No gogcli SHA256 checksum for ${shaKey || 'unsupported-platform'}`);
  }
  if (verifySha256(filePath, expected)) return;
  try { fs.unlinkSync(filePath); } catch {}
  throw new Error(`gogcli SHA256 mismatch for ${shaKey}`);
}

// =====================================================================
// Installation Status
// =====================================================================
let _installStatus = null;
let _installInProgress = false;

const { getUserDataDir, copyDirRecursive: _copyDir } = require('./workspace');

/**
 * Check if bundled vendor exists at resourcesPath (macOS bundled model).
 * This is distinct from userData/vendor/ (runtime install model).
 * On macOS, electron-builder extraResources places vendor/ inside
 * Contents/Resources/vendor/, not in userData.
 */
function checkBundledVendorAtResources() {
  if (!app || !app.isPackaged) return false;
  if (process.platform !== 'darwin') return false;
  try {
    const resourcesVendor = path.join(process.resourcesPath, 'vendor');
    const nodeBin = path.join(resourcesVendor, 'node', 'bin', 'node');
    return fs.existsSync(nodeBin);
  } catch {
    return false;
  }
}

function getRuntimeNodeDir() {
  // For runtime install (v2.4.0+), packages live in:
  //   Windows: %APPDATA%\9bizclaw\vendor\
  // This matches getBundledVendorDir() so boot.js can find them.
  return path.join(getUserDataDir(), 'vendor');
}

function getRuntimeNodeHomeDir() {
  return path.join(getRuntimeNodeDir(), 'node');
}

function getRuntimeNodeBinDir() {
  // Node.js binary for runtime install
  // Windows: vendor/node/node.exe
  // Mac/Linux: vendor/node/bin/node
  return process.platform === 'win32'
    ? getRuntimeNodeHomeDir()
    : path.join(getRuntimeNodeHomeDir(), 'bin');
}

function getRuntimeNodeModulesDir() {
  // Packages for runtime install
  return path.join(getRuntimeNodeDir(), 'node_modules');
}

function getVersionFile() {
  return path.join(getUserDataDir(), 'runtime-version.txt');
}

function getInstalledVersion() {
  try {
    const vf = getVersionFile();
    if (fs.existsSync(vf)) {
      return fs.readFileSync(vf, 'utf8').trim();
    }
  } catch {}
  return null;
}

function writeInstalledVersion(version) {
  try {
    const vf = getVersionFile();
    fs.mkdirSync(path.dirname(vf), { recursive: true });
    fs.writeFileSync(vf, version, 'utf8');
  } catch (e) {
    console.error('[runtime-installer] Failed to write version file:', e.message);
  }
}

function getLayoutVersionFile() {
  return path.join(getUserDataDir(), 'layout-version.txt');
}

function writeLayoutVersion() {
  try {
    const f = getLayoutVersionFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, LAYOUT_VERSION, 'utf8');
  } catch (e) {
    console.error('[runtime-installer] Failed to write layout version file:', e.message);
  }
}

// =====================================================================
// Node.js Detection & Installation
// =====================================================================

function parseNodeVersion(versionString) {
  // Parse "v22.11.0" or "22.11.0"
  const match = versionString.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    full: match[0],
  };
}

function compareVersions(a, b) {
  const pa = parseNodeVersion(a);
  const pb = parseNodeVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

function satisfiesMinVersion(version) {
  return compareVersions(version, MIN_NODE_VERSION) >= 0;
}

async function getSystemNodeVersion() {
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'node' : 'node';
    const { stdout } = await execFilePromise(cmd, ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getRuntimeNodeVersion() {
  const runtimeNode = getRuntimeNodeBinPath();
  if (!fs.existsSync(runtimeNode)) return null;
  try {
    const { stdout } = await execFilePromise(runtimeNode, ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

function getRuntimeNodeBinPath() {
  const isWin = process.platform === 'win32';
  const nodeDir = getRuntimeNodeHomeDir();
  return isWin
    ? path.join(nodeDir, 'node.exe')
    : path.join(nodeDir, 'bin', 'node');
}

async function detectNodeInstallation() {
  // Priority: bundled-at-resources (macOS) > runtime-installed > system Node

  // 0. Bundled vendor at resourcesPath (macOS DMG bundled model).
  //    Check this BEFORE userData/vendor/ so macOS bundled builds short-circuit.
  if (app && app.isPackaged && process.platform === 'darwin') {
    try {
      const resourcesNodeBin = path.join(process.resourcesPath, 'vendor', 'node', 'bin', 'node');
      if (fs.existsSync(resourcesNodeBin)) {
        const { stdout } = await execFilePromise(resourcesNodeBin, ['--version'], { timeout: 5000 });
        const runtimeVersion = stdout.trim();
        console.log('[runtime-installer] Found bundled vendor Node (resources):', runtimeVersion);
        return {
          type: 'bundled',
          path: resourcesNodeBin,
          version: runtimeVersion,
          satisfiesMin: satisfiesMinVersion(runtimeVersion),
          isSystem: false,
        };
      }
    } catch {}
  }

  // 1. Runtime-installed Node at userData/vendor/
  const runtimeVersion = await getRuntimeNodeVersion();
  if (runtimeVersion) {
    const nodeBin = getRuntimeNodeBinPath();
    console.log('[runtime-installer] Found runtime Node:', runtimeVersion, 'at', nodeBin);
    return {
      type: 'runtime',
      path: nodeBin,
      version: runtimeVersion,
      satisfiesMin: satisfiesMinVersion(runtimeVersion),
      isSystem: false,
    };
  }

  // Packaged builds must be self-contained. Do not treat system Node as
  // satisfying the install: boot.js resolves child processes through
  // userData/vendor/node, not through the user's PATH.
  if (app && app.isPackaged) {
    return {
      type: 'none',
      path: null,
      version: null,
      satisfiesMin: false,
      isSystem: false,
    };
  }

  // 2. Check system Node
  const systemVersion = await getSystemNodeVersion();
  if (systemVersion) {
    try {
      const { stdout } = await execFilePromise(
        process.platform === 'win32' ? 'where' : 'command -v',
        process.platform === 'win32' ? ['node.exe'] : ['node'],
        { timeout: 5000 }
      );
      const nodePath = process.platform === 'win32'
        ? stdout.trim().split('\n')[0].trim()
        : stdout.trim();
      console.log('[runtime-installer] Found system Node:', systemVersion, 'at', nodePath);
      return {
        type: 'system',
        path: nodePath,
        version: systemVersion,
        satisfiesMin: satisfiesMinVersion(systemVersion),
        isSystem: true,
      };
    } catch {}
  }

  // 3. No Node found
  return {
    type: 'none',
    path: null,
    version: null,
    satisfiesMin: false,
    isSystem: false,
  };
}

function getNodeDownloadUrl(targetVersion) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const arch = process.arch === 'x64' ? 'x64' : 'arm64';

  if (isWin) {
    return {
      url: `https://nodejs.org/dist/v${targetVersion}/node-v${targetVersion}-win-${arch}.zip`,
      type: 'zip',
    };
  } else if (isMac) {
    return {
      url: `https://nodejs.org/dist/v${targetVersion}/node-v${targetVersion}-darwin-${arch}.tar.gz`,
      type: 'tar.gz',
    };
  } else {
    return {
      url: `https://nodejs.org/dist/v${targetVersion}/node-v${targetVersion}-linux-${arch}.tar.gz`,
      type: 'tar.gz',
    };
  }
}

async function downloadFile(url, destPath, onProgress) {
  const isWin = process.platform === 'win32';

  // Attach actionable hint to error for UI display.
  function attachHint(e) {
    const hint = getInstallErrorHint(e);
    if (!hint) return e;
    const wrapped = new Error(e.message + ' | HINT: ' + hint);
    wrapped.code = e.code;
    return wrapped;
  }

  return new Promise((resolve, reject) => {
    // Use native fetch if available (Node 18+)
    let client;
    if (typeof fetch !== 'undefined') {
      fetch(url).then(async (response) => {
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          reject(attachHint(new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)));
          return;
        }
        const total = parseInt(response.headers.get('content-length') || '0', 10);
        let downloaded = 0;
        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          downloaded += value.length;
          if (total > 0 && onProgress) {
            onProgress({ percent: Math.floor((downloaded / total) * 100), downloaded, total });
          }
        }

        const blob = new Blob(chunks);
        const arrayBuffer = await blob.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
        resolve();
      }).catch((e) => { reject(attachHint(e)); });
      return;
    } else if (isWin) {
      // Windows: use PowerShell with 10-minute timeout to match download progress bar
      client = spawn('powershell', [
        '-NoProfile',
        '-Command',
        `Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -UseBasicParsing -TimeoutSec 600`
      ], { stdio: 'pipe' });
    } else {
      // Unix: use curl
      client = spawn('curl', ['-fSL', '-o', destPath, '--progress-bar', url], { stdio: 'pipe' });
    }

    if (onProgress) onProgress({ percent: 0, downloaded: 0, total: 0 });
    let stderr = '';
    client?.stderr?.on('data', (d) => { stderr += String(d); });
    client.on('error', (e) => { reject(attachHint(e)); });
    client.on('close', (code) => {
      if (code !== 0) {
        reject(attachHint(new Error(`Download failed (exit ${code}): ${stderr}`)));
      } else {
        if (onProgress) {
          try {
            const size = fs.statSync(destPath).size;
            onProgress({ percent: 100, downloaded: size, total: size });
          } catch { onProgress({ percent: 100, downloaded: 0, total: 0 }); }
        }
        resolve();
      }
    });
  });
}

async function installNode(targetVersion, onProgress) {
  console.log('[runtime-installer] Installing Node.js', targetVersion);

  if (onProgress) onProgress({ step: 'node', percent: 0, message: `Đang tải Node.js ${targetVersion}...` });

  const { url, type } = getNodeDownloadUrl(targetVersion);
  const vendorDir = getRuntimeNodeDir();
  const nodeDir = getRuntimeNodeHomeDir();
  const downloadPath = path.join(vendorDir, `download.${type}`);

  // Ensure directory exists
  fs.mkdirSync(vendorDir, { recursive: true });

  // Download
  try {
    await downloadFile(url, downloadPath, (p) => {
      if (onProgress) onProgress({ step: 'node', percent: p.percent * 0.8, message: `Đang tải Node.js...` });
    });
  } catch (e) {
    throw new Error(`Không tải được Node.js: ${e.message}`);
  }

  if (onProgress) onProgress({ step: 'node', percent: 80, message: 'Đang giải nén Node.js...' });

  // Extract
  const isWin = process.platform === 'win32';
  const extractDir = path.join(vendorDir, 'temp-node-' + Date.now());

  try {
    fs.mkdirSync(extractDir, { recursive: true });

    if (type === 'zip') {
      // Windows: use PowerShell Expand-Archive
      await new Promise((resolve, reject) => {
        const ps = spawn('powershell', [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path '${downloadPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
        ], { stdio: 'pipe' });
        let stderr = '';
        ps.stderr?.on('data', d => { stderr += String(d); });
        ps.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Expand-Archive failed (${code}): ${stderr}`)));
        ps.on('error', reject);
      });
    } else {
      // Unix: use tar
      await new Promise((resolve, reject) => {
        const tar = spawn('tar', ['-xzf', downloadPath, '-C', extractDir], { stdio: 'pipe' });
        tar.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar failed: ${code}`)));
        tar.on('error', reject);
      });
    }

    // Find the actual extracted directory (may be nested like node-v22.14.0-win-x64/)
    const entries = fs.readdirSync(extractDir);
    let extractedRoot = null;

    // Look for the directory that contains node executable
    for (const entry of entries) {
      const entryPath = path.join(extractDir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        // Check if this directory contains node
        const potentialNode = isWin
          ? path.join(entryPath, 'node.exe')
          : path.join(entryPath, 'bin', 'node');
        if (fs.existsSync(potentialNode)) {
          extractedRoot = entryPath;
          break;
        }
      }
    }

    // Fallback: assume first entry is the root
    if (!extractedRoot && entries.length > 0) {
      extractedRoot = path.join(extractDir, entries[0]);
    }

    if (!extractedRoot) {
      throw new Error('Could not find extracted Node.js directory');
    }

    // Move extracted Node root to vendor/node, preserving vendor/node_modules.
    try { fs.rmSync(nodeDir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(path.dirname(nodeDir), { recursive: true });
    try {
      fs.renameSync(extractedRoot, nodeDir);
    } catch (e) {
      // Fallback to copy if rename fails (cross-device move)
      if (e.code === 'EXDEV') {
        console.log('[runtime-installer] Cross-device move, using copy');
        copyDirRecursive(extractedRoot, nodeDir);
        fs.rmSync(extractedRoot, { recursive: true, force: true });
      } else {
        throw e;
      }
    }

    // Cleanup extract dir (keep downloadPath for SHA256 retry)
    fs.rmSync(extractDir, { recursive: true, force: true });

  } catch (e) {
    // Cleanup on failure
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(downloadPath); } catch {}
    throw new Error(`Không giải nén được Node.js: ${e.message}`);
  }

// Verify
  const nodeBin = getRuntimeNodeBinPath();
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`Node.js installation failed: binary not found at ${nodeBin}`);
  }

  // Verify node binary with SHA256 — catches locked-file corruption and partial extraction.
  // Corporate locked-file scenario: extraction exits 0 but some files are corrupted.
  const shaKey = getNodeShaKey();
  if (shaKey && NODE_SHA256[shaKey]) {
    if (!fs.existsSync(nodeBin)) {
      throw new Error(`Node.js binary not found at expected path: ${nodeBin}`);
    }
    if (!verifySha256(nodeBin, NODE_SHA256[shaKey])) {
      // Hash mismatch — corrupted or locked file. Re-extract once before giving up.
      console.warn('[runtime-installer] node.exe SHA256 mismatch — re-extracting...');
      // Delete corrupted binary and re-extract
      try { fs.unlinkSync(nodeBin); } catch {}
      // Re-run extraction
      const tmpExtractDir = path.join(vendorDir, 'temp-node-retry-' + Date.now());
      fs.mkdirSync(tmpExtractDir, { recursive: true });
      try {
        if (type === 'zip') {
          const ps = spawn('powershell', [
            '-NoProfile', '-Command',
            `Expand-Archive -Path '${downloadPath.replace(/'/g, "''")}' -DestinationPath '${tmpExtractDir.replace(/'/g, "''")}' -Force`
          ], { stdio: 'pipe' });
          let stderr = '';
          ps.stderr?.on('data', d => { stderr += String(d); });
          await new Promise((resolve, reject) => {
            ps.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Expand-Archive retry failed (${code}): ${stderr}`)));
            ps.on('error', reject);
          });
        } else {
          const tar = spawn('tar', ['xzf', downloadPath, '-C', tmpExtractDir], { stdio: 'pipe' });
          let stderr = '';
          tar.stderr?.on('data', d => { stderr += String(d); });
          await new Promise((resolve, reject) => {
            tar.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar retry failed (${code}): ${stderr}`)));
            tar.on('error', reject);
          });
        }
        // Find and move
        const entries = fs.readdirSync(tmpExtractDir);
        let extractedRoot = null;
        for (const entry of entries) {
          const entryPath = path.join(tmpExtractDir, entry);
          if (fs.statSync(entryPath).isDirectory()) {
            const check = process.platform === 'win32'
              ? path.join(entryPath, 'node.exe')
              : path.join(entryPath, 'bin', 'node');
            if (fs.existsSync(check)) extractedRoot = entryPath;
          }
        }
        if (!extractedRoot) extractedRoot = path.join(tmpExtractDir, entries[0]);
        try { fs.rmSync(nodeDir, { recursive: true, force: true }); } catch {}
        fs.mkdirSync(path.dirname(nodeDir), { recursive: true });
        try {
          fs.renameSync(extractedRoot, nodeDir);
        } catch (e) {
          if (e.code === 'EXDEV') {
            copyDirRecursive(extractedRoot, nodeDir);
            fs.rmSync(extractedRoot, { recursive: true, force: true });
          } else {
            throw e;
          }
        }
        fs.rmSync(tmpExtractDir, { recursive: true, force: true });
      } catch (retryErr) {
        try { fs.rmSync(tmpExtractDir, { recursive: true, force: true }); } catch {}
        throw new Error(`Không giải nén được Node.js sau khi thử lại: ${retryErr.message}`);
      }
      // Verify again
      if (!fs.existsSync(nodeBin)) {
        throw new Error(`Node.js binary still missing after retry: ${nodeBin}`);
      }
      if (!verifySha256(nodeBin, NODE_SHA256[shaKey])) {
        throw new Error(`Node.js binary SHA256 vẫn không khớp sau retry — file có thể bị khóa bởi process khác (Defender, antivirus). Thử khởi động lại máy.`);
      }
      console.log('[runtime-installer] node.exe verified OK after retry');
    } else {
      console.log('[runtime-installer] node.exe SHA256 verified OK');
    }
  }

  // Cleanup download archive after successful verification
  try { fs.unlinkSync(downloadPath); } catch {}

  if (onProgress) onProgress({ step: 'node', percent: 100, message: 'Node.js đã sẵn sàng' });

  console.log('[runtime-installer] Node.js installed successfully at', nodeBin);
  return { path: nodeBin, version: targetVersion };
}

// =====================================================================
// NPM Package Detection & Installation
// =====================================================================

async function getInstalledPackages() {
  const nodeBin = await getWorkingNodeBin();
  if (!nodeBin) return {};

  const result = {};
  for (const pkg of PACKAGES) {
    try {
      const pkgPath = path.join(getRuntimeNodeModulesDir(), pkg.name, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        result[pkg.name] = pkgJson.version;
      }
    } catch {}
  }
  return result;
}

async function getWorkingNodeBin() {
  // Try runtime Node first
  const runtimeVersion = await getRuntimeNodeVersion();
  if (runtimeVersion) {
    return getRuntimeNodeBinPath();
  }

  if (app && app.isPackaged) return null;

  // Fall back to system Node
  const systemVersion = await getSystemNodeVersion();
  if (systemVersion) {
    try {
      const out = execSync(
        process.platform === 'win32' ? 'where node' : 'command -v node',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      return out.split('\n')[0].trim();
    } catch {}
  }

  return null;
}

function getRuntimeNpmCommand(nodeBin = null) {
  const runtimeNode = nodeBin || getRuntimeNodeBinPath();
  const npmCli = path.join(getRuntimeNodeHomeDir(), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (runtimeNode && fs.existsSync(runtimeNode) && fs.existsSync(npmCli)) {
    return { command: runtimeNode, argsPrefix: [npmCli], shell: false };
  }

  if (runtimeNode && fs.existsSync(runtimeNode)) {
    const siblingNpmCli = path.join(path.dirname(runtimeNode), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(siblingNpmCli)) {
      return { command: runtimeNode, argsPrefix: [siblingNpmCli], shell: false };
    }
  }

  const isWin = process.platform === 'win32';
  try {
    const cmd = isWin ? 'where npm.cmd' : 'command -v npm';
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 5000, shell: !isWin }).trim();
    const npmPath = out.split(/\r?\n/)[0]?.trim();
    if (npmPath) {
      return {
        command: npmPath,
        argsPrefix: [],
        shell: isWin && npmPath.toLowerCase().endsWith('.cmd'),
      };
    }
  } catch {}

  return { command: isWin ? 'npm.cmd' : 'npm', argsPrefix: [], shell: isWin };
}

async function installNpmPackages(versions, onProgress) {
  console.log('[runtime-installer] Installing npm packages...');

  const nodeBin = await getWorkingNodeBin();
  if (!nodeBin) {
    throw new Error('No Node.js found to install npm packages');
  }

  const vendorDir = getRuntimeNodeDir();
  const nodeModulesDir = getRuntimeNodeModulesDir();
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  // Create a temporary package.json to define the local package scope
  // This allows `npm install <pkg>@<ver>` to install into our custom directory
  const pkgJsonPath = path.join(vendorDir, 'package.json');
  let pkgJson = { name: 'modoro-runtime', version: '1.0.0', private: true };
  try {
    if (fs.existsSync(pkgJsonPath)) {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    }
  } catch {}
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

  // Install packages
  for (let i = 0; i < PACKAGES.length; i++) {
    const pkg = PACKAGES[i];
    const version = versions[pkg.name] || pkg.version;
    const targetVersion = `${pkg.name}@${version}`;

    if (onProgress) {
      const basePercent = 10 + Math.floor((i / PACKAGES.length) * 60);
      onProgress({
        step: 'packages',
        percent: basePercent,
        message: `Đang cài ${pkg.name} ${version}...`,
        subStep: `${pkg.name}@${version}`,
      });
    }

    // Verify NOT already installed with correct version first
    const existingPath = path.join(nodeModulesDir, pkg.name, 'package.json');
    if (fs.existsSync(existingPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
        if (existing.version === version) {
          console.log('[runtime-installer]', pkg.name, 'already at', version, '- skipping');
          continue;
        }
      } catch {}
    }

    // Install using npm --prefix (correct approach).
    // Wrap each package install with retry for transient errors (network, disk, npm cert issues).
    let installed = false;
    let lastError = null;

    const npmInstallOp = async () => {
      const npm = getRuntimeNpmCommand(nodeBin);
      await execFilePromise(
        npm.command,
        [...npm.argsPrefix, 'install', '--prefix', vendorDir, targetVersion, '--save', '--no-fund', '--no-audit'],
        { timeout: NPM_INSTALL_TIMEOUT_MS, encoding: 'utf-8', stdio: 'pipe', shell: npm.shell }
      );

      // Verify installation
      const verifyPath = path.join(nodeModulesDir, pkg.name, 'package.json');
      if (!fs.existsSync(verifyPath)) {
        throw new Error('Package directory not created');
      }
      const verify = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
      if (verify.version !== version) {
        throw new Error(`Version mismatch: expected ${version}, got ${verify.version}`);
      }
    };

    try {
      if (withRetry) {
        await withRetry(npmInstallOp, {
          maxRetries: 2,
          baseDelay: 5000,
          maxDelay: 30000,
          onRetry: ({ attempt, maxRetries, error, delay }) => {
            console.log(`[runtime-installer] Retry ${attempt}/${maxRetries} for ${pkg.name} after ${delay}ms: ${error?.message}`);
            if (onProgress) {
              onProgress({ step: 'packages', message: `Đang thử lại ${pkg.name} (lần ${attempt + 1})...`, subStep: pkg.name });
            }
          },
        });
        installed = true;
      } else {
        // Fallback: 3-attempt loop for environments where installation-recovery isn't loaded
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, 5000 * attempt));
            console.log('[runtime-installer] Retry', attempt + 1, 'for', pkg.name);
          }
          try {
            await npmInstallOp();
            installed = true;
            break;
          } catch (e) {
            lastError = e;
            // If version matched after error, npm actually succeeded
            const verifyPath = path.join(nodeModulesDir, pkg.name, 'package.json');
            if (fs.existsSync(verifyPath)) {
              const verify = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
              if (verify.version === version) {
                console.log('[runtime-installer] Package verified after install error:', pkg.name, '@', verify.version);
                installed = true;
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      lastError = e;
    }

    if (!installed) {
      const hint = getInstallErrorHint(lastError);
      const hintMsg = hint ? '\n' + hint : '';
      throw new Error(`Không cài được ${pkg.name}@${version}: ${lastError?.message || 'Unknown error'}${hintMsg}`);
    }
  }

  if (onProgress) {
    onProgress({ step: 'packages', percent: 80, message: 'Hoàn tất cài đặt packages' });
  }

  // Verify all installations
  const installed = await getInstalledPackages();
  console.log('[runtime-installer] Installed packages:', installed);

  // Final verification
  for (const pkg of PACKAGES) {
    if (!installed[pkg.name] || installed[pkg.name] !== pkg.version) {
      throw new Error(`Verification failed for ${pkg.name}: expected ${pkg.version}, got ${installed[pkg.name] || 'not installed'}`);
    }
  }

  return installed;
}

// =====================================================================
// Utility Functions
// =====================================================================

const copyDirRecursive = _copyDir;

// =====================================================================
// modoro-zalo Plugin Bundling
// =====================================================================

function getBundledModoroZaloPath() {
  // In packaged app: resources/modoro-zalo/
  // In dev mode: electron/packages/modoro-zalo/
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, 'modoro-zalo');
  }
  return path.join(__dirname, '..', 'packages', 'modoro-zalo');
}

async function ensureModoroZaloPlugin(onProgress) {
  console.log('[runtime-installer] Ensuring modoro-zalo plugin...');

  if (onProgress) onProgress({ step: 'plugin', percent: 0, message: 'Đang cài plugin Zalo...' });

  const srcPath = getBundledModoroZaloPath();
  const destPath = path.join(getRuntimeNodeModulesDir(), 'modoro-zalo');

  if (!fs.existsSync(srcPath)) {
    throw new Error(`modoro-zalo plugin not found at ${srcPath}`);
  }

  // Copy plugin to node_modules
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  try {
    copyDirRecursive(srcPath, destPath);
  } catch (e) {
    throw new Error(`Không copy được modoro-zalo plugin: ${e.message}`);
  }

  // Verify
  const pluginManifest = path.join(destPath, 'openclaw.plugin.json');
  if (!fs.existsSync(pluginManifest)) {
    throw new Error(`modoro-zalo plugin manifest not found at ${pluginManifest}`);
  }

  if (onProgress) onProgress({ step: 'plugin', percent: 100, message: 'Plugin Zalo đã sẵn sàng' });

  console.log('[runtime-installer] modoro-zalo plugin installed at', destPath);
  return destPath;
}

function checkModoroZaloReady() {
  // Check both install model locations:
  //   macOS bundled: resourcesPath/vendor/node_modules/modoro-zalo/
  //   runtime (Win/Dev): userData/vendor/node_modules/modoro-zalo/
  const locations = [];

  if (app && app.isPackaged && process.platform === 'darwin') {
    try {
      locations.push(path.join(process.resourcesPath, 'vendor', 'node_modules', 'modoro-zalo', 'openclaw.plugin.json'));
    } catch {}
  }

  try {
    locations.push(path.join(getRuntimeNodeModulesDir(), 'modoro-zalo', 'openclaw.plugin.json'));
  } catch {}

  for (const manifest of locations) {
    try {
      if (fs.existsSync(manifest) && fs.statSync(manifest).size > 0) {
        return true;
      }
    } catch {}
  }
  return false;
}

// =====================================================================
// Installation Check & Status
// =====================================================================

async function checkInstallation() {
  const nodeStatus = await detectNodeInstallation();
  const installedPackages = await getInstalledPackages();
  const runtimeVersion = getInstalledVersion();
  const zaloReady = checkModoroZaloReady();

  // macOS bundled model: vendor lives at resourcesPath/vendor/ (not userData/vendor/).
  // The bundled vendor is already pre-installed by the build process — no runtime
  // install marker files exist. Treat the bundled model as "ready" if:
  //   (a) nodeStatus.type === 'bundled' (node found at resourcesPath/vendor/node/)
  //   (b) vendor packages exist at the correct location for the install model
  let layoutVersionOk = true;
  try {
    const lvPath = path.join(getUserDataDir(), 'layout-version.txt');
    if (fs.existsSync(lvPath)) {
      layoutVersionOk = fs.readFileSync(lvPath, 'utf8').trim() === LAYOUT_VERSION;
    } else {
      // No marker — v1 layout is the first, treat as OK.
      // On macOS bundled model, userData has no layout-version.txt (runtime-only marker).
      layoutVersionOk = true;
    }
  } catch { layoutVersionOk = true; }

  // Determine packages-ready based on install model:
  //   Bundled (macOS): packages are at resourcesPath/vendor/node_modules/
  //   Runtime (Win/Dev): packages are at userData/vendor/node_modules/
  let allPackagesInstalled;
  if (nodeStatus.type === 'bundled') {
    // macOS bundled model: check packages at resourcesPath/vendor/node_modules/
    allPackagesInstalled = PACKAGES.every(pkg => {
      const pkgPath = path.join(process.resourcesPath, 'vendor', 'node_modules', pkg.name, 'package.json');
      try {
        if (!fs.existsSync(pkgPath)) return false;
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return pkgJson.version === pkg.version;
      } catch { return false; }
    });
  } else {
    allPackagesInstalled = PACKAGES.every(pkg => {
      const installed = installedPackages[pkg.name];
      if (!installed) return false;
      return installed === pkg.version;
    });
  }

  // gogcli (Google Workspace CLI) is OPTIONAL — do NOT include it in filesReady.
  // It is only needed when CEO uses Google Workspace features. The bot must still
  // boot and run even if gogcli is absent.
  const filesReady = nodeStatus.satisfiesMin && allPackagesInstalled && zaloReady && layoutVersionOk;

  // macOS bundled model: no runtimeVersion marker file exists — use nodeStatus.type
  // as the indicator that installation is complete.
  const isBundledModel = nodeStatus.type === 'bundled';
  const ready = filesReady && (isBundledModel || (runtimeVersion === '2.4.0' && layoutVersionOk));
  const gogReady = await checkGogCliReady();

  return {
    ready,
    filesReady,
    runtimeVersion,
    node: nodeStatus,
    packages: installedPackages,
    missingPackages: PACKAGES.filter(pkg => {
      if (nodeStatus.type === 'bundled') {
        // macOS bundled model: check resourcesPath/vendor/node_modules/
        const pkgPath = path.join(process.resourcesPath, 'vendor', 'node_modules', pkg.name, 'package.json');
        try {
          if (!fs.existsSync(pkgPath)) return true;
          const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          return pkgJson.version !== pkg.version;
        } catch { return true; }
      } else {
        return (installedPackages[pkg.name] || '') !== pkg.version;
      }
    }).map(p => p.name),
    needsNodeInstall: !nodeStatus.satisfiesMin,
    needsPackageInstall: !allPackagesInstalled,
    layoutVersionOk,
    needsLayoutMigration: !layoutVersionOk,
    modoroZaloReady: zaloReady,
    needsModoroZaloInstall: !zaloReady,
    // gogcli is optional — always return true, never block boot
    gogReady,
    needsGogInstall: !gogReady,
  };
}

// =====================================================================
// Main Installation Flow
// =====================================================================

async function runInstallation({ onProgress } = {}) {
  if (_installInProgress) {
    throw new Error('Installation already in progress');
  }
  _installInProgress = true;

  try {
    if (onProgress) onProgress({ step: 'check', percent: 0, message: 'Đang kiểm tra hệ thống...' });

    // Check current status
    const status = await checkInstallation();

    if (status.ready) {
      if (onProgress) onProgress({ step: 'complete', percent: 100, message: 'Đã sẵn sàng!' });
      return status;
    }

    // On macOS bundled model, userData has no runtime-version.txt (the bundled
    // vendor at resourcesPath/vendor/ is already pre-installed). Skip the version-marker
    // path since there's nothing to write.
    const isBundledModel = status.node && status.node.type === 'bundled';
    if (status.filesReady && status.runtimeVersion !== '2.4.0' && !isBundledModel) {
      writeInstalledVersion('2.4.0');
      writeLayoutVersion(); // Both markers must be written to avoid unnecessary re-migration on next boot
      _installStatus = await checkInstallation();
      if (onProgress) onProgress({ step: 'complete', percent: 100, message: 'Đã sẵn sàng!' });
      return _installStatus;
    }

    // macOS bundled model: vendor is pre-installed at resourcesPath/vendor/.
    // No further installation steps needed.
    if (isBundledModel && status.filesReady) {
      if (onProgress) onProgress({ step: 'complete', percent: 100, message: 'Bundled vendor ready!' });
      return status;
    }

    // Layout migration: if LAYOUT_VERSION changed, trigger a clean re-install.
    if (status.needsLayoutMigration) {
      console.log('[boot] Runtime layout version mismatch — forcing re-install...');
      // Clean old node_modules but preserve user data
      try {
        const nmDir = getRuntimeNodeModulesDir();
        if (fs.existsSync(nmDir)) {
          fs.rmSync(nmDir, { recursive: true, force: true });
          console.log('[boot] Cleared old node_modules for layout migration');
        }
      } catch (e) {
        console.warn('[boot] Failed to clear node_modules:', e.message);
      }
    }

    // Step 1: Install Node.js if needed
    if (status.needsNodeInstall) {
      // Use the pinned Node version from versions.json — must match the SHA256
      // checksums in NODE_SHA256 above. MIN_NODE_VERSION is only used for the
      // "minimum acceptable" check in detectNodeInstallation, not for downloads.
      const stableVersion = SHARED_VERSIONS.node;
      await installNode(stableVersion, onProgress);
    } else {
      if (onProgress) onProgress({ step: 'node', percent: 100, message: 'Node.js đã có sẵn' });
    }

    // Step 2: Install npm packages
    if (status.needsPackageInstall) {
      await installNpmPackages({}, onProgress);
    } else {
      if (onProgress) onProgress({ step: 'packages', percent: 80, message: 'Packages đã có sẵn' });
    }

    // Step 3: Ensure modoro-zalo plugin
    if (status.needsModoroZaloInstall) {
      await ensureModoroZaloPlugin(onProgress);
    } else {
      if (onProgress) onProgress({ step: 'plugin', percent: 100, message: 'Plugin Zalo da co san' });
    }

    // Step 4: Install gogcli (Google Workspace CLI) if not already present
    if (status.needsGogInstall) {
      await ensureGogCli(onProgress);
    } else {
      if (onProgress) onProgress({ step: 'gog', percent: 100, message: 'gogcli da co san' });
    }

    // Step 5: Write version + layout markers
    writeInstalledVersion('2.4.0');
    writeLayoutVersion();

    if (onProgress) onProgress({ step: 'complete', percent: 100, message: 'Hoàn tất cài đặt!' });

    _installStatus = await checkInstallation();
    return _installStatus;

  } finally {
    _installInProgress = false;
  }
}

// =====================================================================
// Runtime Path Helpers (for boot.js compatibility)
// =====================================================================

// Alias for getRuntimeNodeModulesDir - where npm packages are installed
const getRuntimeVendorDir = getRuntimeNodeModulesDir;

function findRuntimeNodeBin() {
  return getRuntimeNodeBinPath();
}

function findRuntimeOpenClawCliJs() {
  const mjs = path.join(getRuntimeNodeModulesDir(), 'openclaw', 'openclaw.mjs');
  if (fs.existsSync(mjs)) return mjs;
  return null;
}

// =====================================================================
// gogcli (Google Workspace CLI) Installation
// =====================================================================

async function checkGogCliReady() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return true;
  const isWin = process.platform === 'win32';
  const gogDir = path.join(getRuntimeNodeDir(), 'gog');
  const gogBin = isWin ? path.join(gogDir, 'gog.exe') : path.join(gogDir, 'gog');
  const stampFile = path.join(gogDir, '.target');
  const stampValue = `${GOG_VERSION}-${process.platform}-${process.arch}`;
  if (!fs.existsSync(gogBin) || !fs.existsSync(stampFile)) return false;
  try {
    if (fs.readFileSync(stampFile, 'utf8').trim() !== stampValue) return false;
    await execFilePromise(gogBin, ['version'], { timeout: 10000 });
    return true;
  } catch { return false; }
}

async function ensureGogCli(onProgress) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  if (!isWin && !isMac) return; // Linux: skip for now

  if (onProgress) onProgress({ step: 'gog', percent: 0, message: 'Đang cài gogcli...' });

  const gogDir = path.join(getRuntimeNodeDir(), 'gog');
  const gogBin = isWin
    ? path.join(gogDir, 'gog.exe')
    : path.join(gogDir, 'gog');
  const stampFile = path.join(gogDir, '.target');
  const stampValue = `${GOG_VERSION}-${process.platform}-${process.arch}`;

  if (await checkGogCliReady()) {
    console.log('[runtime-installer] gogcli already installed:', stampValue);
    if (onProgress) onProgress({ step: 'gog', percent: 100, message: 'gogcli đã sẵn sàng' });
    return;
  }

  console.log('[runtime-installer] Installing gogcli', GOG_VERSION, '...');

  // Step 1: Try copy from bundled resources (resources/vendor/gog/)
  let installed = false;
  const bundledGog = getBundledGogPath();
  if (bundledGog && fs.existsSync(bundledGog)) {
    try {
      fs.mkdirSync(gogDir, { recursive: true });
      const bundledDir = path.dirname(bundledGog);
      const bundledFiles = fs.readdirSync(bundledDir);
      for (const f of bundledFiles) {
        const src = path.join(bundledDir, f);
        const dst = path.join(gogDir, f);
        if (fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dst);
        }
      }
      if (fs.existsSync(gogBin)) {
        if (!isWin) try { fs.chmodSync(gogBin, 0o755); } catch {}
        fs.writeFileSync(stampFile, stampValue + '\n');
        if (await checkGogCliReady()) {
          console.log('[runtime-installer] gogcli copied from bundled:', gogBin);
          installed = true;
        } else {
          console.warn('[runtime-installer] bundled gogcli failed readiness check:', gogBin);
        }
      }
    } catch (e) {
      console.warn('[runtime-installer] Could not copy bundled gogcli:', e.message);
    }
  }

  // Step 2: Fallback download from GitHub
  if (!installed) {
    await installGogCliDownload(gogDir, gogBin, isWin, stampFile, stampValue);
  }

  if (!(await checkGogCliReady())) {
    throw new Error('gogcli installed but failed readiness check');
  }

  if (onProgress) onProgress({ step: 'gog', percent: 100, message: 'gogcli đã sẵn sàng' });
}

function getBundledGogPath() {
  if (!app || !app.isPackaged) return null;
  const isWin = process.platform === 'win32';
  const p = path.join(process.resourcesPath, 'vendor', 'gog', isWin ? 'gog.exe' : 'gog');
  return fs.existsSync(p) ? p : null;
}

async function installGogCliDownload(gogDir, gogBin, isWin, stampFile, stampValue) {
  const archMap = { x64: 'amd64', arm64: 'arm64' };
  const platMap = { win32: 'windows', darwin: 'darwin' };
  const ver = GOG_VERSION.replace(/^v/, '');
  const arch = process.arch === 'x64' ? 'x64' : 'arm64';
  const platform = platMap[process.platform];
  const ext = isWin ? '.zip' : '.tar.gz';
  const assetName = `gogcli_${ver}_${platform}_${archMap[arch]}${ext}`;
  const url = `https://github.com/steipete/gogcli/releases/download/${GOG_VERSION}/${assetName}`;

  let downloaded = false;
  let lastError = null;
  let tmp = path.join(require('os').tmpdir(), `gogcli-dl-${Date.now()}${ext}`);

  try {
    await downloadFile(url, tmp, null);
    verifyDownloadedGogArchive(tmp);
    downloaded = true;
  } catch (e) {
    lastError = e;
    // Try alternate naming (some releases use different format)
    const altName = `gogcli_${ver}_${platMap[process.platform]}_${arch}.${isWin ? 'zip' : 'tar.gz'}`;
    const altUrl = `https://github.com/steipete/gogcli/releases/download/${GOG_VERSION}/${altName}`;
    try {
      const tmp2 = path.join(require('os').tmpdir(), `gogcli-alt-${Date.now()}.${isWin ? 'zip' : 'tar.gz'}`);
      await downloadFile(altUrl, tmp2, null);
      verifyDownloadedGogArchive(tmp2);
      tmp = tmp2;
      downloaded = true;
    } catch (e2) {
      lastError = e2;
    }
  }

  if (!downloaded) {
    throw new Error(`Không tải được gogcli. Kiểm tra kết nối mạng. (${lastError?.message || 'unknown'})`);
  }

  fs.mkdirSync(gogDir, { recursive: true });
  const extractDir = path.join(gogDir, 'temp-' + Date.now());
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // Extract
    if (isWin) {
      await new Promise((resolve, reject) => {
        const ps = spawn('powershell', [
          '-NoProfile', '-Command',
          `Expand-Archive -Path '${tmp.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
        ], { stdio: 'pipe' });
        let stderr = '';
        ps.stderr?.on('data', d => { stderr += String(d); });
        ps.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Extract failed (${code}): ${stderr}`)));
        ps.on('error', reject);
      });
    } else {
      await new Promise((resolve, reject) => {
        const t = spawn('tar', ['-xzf', tmp, '-C', extractDir], { stdio: 'pipe' });
        t.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar failed: ${code}`)));
        t.on('error', reject);
      });
    }

    // Find gog binary
    const entries = fs.readdirSync(extractDir);
    let foundBin = null;
    for (const entry of entries) {
      const entryPath = path.join(extractDir, entry);
      const checkPath = isWin
        ? path.join(entryPath, 'gog.exe')
        : path.join(entryPath, 'gog');
      if (fs.existsSync(checkPath)) { foundBin = checkPath; break; }
    }
    if (!foundBin) {
      // Fallback: check top-level
      const topBin = path.join(extractDir, isWin ? 'gog.exe' : 'gog');
      if (fs.existsSync(topBin)) foundBin = topBin;
    }

    if (!foundBin) {
      throw new Error('Không tìm thấy gog binary sau khi giải nén. Thử tải lại.');
    }

    // Copy to gogDir
    fs.copyFileSync(foundBin, gogBin);
    if (!isWin) try { fs.chmodSync(gogBin, 0o755); } catch {}
    fs.writeFileSync(stampFile, stampValue + '\n');
    console.log('[runtime-installer] gogcli installed at', gogBin);
  } finally {
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// =====================================================================
// Cleanup Old Bundled Files (Migration helper)
// =====================================================================

async function cleanupOldBundledFiles() {
  const userData = getUserDataDir();
  const oldFiles = [
    path.join(userData, 'vendor-bundle.tar'),
    path.join(userData, 'vendor-meta.json'),
    path.join(userData, 'vendor-version.txt'),
  ];

  for (const file of oldFiles) {
    try {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) {
          fs.rmSync(file, { recursive: true, force: true });
        } else {
          fs.unlinkSync(file);
        }
        console.log('[runtime-installer] Removed old file:', file);
      }
    } catch (e) {
      console.warn('[runtime-installer] Failed to remove old file:', file, e.message);
    }
  }

  // Also clean up stale vendor dirs
  try {
    const entries = fs.readdirSync(userData);
    for (const e of entries) {
      if (e.startsWith('vendor.stale-')) {
        fs.rmSync(path.join(userData, e), { recursive: true, force: true });
        console.log('[runtime-installer] Removed stale vendor:', e);
      }
    }
  } catch {}
}

// =====================================================================
// Module Exports
// =====================================================================
module.exports = {
  // Core functions
  checkInstallation,
  runInstallation,
  detectNodeInstallation,
  installNode,
  getInstalledPackages,
  installNpmPackages,
  ensureModoroZaloPlugin,
  ensureGogCli,
  // cleanupBundledTarIfInstalled removed — pure runtime, no bundled tar to clean

  // Path helpers
  getUserDataDir,
  getRuntimeNodeDir,
  getRuntimeNodeHomeDir,
  getRuntimeNodeModulesDir,
  getRuntimeNodeBinPath,
  getRuntimeNpmCommand,
  getRuntimeVendorDir,
  findRuntimeNodeBin,
  findRuntimeOpenClawCliJs,

  // Version helpers
  getInstalledVersion,
  writeInstalledVersion,
  compareVersions,
  satisfiesMinVersion,

  // Migration
  cleanupOldBundledFiles,

  // Constants
  PINNED_VERSIONS,
  MIN_NODE_VERSION,
  PACKAGES,
  GOG_VERSION,
};
