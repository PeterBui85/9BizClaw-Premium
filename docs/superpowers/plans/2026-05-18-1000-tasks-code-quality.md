# Code Quality — 250 Micro Tasks
Each task is 1-3 minutes, zero breaking risk.

---

## Dead Code Removal

1. [boot.js:4] `spawn` imported from `child_process` but never used in boot.js — remove from destructure.
2. [boot.js:50] Empty `catch {}` in `getBundledVendorDir` swallows all errors — add `catch (e) { /* fs access fail is expected on first launch */ }` comment.
3. [boot.js:77] Empty `catch {}` in `getBundledNodeBin` — add descriptive comment explaining why error is expected.
4. [boot.js:325] `findBundledOpenClawMjs` duplicates exact same logic as `getBundledOpenClawCliJs` (lines 486-492) — replace body of one with a call to the other.
5. [gateway.js:_startOpenClawImpl] Variable `nineRouterModelCount` is set but only used in 2 `console.log` calls — extract the model-count probe into a named helper.
6. [gateway.js:1031] `const isRestart` assigned but only used once — inline the expression into the `if` condition.
7. [channels.js:765-777] `isZaloListenerAlive` function caches result for 30s but `_zaloListenerAlive` and `_zaloListenerAliveAt` are module-level mutable state — add a `resetZaloListenerCache()` export for test use.
8. [channels.js:757-759] `sendZalo()` always returns `null` (Zalo outbound disabled) — add `@deprecated` JSDoc tag.
9. [cron.js:30] `_agentFlagProfile` initialized to `null` then always set to `'full'` in `selfTestOpenClawAgent` — remove the conditional on line 379 and just use `'full'`.
10. [config.js:703-706] `if (!config.agents) config.agents = {};` and `if (!config.agents.defaults) config.agents.defaults = {};` are duplicated from lines 667-668 — remove the second pair.
11. [license.js:466-471] `clearLicense()` declares `const data = readLicense()` but never uses `data` — remove the unused variable.
12. [license.js:467-470] `clearLicense` requires `fs` and `path` at function scope despite them being required at module top — remove the inner requires.
13. [gateway.js:135-149] Eight `ensureXxxFix` wrapper functions each delegate to one `vendorPatches.xxx` call — consider collapsing into a single map-driven helper.
14. [cron.js:68] `_agentFlagProfile` is set to `'full'` unconditionally in `selfTestOpenClawAgent` — the `_agentFlagProfile || 'full'` fallback on line 379 is dead code.
15. [chat.js:216] `_chatGenerationAborted` is set to `false` at declaration but also reset in `sendChatMessage` — the declaration value is never read.
16. [context.js:14] `restartCount` and `lastCrash` fields in ctx are set but never read anywhere in the codebase — document their intended use or remove.
17. [dashboard-ipc.js:147] `_zaloLoginStartedAt` is initialized to `0` but only ever set; never read for any logic — remove or use.
18. [fb-publisher.js:20] `_postQueue` initialized to `Promise.resolve()` — add comment explaining the sequential queue pattern for code readers.
19. [gateway.js:973-1003] `scanForConnectFailure` function is defined inline inside `_startOpenClawImpl` — extract to module scope for readability.
20. [gateway.js:871-969] `scanForReadiness` function is 100 lines long, nested inside `_startOpenClawImpl` — extract to module scope.

## Dead Imports

21. [boot.js:11] `BrowserWindow` imported from electron but never used in boot.js — remove from destructure.
22. [chat.js:3] `rejectIfBooting` imported from `./gateway` — used. Confirm no dead path.
23. [cron.js:16] `call9Router` imported from `./nine-router` — only used in `generateWeeklySummary`. Confirm no dead path.
24. [cron.js:17] `fbSchedule` imported but only used for `registerRoutes` in cron-api — move import closer to usage.
25. [cron-api.js:4] `spawn` imported from `child_process` but never used — remove.
26. [cron-api.js:5] `execFilePromise` created but never used in cron-api.js — remove.
27. [dashboard-ipc.js:4] `spawn` imported from `child_process` — verify usage or remove.
28. [dashboard-ipc.js:5] `execFilePromise` created via promisify — verify usage or remove.
29. [dashboard-ipc.js:11] `ELECTRON_DIR` constant defined but scan for usage — if unused, remove.
30. [gateway.js:4] `execFile` imported but never called directly — only `execFilePromise` wrapper is used.
31. [gateway.js:5] `promisify` imported but only used once — inline `require('util').promisify`.
32. [dashboard-ipc.js:106-107] `ensureVisionFix`, `ensureVisionCatalogFix`, `ensureVisionSerializationFix`, `ensureWebFetchLocalhostFix`, `ensureOpenzcaFriendEventFix`, `ensureOpenclawPricingFix`, `ensureOpenclawPrewarmFix` imported but likely only used in gateway.js — verify and remove unused imports.
33. [channels.js:10] `findGlobalPackageFile` imported from boot.js — only used inside `getCachedZcaBin`. Confirm.
34. [license.js:10-11] `os` required at top but also `os.homedir()` used in `getMachineId` and other functions — consistent, no issue, but `require('fs')` and `require('path')` are redundantly required inside 6 functions.
35. [nine-router.js:6] `ctx` imported but only used for indirect references — verify all uses.

## Inconsistent Naming

36. [context.js] Field `ipcInFlightCount` uses camelCase but `appIsQuitting` also uses camelCase — consistent. But `startOpenClawInFlight` vs `gatewayRestartInFlight` — both consistent. No issue.
37. [channels.js:289] Pattern array uses `name` field as kebab-case (`'file-path-memory'`) — consistent throughout. Good.
38. [cron.js:36] Function `cronJournalPath` vs `getSchedulesPath` vs `getCustomCronsPath` — inconsistent prefix; `cronJournalPath` should be `getCronJournalPath` for consistency.
39. [fb-schedule.js:33] `getSchedulesPath()` name collides with `cron.js:getSchedulesPath()` — rename to `getFbSchedulesPath()` to avoid confusion when both are in scope.
40. [fb-publisher.js:15] `TIMESTAMP_FILE` is a path constant but uses ALL_CAPS — consistent with other constants. Fine.
41. [config.js:19] `KNOWN_BAD_ZALO_KEYS` is ALL_CAPS (constant) — consistent.
42. [gateway.js:49-60] Watchdog constants mix naming: `FW_INTERVAL_MS` (prefixed) vs `_fwGatewayFailCount` (underscore prefix) — document the convention: `FW_` = constants, `_fw` = mutable state.
43. [cron-api.js:17-18] `_cronApiServer`, `_cronApiPort`, `_cronApiToken` use underscore prefix for private — consistent. But `_fbPostApprovals` uses different domain prefix — rename to `_cronApiFbPostApprovals` or keep but document.
44. [workspace.js:36-37] `CURRENT_AGENTS_MD_VERSION` is a constant but `AGENTS_MD_VERSION_RE` is also a constant regex — both ALL_CAPS, consistent.
45. [channels.js:948] `ZALO_IMAGE_MEDIA_EXTS` is a Set constant in ALL_CAPS — consistent.
46. [util.js:3] `_atomicWriteCounter` uses underscore prefix for module private — matches convention in other files.
47. [nine-router.js:23-26] `PROVIDER_KEYS_PATH` is a function returning a path but named like a constant — rename to `getProviderKeysPath()`.
48. [nine-router.js:24] `RTK_DEFAULT_MARKER_PATH` same issue — rename to `getRtkDefaultMarkerPath()`.
49. [boot.js:14] `_cachedBin`, `_cachedNodeBin`, `_cachedOpenClawCliJs` use consistent `_cached*` pattern — good.
50. [license.js:87] `_cachedMachineId` — consistent with other caching patterns.

## Magic Numbers

51. [chat.js:11] `CHAT_HISTORY_MAX_BYTES = 512 * 1024` — already named, good. But `10 * 1024 * 1024` on line 31 is inline — extract to `MAX_DATA_URL_SIZE`.
52. [chat.js:34] `50` in `if (_dataUrlCache.size > 50)` — extract to `DATA_URL_CACHE_MAX_SIZE = 50`.
53. [chat.js:220] `3000` in rate limit check — extract to `CHAT_RATE_LIMIT_MS = 3000`.
54. [chat.js:221] `10000` in message length check — extract to `CHAT_MAX_MESSAGE_LENGTH = 10000`.
55. [chat.js:278-279] `90` seconds and `5000`ms wait — extract to `IMAGE_PICKUP_TIMEOUT_S = 90` and `IMAGE_PICKUP_POLL_MS = 5000`.
56. [chat.js:54] `10 * 60 * 1000` in `_pickupRecentImages` — extract to `IMAGE_PICKUP_MAX_WINDOW_MS = 10 * 60 * 1000`.
57. [channels.js:767] `ZALO_LISTENER_CACHE_TTL = 30000` — already named. Good.
58. [channels.js:636-642] Split logic uses `200` and `4000` as magic numbers — extract to `TELEGRAM_MAX_MSG_LENGTH = 4000` and `TELEGRAM_MIN_SPLIT_POS = 200`.
59. [channels.js:843] `ZALO_CHUNK = 2000` — already named. Good.
60. [channels.js:846] Inner split uses `200` three times as minimum position — extract to `ZALO_MIN_SPLIT_POS = 200`.
61. [cron.js:406-410] `600000` timeout, `3` max retries — extract to `CRON_AGENT_TIMEOUT_MS = 600000` and `CRON_AGENT_MAX_RETRIES = 3`.
62. [cron.js:456] Backoff uses `5000` and `2000` — extract to `CRON_TRANSIENT_BACKOFF_BASE_MS = 5000` and `CRON_DEFAULT_BACKOFF_BASE_MS = 2000`.
63. [gateway.js:114] `isGatewayAlive` default timeout `15000` — already parameterized. Good.
64. [gateway.js:346] Cold-boot orphan kill uses delays `[200, 500, 1000]` with counts `[10, 10, 10]` — extract to named constant `ORPHAN_KILL_DELAYS`.
65. [gateway.js:677] `240000` ms deadline for gateway ready — extract to `GATEWAY_READY_DEADLINE_MS = 240000`.
66. [gateway.js:846] `READY_NOTIFY_THROTTLE_MS = 30 * 60 * 1000` — already named. Good.
67. [gateway.js:1048] `BONJOUR_TTL_MS = 5 * 60 * 1000` — already named. Good.
68. [gateway.js:1350] `360000` boot grace period — extract to `WATCHDOG_BOOT_GRACE_MS = 360000`.
69. [license.js:51] `12000` timeout in sbFetch — extract to `SUPABASE_TIMEOUT_MS = 12000`.
70. [license.js:420] `REGISTRY_CACHE_TTL = 60 * 60 * 1000` — already named. Good.
71. [updates.js:40] `1024 * 1024` body cap — extract to `MAX_RELEASE_BODY_SIZE = 1024 * 1024`.
72. [config.js:697-699] `bootstrapMaxChars` set to `40000` — extract to `AGENTS_MD_BOOTSTRAP_MAX_CHARS = 40000`.
73. [cron-api.js:21] `FB_APPROVALS_MAX = 100` — already named. Good.
74. [fb-publisher.js:13] `MIN_POST_INTERVAL_MS = 10 * 60 * 1000` — already named. Good.
75. [fb-publisher.js:14] `JITTER_MAX_MS = 2 * 60 * 1000` — already named. Good.

## Duplicate Code

76. [boot.js:329-378 vs 381-423] `findOpenClawBin` (async) and `findOpenClawBinSync` share 90% identical candidate-building logic — extract shared candidate list to `_buildOpenClawBinCandidates()`.
77. [channels.js:109-132 vs 134-147] `persistStickyChatId` and `loadStickyChatId` both compute token fingerprint via `crypto.createHash('sha256')` — extract to `_tokenFingerprint(token)`.
78. [gateway.js:371-408 vs 1127-1157] Adopt-path marker+confirm pattern is duplicated for `telegram` and `zalo` in 3 separate places — extract to `_markChannelsAwaitingConfirmation()` and `_confirmChannelsAfterDelay()`.
79. [gateway.js:870-917 vs 919-968] Telegram readiness handler and Zalo readiness handler are nearly identical (same throttle/notify/confirm pattern) — extract to `_handleChannelReadiness(channel, marker)`.
80. [cron.js:698-712 vs 715-796] `buildMorningBriefingPrompt` and `buildEveningSummaryPrompt` share identical `extractConversationHistory` + template loading pattern — extract common setup to `_buildPromptWithHistory(templateName, timeStr, extras)`.
81. [cron-api.js:844-932 vs 933-999] Agent-mode and fixed-mode cron creation share validation logic (cronExpr, oneTimeAt, groupId resolution) — already partially shared via `normalizeCronScheduleSpec` and `resolveCronZaloTarget` but the outer validation is duplicated.
82. [license.js:92-105 vs 141-147] `getMachineId` and `licensePath` both compute `appData` path with identical platform logic — extract to shared `_getAppDataDir()` (note: `appDataDir()` exists in boot.js but license.js doesn't import it).
83. [channels.js:420-434 vs cron.js:153-161] Output filter check pattern (`for (const p of patterns) { if (p.re.test(text)) ... }`) is duplicated — `filterSensitiveOutput` already exists in channels.js; cron.js `_stripProcessAcks` is different enough.
84. [config.js:551-564 vs 641-658] `MODORO_ZALO_VALID_FIELDS` and `TELEGRAM_VALID_FIELDS` whitelist-strip loops are identical code with different field sets — extract to `_stripUnknownFields(obj, validSet, label)`.
85. [vendor-patches.js:30-49] `_patchFunctionReturnTrue` is a good example of dedup — extend this pattern to `ensureVisionFix` which has its own inline version of the same logic.

## Console.log Cleanup

86. [boot.js:340] `console.log('[findOpenClawBin] using bundled:', bundledMjs)` — downgrade to `console.debug` or guard behind verbose flag.
87. [boot.js:452] `console.log('[findNodeBin] using vendor node:', bundled)` — same, downgrade to debug.
88. [boot.js:477] `console.log('[findNodeBin] using:', p)` — same.
89. [boot.js:504-506] `console.log('[findOpenClawCliJs] using vendor openclaw:', bundled)` — same.
90. [config.js:447] `console.log('[config] modoro-zalo plugin not installed at', ...)` — fires every boot for fresh installs; downgrade to `console.debug`.
91. [config.js:849] `console.log('[config] openclaw.json patched (real change)')` — keep for audit trail but consider moving to audit log.
92. [config.js:850] `console.log('[config] openclaw.json unchanged on disk — skipping write')` — fires every boot; downgrade to debug.
93. [gateway.js:291] `console.log('[boot] T+0ms start9Router (parallel warmup)')` — keep (intentional boot trace).
94. [gateway.js:527-529] `console.log('[gateway] spawning via direct node:', ...)` and `console.warn('[gateway] direct node spawn unavailable...')` — keep.
95. [channels.js:615-616] `console.log('[sendTelegram] filter BYPASSED for system alert')` — downgrade to debug.
96. [cron.js:81-88] Self-test journal entries log version, profile, etc. — keep (intentional diagnostics).
97. [cron-api.js:607] `console.log('[cron-api] ${req.method} ${urlPath} channel=...')` — keep (request logging).
98. [nine-router.js:116] `console.log('[9router] Cleared stored password — login uses default 123456')` — keep (security-relevant).
99. [nine-router.js:163] `console.log('[9router] synced openclaw.json apiKey ← 9Router db.json ...')` — keep.
100. [license.js:196] `console.log('[license] Migrating license from workspace to APPDATA')` — keep.

## TODO/FIXME/HACK Comments

101. [workspace.js:23] `icon` field comment says "legacy field kept empty" — add `// TODO: remove icon field entirely in next schema version`.
102. [channels.js:236-244] `getTelegramConfigWithRecovery` has commented-out `getUpdates` recovery — add `// REMOVED: getUpdates recovery disabled to avoid 409 Conflict` instead of the vague "refusing" message.
103. [cron.js:477-483] `legacySchedulesPaths` and `legacyCustomCronsPaths` — add `// TODO: remove legacy migration after v2.5.0 when all users upgraded`.
104. [gateway.js:721-728] "Gateway agent warmup REMOVED" comment block is 7 lines — condense to 2-line comment.
105. [gateway.js:786-789] "Boot ping removed" comment — condense.
106. [gateway.js:810-815] Comment block about readiness markers — condense to 3 lines.
107. [config.js:565-572] Comment about `zcaBinary` — condense from 7 lines to 3.
108. [vendor-patches.js:178] Extremely long single-line injection string — split into readable multi-line.
109. [cron-api.js:549-553] Comment "Previous pattern: appended web_fetch instructions to prompt" — remove since the code is already clear.
110. [boot.js:96] Comment "// =====================================================================\n// Cross-platform helpers\n\n// ====..." has an empty line between dividers — clean up.

## Stale Comments

111. [boot.js:807-811] Comment says "CLI SHIMS — removed in pure runtime model" but section header duplicates — remove the second header line.
112. [config.js:484] Comment mentions "bundled copy placed them there" — update to reflect v2.4.0+ runtime install model.
113. [gateway.js:262-265] Comment says `opts.silent === true suppresses... "Telegram da san sang"` — the message was removed (line 789 says "Boot ping removed"). Update comment.
114. [gateway.js:835] Comment says "9BizClaw PATCH" but this is the normal code now — remove "PATCH" label since it's permanent code.
115. [channels.js:599] Comment about "strip Telegram Markdown v1 syntax" — the logic on line 633 does this. Comment is accurate.
116. [cron.js:195-210] Comment block about `buildAgentArgs` — accurate but verbose. Condense.
117. [config.js:728] Comment says `tools.allow verified in openclaw 2026.4.x runtime-schema` — update version reference if newer version confirmed.

## Missing JSDoc

118. [boot.js:35] `getBundledVendorDir()` — add `@returns {string|null}` JSDoc.
119. [boot.js:59] `ensureVendorExtracted()` — add `@deprecated Pure runtime model — this is a stub` JSDoc.
120. [boot.js:66] `getBundledNodeBin()` — add `@returns {string|null}` JSDoc.
121. [boot.js:107] `enumerateNodeManagerBinDirs()` — add `@returns {string[]}` JSDoc.
122. [boot.js:329] `findOpenClawBin()` — add `@returns {Promise<string|null>}` JSDoc.
123. [boot.js:447] `findNodeBin()` — add `@returns {string|null}` JSDoc.
124. [boot.js:556] `spawnOpenClawSafe()` — has inline JSDoc-like comment but no actual `@param`/`@returns` tags.
125. [channels.js:47] `sendCeoAlert(text)` — add `@param {string} text` and `@returns {Promise<boolean>}`.
126. [channels.js:420] `filterSensitiveOutput(text)` — add `@param {string} text` and `@returns {{ blocked: boolean, text: string, pattern?: string }}`.
127. [channels.js:600] `sendTelegram(text, opts)` — add full JSDoc with `@param` for opts.
128. [config.js:60] `parseUnrecognizedKeyErrors(stderr)` — add `@param {string} stderr` and `@returns {Array<{path: string[]|null, key: string|null}>}`.
129. [config.js:108] `healOpenClawConfigInline(errStderr)` — add `@param {string} [errStderr]` and `@returns {boolean}`.
130. [config.js:291] `writeOpenClawConfigIfChanged(configPath, config)` — add JSDoc.
131. [config.js:335] `ensureDefaultConfig()` — add `@returns {Promise<void>}`.
132. [gateway.js:114] `isGatewayAlive(timeoutMs)` — add `@param {number} [timeoutMs=15000]` and `@returns {Promise<boolean>}`.
133. [gateway.js:196] `startOpenClaw(opts)` — add `@param {{ silent?: boolean, ignoreCooldown?: boolean }} opts`.
134. [gateway.js:1206] `stopOpenClaw()` — add `@returns {Promise<void>}`.
135. [cron.js:52] `selfTestOpenClawAgent()` — add `@returns {Promise<void>}`.
136. [cron.js:124] `parseAgentJsonOutput(stdout)` — add `@param {string} stdout` and `@returns {{ text: string, mediaUrls: string[] } | null}`.
137. [cron.js:324] `runCronAgentPrompt(prompt, opts)` — add full JSDoc.
138. [license.js:89] `getMachineId()` — add `@returns {string}`.
139. [license.js:211] `verifyLicenseKey(keyStr)` — add `@param {string} keyStr` and `@returns {{ valid: boolean, payload?: object, error?: string }}`.
140. [util.js:5] `isPathSafe(baseDir, filename)` — add `@param {string} baseDir` `@param {string} filename` `@returns {boolean}`.
141. [util.js:13] `writeJsonAtomic(filePath, data)` — add `@param {string} filePath` `@param {*} data` `@returns {boolean}`.
142. [util.js:54] `tokenizeShellish(command)` — add `@param {string} command` `@returns {string[]|null}`.

## Long Functions (>50 lines)

143. [config.js:335-879] `ensureDefaultConfig` is ~540 lines (including the lock wrapper) — split into sub-functions: `_healLegacyKeys()`, `_ensureTelegramConfig()`, `_ensureModoroZaloConfig()`, `_ensureToolsConfig()`, `_ensureAgentsConfig()`.
144. [gateway.js:261-1191] `_startOpenClawImpl` is ~930 lines — split into: `_boot9Router()`, `_applyVendorPatches()`, `_waitFor9RouterReady()`, `_spawnGateway()`, `_waitForGatewayReady()`, `_setupReadinessObservers()`, `_setupExitHandler()`.
145. [cron-api.js:599-end] The HTTP server handler is one massive function — already partially split with `withWriteLock` etc., but individual route handlers should be extracted to named functions.
146. [channels.js:782-946] `sendZaloTo` is ~165 lines — extract `_splitZaloMessage(text)` and `_sendSingleZaloChunk(chunk, ...)`.
147. [cron.js:334-466] `_runCronAgentPromptImpl` is ~130 lines — extract `_handleExecMode(prompt, label)` (already partially done) and `_runAgentWithRetry(args, label, ...)`.
148. [cron.js:715-796] `buildEveningSummaryPrompt` is ~80 lines — extract `_loadMemoryInsights()` and `_loadKnowledgeGaps()`.
149. [cron.js:798-866] `buildAfternoonNudgePrompt` is ~70 lines — extract `_loadPendingFollowUps()` and `_loadOverduePayments()`.
150. [conversation.js:68-200+] `_extractConversationHistoryImpl` is ~130+ lines — extract `_readSessionFile(filePath, sinceMs)` and `_parseSessionEvents(content, channels)`.

## Deep Nesting

151. [config.js:370-392] Sticky Zalo config restore has 4 levels of nesting (`try { if { if { if { ... } } } }`) — use early returns.
152. [config.js:439-477] Modoro-zalo migration block nests 4 levels (`if (_mzPluginInstalled) { if (...openzalo) { if (!..modoro-zalo) { ... } } }`) — use early returns.
153. [gateway.js:340-366] Cold-boot orphan kill: `if (!global._coldBootDone) { if (orphan) { ... for (const delay of delays) { if (!(await ...)) { ... break; } } } }` — extract to `_killOrphanGateway()`.
154. [gateway.js:688-713] Gateway ready probe loop has `while { try { if (await ...) { ... break; } } catch {} ... }` — the `try/catch` is inside the while, which is correct but could use early-return in a named function.
155. [cron-api.js:844-932] Agent mode creation nests `if (isAgentMode) { if (cronExpr) { ... } if (oneTimeAt) { ... } ... return await withWriteLock(async () => { ... }) }` — extract validation to separate function.
156. [channels.js:870-920] `sendOneChunk` inner function has try-catch wrapping spawn with nested event handlers — extract spawn logic to `_spawnOpenzcaSend(...)`.
157. [cron.js:718-783] Evening prompt builder nests: `try { if (ws) { const memDir = ...; if (existsSync) { for (const f of files) { try { ... if (ageH < 48) { ... } } catch {} } } } } catch {}` — extract to `_recentZaloUserActivity()`.
158. [conversation.js:92-128] File reading logic nests: `try { if (file.size > 65536) { const fd = ...; try { ... } finally { ... } } else { ... } } catch { continue; }` — extract to `_readSessionFileTail(filePath, size)`.
159. [config.js:508-573] Modoro-zalo field healing has: `if (config.channels && config.channels['modoro-zalo']) { const oz = ...; if (...) { ... } for (const k of ...) { if (...) { ... } } ... }` — extract to `_healModoroZaloConfig(oz)`.
160. [boot.js:113-133] nvm enumeration nests: `try { for (const root of nvmRoots) { if (!fs.existsSync) continue; const versions = fs.readdirSync(...).filter(...).sort(...); for (const v of versions) { dirs.push(...); } } } catch {}` — acceptable depth but add a comment.

## Inconsistent Error Patterns

161. [config.js:115] `healOpenClawConfigInline` catches parse errors and logs to console.error then returns false — consistent.
162. [config.js:329] `writeOpenClawConfigIfChanged` catches errors and logs to console.error then returns false — consistent with heal.
163. [config.js:869-878] `ensureDefaultConfig` error handler logs to console.error AND appends to disk file — good, but pattern differs from `writeOpenClawConfigIfChanged` which only logs.
164. [channels.js:51-54] `sendCeoAlert` catches error and logs `console.error` — consistent.
165. [channels.js:56-65] `sendCeoAlert` failure writes to disk file — consistent with config error handler.
166. [license.js:234-236] `verifyLicenseKey` catches all errors and returns `{ valid: false, error: 'invalid_key' }` — swallows actual error message. Add `detail: e.message` for debugging.
167. [cron.js:62-65] `selfTestOpenClawAgent` catches spawn error and wraps in `{ code: -1, ... }` — consistent with spawnOpenClawSafe.
168. [gateway.js:592-593] spawn error in `spawnOpenClawSafe` returns `{ code: -1, ... }` — consistent.
169. [boot.js:50] `getBundledVendorDir` catch swallows error silently — inconsistent with other functions that log. Add optional debug log.
170. [util.js:28-36] `writeJsonAtomic` rename-fail fallback uses `copyFile+unlink` — good pattern, but the inner error message references `logToFile` which doesn't exist — remove the dead reference.

## Unused Exports

171. [boot.js:825] `resolveBinAbsolute` exported but only used internally by boot.js — move to private, remove from exports.
172. [boot.js:826] `findBundledOpenClawMjs` exported but is a duplicate of `getBundledOpenClawCliJs` — remove one.
173. [gateway.js:1507-1510] `ensureVisionFix`, `ensureVisionCatalogFix`, `ensureVisionSerializationFix`, `ensureWebFetchLocalhostFix`, `ensureOpenzcaFriendEventFix`, `ensureOpenclawPricingFix`, `ensureOpenclawPrewarmFix` exported — verify if any external caller uses them directly. If only `_startOpenClawImpl` calls them, remove from exports.
174. [gateway.js:1515] `fastWatchdogTick` exported — verify if called externally. If only `startFastWatchdog` calls it via interval, remove from exports.
175. [gateway.js:1518] `_startOpenClawImpl` exported with underscore prefix — unusual. Either make it a true private or remove underscore.
176. [config.js:883] `isValidConfigKey` exported but search codebase for callers — if unused externally, remove from exports.
177. [config.js:884] `sanitizeOpenClawConfigInPlace` exported — only called by `writeOpenClawConfigIfChanged` internally. Remove from exports unless tests use it.
178. [channels.js] `clearCachedZcaBin` exported (line 39) — verify if any external caller uses it.
179. [cron.js] `parseAgentJsonOutput` — verify if imported by other modules or only used internally.
180. [boot.js:836] `npmGlobalModules` exported — verify usage. May only be used by `findGlobalPackageFile`.

## Hardcoded Paths

181. [boot.js:234] `'C:\\Program Files\\nodejs'` hardcoded — already in `enumerateNodeManagerBinDirs`, but also appears in gateway.js line 582. Deduplicate via the enumeration function.
182. [boot.js:361] `path.join(ctx.HOME, '.openclaw', 'bin', ...)` — extract to `_openclawLegacyBinDir()`.
183. [nine-router.js:101] `path.join(appDataDir(), '9router', 'db.json')` appears in 5+ functions — extract to `get9RouterDbPath()`.
184. [nine-router.js:145] `path.join(require('os').homedir(), '.openclaw', 'openclaw.json')` — use `ctx.HOME` instead of `require('os').homedir()` for consistency.
185. [config.js:110] `path.join(ctx.HOME, '.openclaw', 'openclaw.json')` appears in many functions — extract to `getOpenClawConfigPath()`.
186. [config.js:342] Same path repeated — would benefit from the constant.
187. [channels.js:217] Same path repeated — would benefit from the constant.
188. [channels.js:488] Same path repeated.
189. [gateway.js:1393] Same path repeated.
190. [gateway.js:1455] Same path repeated.
191. [fb-publisher.js:15-17] `TIMESTAMP_FILE` computation inline — extract platform logic to use `appDataDir()` from boot.js.
192. [license.js:93-95] `appData` computed inline — import `appDataDir()` from boot.js instead.
193. [license.js:142-144] Same inline `appData` computation duplicated.
194. [license.js:176-179] Same inline `appData` computation in `migrateWorkspaceLicense`.

## Inconsistent Async Patterns

195. [channels.js:600-701] `sendTelegram` uses callback-style `doRequest` with nested Promise — could be simplified with async/await.
196. [channels.js:703-752] `sendTelegramPhoto` uses callback-style Promise — could be simplified with async/await.
197. [gateway.js:114-129] `isGatewayAlive` uses callback-style `http.get` wrapped in Promise — could use async/await with a helper.
198. [gateway.js:436-456] 9Router ready probe uses callback-style `http.get` in Promise — same pattern repeated. Extract to `_httpGetJson(url, timeoutMs)`.
199. [gateway.js:1453-1481] `triggerGatewayMessage` uses callback-style `http.request` — same pattern.
200. [cron-api.js:401-462] `parseBody` uses callback-style req event handlers — acceptable for HTTP parsing.
201. [license.js:24-55] `sbFetch` uses callback-style `https.request` — could use Node 18+ `fetch` or extract to common HTTP helper.
202. [updates.js:24-84] `checkForUpdates` uses callback-style `https.get` — same.
203. [fb-publisher.js:47-87] `graphRequest` uses callback-style `https.request` — same.
204. [nine-router.js:80-91] `get9RouterCliToken` is sync but calls `machineIdSync` — consistent (intentionally sync).
205. [boot.js:425-440] `runOpenClaw` is properly async with await — good.

## Additional Quality Issues

### Regex Safety

206. [channels.js:289-412] The `_outputFilterPatterns` array has 60+ compiled regexes — add a startup self-test that verifies none throw on empty string (protects against ReDoS from future regex changes).
207. [channels.js:358] `no-vietnamese-diacritic` regex is very complex — add a comment explaining the negative lookahead strategy.
208. [cron.js:149-151] Three regex patterns (`_processAckLineRe`, `_processStatusLineRe`, `_bareAckLineRe`) — add test cases in a comment showing what they match/don't match.

### Error Message Quality

209. [boot.js:479] `console.error('[findNodeBin] FAILED — no Node binary found in any candidate location')` — add suggestion: "Install Node.js or check PATH".
210. [gateway.js:278-280] `'OpenClaw khong tim thay.'` error — use proper Vietnamese diacritics: `'OpenClaw khong tim thay.'` should be `'OpenClaw khong tim thay.'` — wait, it's already correct in the code as `'OpenClaw không tìm thấy.'`.
211. [cron.js:387-389] Error message about cron delivery failure writes to `cron-cannot-deliver.txt` — the message is good but could include the cron label for easier debugging.

### Type Safety

212. [context.js:4-20] `ctx` object has no TypeScript types — add a `@typedef` JSDoc block documenting all fields and their types.
213. [config.js:256] `withOpenClawConfigLock` takes `fn` and `timeoutMs` but no type annotations — add JSDoc `@param`.
214. [channels.js:782] `sendZaloTo` takes `target` which can be string or object — add JSDoc `@param {string|{id:string, isGroup:boolean}} target`.

### Defensive Coding

215. [util.js:33] Reference to `logToFile` function that doesn't exist — remove the `try { if (typeof logToFile === 'function') logToFile(msg); } catch {}` dead code.
216. [channels.js:424] `filterSensitiveOutput` returns random safe message — seed the random selection for reproducibility in tests.
217. [config.js:806] `validKeys` whitelist for top-level openclaw.json keys — add comment noting this must be updated when openclaw adds new top-level keys.
218. [gateway.js:1264-1267] `_fwCanRestart` prunes timestamps inline — this mutates `_fwRestartTimestamps` as a side effect of a read function. Move pruning to the tick function.

### Code Organization

219. [channels.js] File is 1000+ lines covering send functions, output filter, pause, config, readiness probes — consider splitting into `channels-send.js`, `channels-filter.js`, `channels-pause.js`.
220. [cron.js] File is 1000+ lines covering agent pipeline, schedule loading, prompt builders, journal — consider splitting into `cron-agent.js`, `cron-schedules.js`, `cron-prompts.js`.
221. [config.js] `ensureDefaultConfig` alone is 540 lines — the function should be broken into clearly named sub-functions even if they stay in the same file.

### Logging Consistency

222. [boot.js] Uses `[findNodeBin]`, `[findOpenClawBin]`, `[findOpenClawBinSync]` etc. as log prefixes — consistent.
223. [channels.js] Uses `[sendTelegram]`, `[sendZaloTo]`, `[pause]` — consistent.
224. [config.js] Uses `[config]`, `[heal-inline]`, `[config-lock]` — mostly consistent.
225. [gateway.js] Uses `[boot]`, `[startOpenClaw]`, `[gateway]`, `[fast-watchdog]`, `[restart-guard]`, `[ready-notify]` — many different prefixes. Document the prefix convention.
226. [cron.js] Uses `[cron-agent]`, `[cron-journal]`, `[cron-exec]` — consistent.
227. [license.js] Uses `[license]` — consistent.
228. [nine-router.js] Uses `[9router]`, `[provider-keys]` — consistent.

### Send.ts (modoro-zalo)

229. [send.ts:41] `isHttpUrl` function — add `@param {string} value @returns {boolean}` TSDoc.
230. [send.ts:45] `stripMediaPrefix` function — add TSDoc.
231. [send.ts:49] `expandHomePath` function — add TSDoc.
232. [send.ts:63-69] `resolveStateDir` reads both `OPENCLAW_STATE_DIR` and `CLAWDBOT_STATE_DIR` env vars — add comment explaining the legacy fallback.
233. [send.ts:100-115] `isPathInsideRoot` has platform-specific Windows lowercase comparison — add comment explaining why this is needed.

### Inbound.ts (modoro-zalo)

234. [inbound.ts:12-36] `__mcReadGroupSettings` global function uses `(global as any)` cast — add a `declare global` block instead.
235. [inbound.ts:44-66] `__mcReadUserSettings` global function — same `(global as any)` issue. Use `declare global`.
236. [inbound.ts:12-66] Both global helpers share 90% identical path-resolution logic — extract to a shared `__mcReadJsonConfig(filename)` helper.
237. [inbound.ts:119] `CHANNEL_ID` constant — already good.
238. [inbound.ts:120-123] `DEFAULT_GROUP_SYSTEM_PROMPT` is a hardcoded English string — add comment noting this is intentionally English (for LLM context, not user-facing).

### Preload.js

239. [preload.js:3-10] First 8 API entries have no grouping comment — add section comments matching the pattern used later (e.g., `// Config`, `// Cron`).
240. [preload.js:58-63] Google section comment is empty (`// Google`) followed by OpenClaw installation — add proper section header.
241. [preload.js:76-81] `onCustomCronsUpdated` and `onSchedulesUpdated` use `removeAllListeners` pattern — add comment explaining why (hot-reload stacking prevention, per CRIT #10).

### Util.js

242. [util.js:97-116] `sanitizeZaloText` strips ALL emoji via massive Unicode range regex — add comment documenting this is intentional per brand guidelines (no cheap emojis).
243. [util.js:112-113] Zero-width character strip regex — add named comment: `// Strip zero-width spaces, joiners, RLO/LRO bidi overrides`.
244. [util.js:54-95] `tokenizeShellish` returns `null` on unclosed quote — document this in JSDoc.

### Vendor Patches

245. [vendor-patches.js:12-21] `_logPatchFailure` writes to `~/.openclaw/logs/patch-failures.log` — use `getWorkspace()` if available for consistency.
246. [vendor-patches.js:57-85] `ensureVisionFix` has both V1 and V2 marker logic — remove V1 upgrade path if all users are on V2+.
247. [vendor-patches.js:148-200] `ensureWebFetchLocalhostFix` has 3 parts in one function — split into `_patchSsrfAllowLocalhost()`, `_patchLocalhostNowrap()`, `_patchLocalhostAuth()`.

### Updates.js

248. [updates.js:9] `_latestRelease` cached but never invalidated — add TTL or explicit invalidation in `checkForUpdates`.
249. [updates.js:10] `_updateDownloadInFlight` concurrency guard — good pattern but add JSDoc explaining it prevents double-download.
250. [updates.js:102-172] `followRedirect` function inside `downloadUpdate` — extract to module scope as `_followHttpsRedirect(url, redirectCount, dest)` for testability.
