'use strict';
/**
 * autonomous-bug-sweep.js
 *
 * Systematic bug-finding and auto-fixing run for the 9biz-claw codebase.
 * Runs for a configurable duration (default: 5 hours), then exits cleanly.
 *
 * Usage:
 *   node autonomous-bug-sweep.js           # 5 hours, dry-run by default
 *   node autonomous-bug-sweep.js --apply    # actually write fixes
 *   node autonomous-bug-sweep.js --minutes=30 --apply  # 30-minute test run
 *
 * Bug patterns it hunts:
 *   1. JSON.parse without try/catch
 *   2. execSync / exec without try/catch
 *   3. Missing null/undefined guards before property access
 *   4. Event emitter listeners without removal (memory leaks)
 *   5. setTimeout/setInterval with non-function argument
 *   6. Unhandled promise rejections (missing .catch on async calls)
 *   7. Silent .catch(() => {}) swallowing CEO alerts
 *   8. Array/Map/Set growing unboundedly without cleanup
 *   9. Wrong use of == / != vs === / !==
 *   10. Logical inversions in conditions
 *
 * Output: scan-results.json (JSON log of all findings and fixes)
 *         scan-report.md  (human-readable markdown report)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, a) => {
  if (a.startsWith('--')) {
    const eqIdx = a.indexOf('=');
    const k = eqIdx >= 0 ? a.slice(2, eqIdx) : a.slice(2);
    const v = eqIdx >= 0 ? a.slice(eqIdx + 1) : true;
    acc[k] = v;
  }
  return acc;
}, {});

const DRY_RUN   = !args.apply;
const DURATION_MS = Math.max(60_000, parseInt(args.minutes || args.minutes === '0' ? args.minutes : '300') * 60_000);
const CLAW_ROOT = args.root || path.resolve(__dirname, '../..');

// ─── Globals ─────────────────────────────────────────────────────────────────
let sessionId       = Date.now();
let filesScanned    = 0;
let bugsFound       = 0;
let bugsFixed       = 0;
let bugsSkipped     = 0;
let errors          = 0;
// Keyed by "file:line:bugType" to deduplicate across passes
const findingsMap   = new Map();   // file:line:bugType → finding
const fixLog        = [];   // { file, line, bugType, fix, ts }
const errorLog      = [];   // { file, line, error }
const startTime     = Date.now();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(msg) {
  const elapsed = msToStr(Date.now() - startTime);
  console.log(`[${elapsed}] ${msg}`);
}

function warn(msg) {
  const elapsed = msToStr(Date.now() - startTime);
  console.warn(`[${elapsed}] WARN: ${msg}`);
}

function msToStr(ms) {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}m` : `${m}m${String(s).padStart(2,'0')}s`;
}

function elapsedPct() {
  const pct = Math.min(100, ((Date.now() - startTime) / DURATION_MS) * 100).toFixed(1);
  return pct;
}

function getJsFiles(dir, excludeDirs = new Set(['node_modules','.git','dist','build','next','scripts'])) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name) && !entry.name.startsWith('.')) {
          results.push(...getJsFiles(path.join(dir, entry.name), excludeDirs));
        }
      } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {}
  return results;
}

function relativePath(f) {
  return f.replace(CLAW_ROOT, '').replace(/\\/g, '/');
}

function readFileLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n');
  } catch {
    return [];
  }
}

function getContext(lines, lineIdx, before = 3, after = 3) {
  const start = Math.max(0, lineIdx - before);
  const end   = Math.min(lines.length - 1, lineIdx + after);
  const context = [];
  for (let i = start; i <= end; i++) {
    context.push({ n: i + 1, text: lines[i] || '' });
  }
  return context;
}

function readChunk(filePath, lineIdx, chunk = 20) {
  const lines = readFileLines(filePath);
  return getContext(lines, lineIdx, chunk, chunk);
}

function severityScore(s) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 }[s] || 0;
}

// ─── Bug Scanners ────────────────────────────────────────────────────────────

/**
 * SCANNER 1: JSON.parse without try/catch
 * Scans for: JSON.parse( ... ) that appears on a line NOT inside a try block.
 * Heuristic: if the previous 20 non-empty lines don't contain "try {" or "try{", it's unprotected.
 */
function scanJsonParseWithoutTryCatch(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/^[^/]*(?:JSON\.parse|json\.parse)\s*\(/.test(line)) continue;

    // Look back up to 25 lines for a surrounding try block
    let inTry = false;
    let braceDepth = 0;
    const lookback = Math.min(i, 25);
    for (let j = i - 1; j >= i - lookback; j--) {
      const tl = lines[j].trim();
      // Count brace depth to detect function/switch boundaries
      if (/\{$/.test(tl) || tl.endsWith('{')) braceDepth++;
      if (/^\}/.test(tl) || tl.startsWith('}')) braceDepth = Math.max(0, braceDepth - 1);
      // Simple heuristic: if we see "try {" or "catch(" nearby, assume it's protected
      if (/\btry\s*\{/.test(tl) || /\bcatch\s*\(/.test(tl)) {
        inTry = true;
        break;
      }
      // If brace depth went positive then negative, we left a function — stop looking
      if (braceDepth < 0) break;
    }
    if (!inTry) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'JSON.parse without try/catch',
        severity: 'MEDIUM',
        code: lines[i].trim(),
        description: 'JSON.parse() is called without a surrounding try/catch. Corrupt JSON will throw an unhandled exception.',
        fixed: false,
      });
    }
  }
  return results;
}

/**
 * SCANNER 2: execSync without try/catch
 * Scans for: require('child_process').execSync or child_process.execSync without try/catch
 */
function scanExecSyncWithoutTryCatch(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.includes('execSync')) continue;

    let inTry = false;
    let braceDepth = 0;
    const lookback = Math.min(i, 20);
    for (let j = i - 1; j >= i - lookback; j--) {
      const tl = lines[j].trim();
      if (/\btry\s*\{/.test(tl) || /\bcatch\s*\(/.test(tl)) { inTry = true; break; }
      if (/\{$/.test(tl)) braceDepth++;
      if (/^\}/.test(tl)) { braceDepth--; if (braceDepth < 0) break; }
    }
    if (!inTry) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'execSync without try/catch',
        severity: 'HIGH',
        code: lines[i].trim(),
        description: 'child_process.execSync() is called without a surrounding try/catch. Process failures will crash the app.',
        fixed: false,
      });
    }
  }
  return results;
}

/**
 * SCANNER 3: Silent .catch(() => {}) for CEO alert / sendTelegram / sendCeoAlert
 */
function scanSilentAlertCatch(filePath, lines) {
  const results = [];
  const alertFns = ['sendCeoAlert', 'sendTelegram', 'sendMemoryWriteAlert', 'sendZaloAlert', 'sendZaloTo'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line)) continue;

    // Check if any alert function is in this statement
    const alertFn = alertFns.find(fn => {
      // Look at surrounding 2 lines
      const prev = i > 0 ? lines[i-1] : '';
      const curr = lines[i];
      const combined = prev + curr;
      return combined.includes(fn);
    });

    if (alertFn) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'Silent .catch(() => {}) on CEO alert',
        severity: 'MEDIUM',
        code: (lines[i-1]||'').trim() + '\n' + line,
        description: `Promise from ${alertFn}() has an empty .catch(() => {}), silently swallowing notification failures. Add console.warn logging.`,
        fixed: false,
        fixHint: `.catch(e => console.warn('[filename] ${alertFn} failed:', e?.message))`,
      });
    }
  }
  return results;
}

/**
 * SCANNER 4: Missing null guard before path.join / path.dirname / fs methods
 * Scans for: path.join(getWorkspace(), ...) or path.dirname(getWorkspace()) without null check
 */
function scanMissingWorkspaceNullGuard(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match: path.join(getWorkspace(), ...) or path.dirname(getWorkspace()) or similar
    if (!/path\.(join|dirname|resolve)\s*\(\s*get[A-Za-z]+\s*\(\s*\)/.test(line)) continue;

    // Look back 5 lines for a null check
    let hasGuard = false;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const prev = lines[j].trim();
      if (/if\s*\(\s*![^)]*get[A-Za-z]+\s*\(\s*\)\s*[!=]=?\s*null/.test(prev)) { hasGuard = true; break; }
      if (/if\s*\(\s*get[A-Za-z]+\s*\(\s*\)\s*===\s*null/.test(prev)) { hasGuard = true; break; }
      if (/const\s+\w+\s*=\s*get[A-Za-z]+\s*\(\s*\)\s*;\s*if\s*\(\s*!\w+\s*\)/.test(lines.slice(Math.max(0,j), i+1).join(' '))) { hasGuard = true; break; }
      // Also check: const ws = getWorkspace(); if (!ws) return [];
      const block = lines.slice(j, i + 1).join(' ');
      if (/const\s+\w+\s*=\s*get[A-Za-z]+\s*\(\s*\)/.test(block) && /if\s*\(\s*!\w+\s*\)/.test(block)) { hasGuard = true; break; }
    }
    if (!hasGuard) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'Missing null guard for workspace path',
        severity: 'HIGH',
        code: line,
        description: 'getWorkspace() result passed to path.*() without null check. If workspace is null, path.join(null, ...) throws.',
        fixed: false,
      });
    }
  }
  return results;
}

/**
 * SCANNER 5: Wrong equality (== instead of === for truthy checks)
 * Scans for: value == true / value == false (should be ===)
 */
function scanWrongEquality(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // value == true  or  value == false  in conditions
    if (!/(==\s*true|==\s*false)\b/.test(line)) continue;
    // Skip lines that already have === or !== (regex negation cases)
    if (line.includes('===') || line.includes('!==')) continue;
    results.push({
      file: relativePath(filePath),
      line: i + 1,
      bugType: 'Loose equality (==) in condition',
      severity: 'LOW',
      code: line,
      description: 'Using == instead of === for boolean comparison. Use strict equality.',
      fixed: false,
    });
  }
  return results;
}

/**
 * SCANNER 6: setTimeout / setInterval called with non-function first argument
 */
function scanSetTimeoutNonFunction(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/set(?:Timeout|Interval)\s*\(/.test(line)) continue;

    // Extract the first argument
    const match = line.match(/set(?:Timeout|Interval)\s*\(\s*([^,]+)/);
    if (!match) continue;
    const firstArg = match[1].trim();

    // If first arg looks like a function call result (no =>, no function keyword, not a simple identifier or string)
    const looksLikeFunctionCall = /^[A-Z][A-Za-z0-9_]+\.[A-Za-z_]|^require\(|^\w+\(\)/.test(firstArg);
    if (looksLikeFunctionCall) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'setTimeout/setInterval called with non-function (likely Promise result)',
        severity: 'HIGH',
        code: line,
        description: `setTimeout/setInterval first argument "${firstArg}" looks like a function call that returns a Promise or value, not a function. This will throw a TypeError.`,
        fixed: false,
      });
    }
  }
  return results;
}

/**
 * SCANNER 7: Empty .catch() on async calls that represent critical operations
 */
function scanCriticalSilentCatch(filePath, lines) {
  const results = [];
  // These patterns are suspicious even without an alert context
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line)) continue;
    // Check the statement doesn't contain a console.warn/console.error in surrounding lines
    const prev2 = i > 0 ? (lines[i-1] || '') : '';
    const next2 = i < lines.length - 1 ? (lines[i+1] || '') : '';
    const combined = prev2 + line + next2;
    if (combined.includes('console.warn') || combined.includes('console.error')) continue;

    // Check if this is in a critical context (inside an async function, server handler, etc.)
    // Look back for hints
    let inCriticalContext = false;
    for (let j = Math.max(0, i-30); j < i; j++) {
      const ctx = lines[j] || '';
      if (/\b(async\s+)?function\b|\barrow\b|\=\s*\(/i.test(ctx) &&
          (ctx.includes('api') || ctx.includes('handler') || ctx.includes('route') || ctx.includes('http') || ctx.includes('server') || ctx.includes('middleware'))) {
        inCriticalContext = true;
        break;
      }
    }

    if (inCriticalContext) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'Empty .catch() in critical async handler',
        severity: 'MEDIUM',
        code: line,
        description: 'Empty .catch(() => {}) in a critical async context (HTTP handler, server, route). Errors are silently swallowed.',
        fixed: false,
      });
    }
  }
  return results;
}

/**
 * SCANNER 8: Unbounded array growth
 * Scans for: Array.push() in loops or timers without corresponding cleanup
 */
function scanUnboundedGrowth(filePath, lines) {
  const results = [];
  // Find module-level array declarations
  const arrayNames = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/^(?:let|const|var)\s+(\w+)\s*=\s*\[\s*\]/);
    if (m) arrayNames.add(m[1]);
  }

  for (const arrName of arrayNames) {
    let pushLines = [];
    let clearLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes(`.push(`) && line.includes(arrName)) pushLines.push(i + 1);
      if (line.includes(`.length`) && line.includes('0') && line.includes('=') && line.includes(arrName)) clearLines.push(i + 1); // arr = []
      if (line.includes(`.splice(`) && line.includes(arrName)) clearLines.push(i + 1);
      if (line.includes(`.filter(`) && line.includes(arrName)) clearLines.push(i + 1);
    }

    // If there are many pushes but few/no clears, flag it
    if (pushLines.length > 5 && clearLines.length === 0) {
      results.push({
        file: relativePath(filePath),
        line: pushLines[0],
        bugType: 'Unbounded array growth',
        severity: 'MEDIUM',
        code: `Array "${arrName}" pushed ${pushLines.length} times, never cleared.`,
        description: `Module-level array "${arrName}" is pushed to without any cleanup logic (no arr = [], arr.splice, arr.filter). Can cause memory leaks.`,
        fixed: false,
      });
    }
  }
  return results;
}

/**
 * SCANNER 9: fs.watch / EventEmitter without .removeListener / .close()
 */
function scanListenerLeak(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // fs.watch without .close() or removal
    if (line.includes('fs.watch(') || line.includes('fs.watchFile(')) {
      // Look ahead 50 lines for .close()
      let hasClose = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 60); j++) {
        if (lines[j].includes('.close()') || lines[j].includes('.removeListener(')) { hasClose = true; break; }
      }
      // Also check if it's inside a function that returns a cleanup function
      let hasCleanupFn = false;
      for (let j = Math.max(0, i - 10); j <= i; j++) {
        if (lines[j].includes('return') && (lines[j].includes('.close') || lines[j].includes('() =>'))) { hasCleanupFn = true; break; }
      }
      if (!hasClose && !hasCleanupFn) {
        results.push({
          file: relativePath(filePath),
          line: i + 1,
          bugType: 'Event emitter / watcher without cleanup',
          severity: 'MEDIUM',
          code: line,
          description: 'fs.watch() or event emitter registered without a corresponding .close() or cleanup. On repeated calls or module reload, this leaks listeners.',
          fixed: false,
        });
      }
    }
  }
  return results;
}

/**
 * SCANNER 10: Logical condition inversions (double negation, inverted logic)
 */
function scanLogicalInversions(filePath, lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // !!value or !!(...) or !(!(...))
    if (/!!\w/.test(line) || /!\s*\([^)]*\)/.test(line)) {
      results.push({
        file: relativePath(filePath),
        line: i + 1,
        bugType: 'Double negation / logical inversion',
        severity: 'LOW',
        code: line,
        description: 'Double negation (!!) or inverted logic detected. This may be intentional but should be reviewed.',
        fixed: false,
      });
    }
  }
  return results;
}

// ─── Auto-fix routines ────────────────────────────────────────────────────────

/**
 * Auto-fix: replace .catch(() => {}) with .catch(e => console.warn(...))
 */
function fixSilentCatch(lines, finding) {
  const lineIdx = finding.line - 1;
  const line = lines[lineIdx];
  const newLine = line.replace(
    /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/,
    '.catch(e => console.warn(\'[auto-fix] promise rejected:\', e?.message))'
  );
  if (newLine !== line) {
    lines[lineIdx] = newLine;
    return true;
  }
  return false;
}

/**
 * Auto-fix: add null guard for workspace path
 */
function fixMissingWorkspaceGuard(lines, finding) {
  const lineIdx = finding.line - 1;
  const line = lines[lineIdx];

  // Try to find a const assignment of getWorkspace() nearby
  const blockStart = Math.max(0, lineIdx - 8);
  const block = lines.slice(blockStart, lineIdx + 1);

  // Check if there's a const ws = getWorkspace() pattern
  for (let i = blockStart; i <= lineIdx; i++) {
    const m = lines[i].match(/(const|let|var)\s+(\w+)\s*=\s*(get[A-Za-z]+)\s*\(\s*\)/);
    if (m) {
      const varName = m[2];
      // Add check before the usage line
      const prevLine = lines[i - 1] || '';
      if (!prevLine.includes('if (!' + varName + ')') && !prevLine.includes('if (' + varName + ' === null)')) {
        // Insert guard after the assignment
        lines[i] = lines[i] + '\n' + '  if (!' + varName + ') return;  // auto-fix: null guard for workspace path';
        return true;
      }
    }
  }
  return false;
}

// ─── Main scanner ────────────────────────────────────────────────────────────

const SCANNERS = [
  { name: 'JSON.parse without try/catch', fn: scanJsonParseWithoutTryCatch, autoFix: false },
  { name: 'execSync without try/catch', fn: scanExecSyncWithoutTryCatch, autoFix: false },
  { name: 'Silent .catch(()=>{}) on CEO alerts', fn: scanSilentAlertCatch, fn2: scanCriticalSilentCatch, autoFix: true },
  { name: 'Missing null guard for workspace path', fn: scanMissingWorkspaceNullGuard, autoFix: true },
  { name: 'Wrong equality (== instead of ===)', fn: scanWrongEquality, autoFix: false },
  { name: 'setTimeout with non-function arg', fn: scanSetTimeoutNonFunction, autoFix: false },
  { name: 'Unbounded array growth', fn: scanUnboundedGrowth, autoFix: false },
  { name: 'Event emitter without cleanup', fn: scanListenerLeak, autoFix: false },
  { name: 'Logical inversion / double negation', fn: scanLogicalInversions, autoFix: false },
];

function scanFile(filePath) {
  const lines = readFileLines(filePath);
  const results = [];

  for (const scanner of SCANNERS) {
    try {
      results.push(...scanner.fn(filePath, lines));
    } catch (e) {
      errorLog.push({ file: relativePath(filePath), scanner: scanner.name, error: e.message });
    }
    if (scanner.fn2) {
      try {
        results.push(...scanner.fn2(filePath, lines));
      } catch (e) {}
    }
  }

  return results;
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function runSweep() {
  const deadLine = startTime + DURATION_MS;
  let pass = 0;

  while (Date.now() < deadLine) {
    pass++;
    sessionId = Date.now();
    let passFilesScanned = 0;
    const passFindings = [];
    const passFixed = [];
    const passErrors = [];
    const passStart = Date.now();

    log(`===========================================`);
    log(`AUTONOMOUS BUG SWEEP — Session ${sessionId} | Pass #${pass}`);
    log(`Mode: ${DRY_RUN ? 'DRY-RUN (use --apply to write fixes)' : 'LIVE (writing fixes)'}`);
    const remainMs = deadLine - Date.now();
    log(`Time remaining: ${msToStr(remainMs)}`);
    log(`===========================================`);

    const jsFiles = getJsFiles(CLAW_ROOT);
    if (pass === 1) log(`Found ${jsFiles.length} JS files to scan`);

    for (const filePath of jsFiles) {
      if (Date.now() > deadLine) break;

      passFilesScanned++;
      const fileFindings = scanFile(filePath);
      passFindings.push(...fileFindings);
      bugsFound += fileFindings.length;

      for (const finding of fileFindings) {
        // Deduplicate: only track each unique (file:line:bugType) once
        const key = `${finding.file}:${finding.line}:${finding.bugType}`;
        if (!findingsMap.has(key)) {
          findingsMap.set(key, finding);
        }

        if (!DRY_RUN && finding.bugType && finding.fixed === false) {
          try {
            const lines = readFileLines(filePath);
            let fixed = false;

            if (finding.bugType.includes('Silent .catch') || finding.bugType.includes('Empty .catch')) {
              fixed = fixSilentCatch(lines, finding);
            } else if (finding.bugType.includes('Missing null guard')) {
              fixed = fixMissingWorkspaceGuard(lines, finding);
            }

            if (fixed) {
              fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
              finding.fixed = true;
              findingsMap.get(key).fixed = true;  // keep deduped entry in sync
              bugsFixed++;
              passFixed.push({ file: relativePath(filePath), line: finding.line, bugType: finding.bugType });
              fixLog.push({
                file: relativePath(filePath),
                line: finding.line,
                bugType: finding.bugType,
                fix: finding.fixHint || 'applied',
                ts: new Date().toISOString(),
              });
              log(`  [FIXED] ${relativePath(filePath)}:${finding.line} — ${finding.bugType}`);
            }
          } catch (e) {
            errors++;
            errorLog.push({ file: relativePath(filePath), line: finding.line, error: e.message });
            warn(`  [ERROR] Could not fix ${relativePath(filePath)}:${finding.line}: ${e.message}`);
          }
        }
      }
    }

    const passElapsed = Date.now() - passStart;
    const pct = ((Date.now() - startTime) / DURATION_MS * 100).toFixed(1);
    log(`Pass #${pass} done: ${jsFiles.length} files, ${passFindings.length} bugs this pass, ${passFixed.length} fixed (${passElapsed}ms) | ${pct}% time elapsed`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const elapsed = Date.now() - startTime;
  log(`===========================================`);
  log(`SWEEP COMPLETE (${pass} passes, elapsed: ${msToStr(elapsed)})`);
  log(`Bugs found:     ${bugsFound} (${findings.length} unique)`);
  log(`Files scanned:  ${jsFiles.length} JS files`);
  log(`Bugs fixed:     ${bugsFixed}`);
  log(`Errors:         ${errors}`);
  log(`===========================================`);

  const findings = Array.from(findingsMap.values());
  const bySeverity = findings.reduce((acc, f) => {
    const s = f.severity || 'INFO';
    acc[s] = acc[s] || [];
    acc[s].push(f);
    return acc;
  }, {});

  log(`\nFindings by severity:`);
  for (const s of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
    if (bySeverity[s]?.length) log(`  ${s}: ${bySeverity[s].length}`);
  }

  const resultsPath = path.join(CLAW_ROOT, `bug-sweep-${startTime}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify({
    sessionId: startTime,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date().toISOString(),
    elapsedMs: elapsed,
    passes: pass,
    mode: DRY_RUN ? 'dry-run' : 'live',
    filesScanned: bugsFound > 0 ? bugsFound : 0,
    bugsFound,
    bugsFixed,
    errors,
    findings,
    fixLog,
    errorLog,
    bySeverity,
  }, null, 2), 'utf-8');
  log(`\nResults written to: ${relativePath(resultsPath)}`);

  const reportPath = path.join(CLAW_ROOT, `bug-sweep-${startTime}.md`);
  const report = generateMarkdownReport(findings, fixLog, bySeverity, elapsed, pass);
  fs.writeFileSync(reportPath, report, 'utf-8');
  log(`Report written to: ${relativePath(reportPath)}`);

  return { findings, fixLog, bySeverity };
}

function generateMarkdownReport(findings, fixLog, bySeverity, elapsedMs, passes) {
  const lines = [
    `# Bug Sweep Report — ${new Date().toISOString()}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files scanned | ${filesScanned} |`,
    `| Bugs found | ${bugsFound} |`,
    `| Bugs fixed | ${bugsFixed} |`,
    `| Errors | ${errors} |`,
    `| Elapsed | ${msToStr(elapsedMs)} |`,
    `| Passes | ${passes} |`,
    `## Findings by Severity`,
    ``,
    ...Object.entries({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }).map(([sev, _]) => {
      const items = bySeverity[sev] || [];
      if (!items.length) return `**${sev}:** 0`;
      return `**${sev}:** ${items.length}`;
    }),
    ``,
    `## All Findings`,
    ``,
  ];

  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    const items = (bySeverity[sev] || []).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    if (!items.length) continue;
    lines.push(`### ${sev} (${items.length})`);
    lines.push(``);
    for (const f of items) {
      const status = f.fixed ? '✅ Fixed' : '❌ Not fixed';
      lines.push(`#### ${relativePath(f.file)}:${f.line} — ${f.bugType}`);
      lines.push(``);
      lines.push(`**Severity:** ${sev}`);
      lines.push(`**Status:** ${status}`);
      lines.push(`**Code:**`);
      lines.push('```js');
      lines.push(f.code);
      lines.push('```');
      lines.push(`**Description:** ${f.description}`);
      if (f.fixHint) lines.push(`**Suggested fix:** \`${f.fixHint}\``);
      lines.push(``);
    }
  }

  if (fixLog.length) {
    lines.push(`## Fixes Applied`);
    lines.push(``);
    lines.push(`| File | Line | Bug | Fix | Time |`);
    lines.push(`|------|------|-----|-----|------|`);
    for (const f of fixLog) {
      lines.push(`| ${f.file} | ${f.line} | ${f.bugType} | ${f.fix} | ${f.ts} |`);
    }
  }

  return lines.join('\n');
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

runSweep().catch(e => {
  console.error('Sweep crashed:', e);
  process.exit(1);
});
