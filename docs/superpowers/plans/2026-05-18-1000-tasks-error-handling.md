# Error Handling — 250 Micro Tasks
Each task is 2-5 minutes, additive only, zero breaking risk.

---

## Category 1: Empty catch blocks (add console.warn)

1. [main.js:23 — mkdirSync singleton log dir] — `catch {}` silently swallows mkdir failure for singleton-blocked.log. Add `catch (e) { /* singleton log dir — non-critical */ }` comment or `console.warn('[singleton] log dir mkdirSync:', e?.message)`.

2. [main.js:24 — appendFileSync singleton log] — `catch {}` on appendFileSync. Add `catch (e) { /* best-effort singleton log */ }` so developers understand this is intentional.

3. [main.js:58 — mkdirSync logsDir in initFileLogger] — `catch {}` when creating logs directory. Add `console.warn('[initFileLogger] mkdirSync failed:', e?.message)` so log path failures are visible in stdout.

4. [main.js:64 — unlinkSync old log rotation] — `catch {}` when removing old main.log.1. Add catch message: path permission issue would silently accumulate stale logs.

5. [main.js:65 — renameSync log rotation] — `catch {}` when rotating main.log to main.log.1. Log rotation failure leaves both files; add `console.warn('[log-rotate] rename failed:', e?.message)`.

6. [main.js:67 — outer catch on log rotation block] — Outer `catch {}` around the entire rotation block. Add warning so log rotation problems are detectable.

7. [main.js:85 — writeLine catch in logger] — `catch {}` inside the writeLine function that writes to log stream. Add minimal `console.error('[log-write] failed')` to stderr only (avoid recursion).

8. [main.js:316 — loadAppPrefs catch] — `try { startMinimized = !!loadAppPrefs().startMinimized; } catch {}` silently defaults to false. Add `console.warn('[createWindow] loadAppPrefs failed:', e?.message)`.

9. [main.js:319 — mainWindow.hide catch] — `catch {}` on `ctx.mainWindow.hide()`. Add `console.warn('[createWindow] hide failed:', e?.message)`.

10. [main.js:353 — setChannelPermanentPause catch] — `catch {}` on setting Zalo permanent pause during fresh install. Add `console.warn('[createWindow] setChannelPermanentPause failed:', e?.message)`.

11. [main.js:374 — checkZaloCookieAge catch] — `catch {}` in setTimeout callback. Add `console.warn('[boot] checkZaloCookieAge error:', e?.message)`.

12. [main.js:377 — seedZaloCustomersFromCache catch] — `catch {}` in delayed re-seed. Add `console.warn('[boot] seedZaloCustomers re-seed error:', e?.message)`.

13. [main.js:423 — global.__tray assignment catch] — `catch {}` on `global.__tray = ctx.tray`. Add comment explaining why this can fail (test environments).

14. [main.js:601 — writeFileSync marker catch] — `catch {}` when writing wizard setup marker file. Add `console.warn('[wizard] marker write failed:', e?.message)`.

15. [main.js:686 — splash-minimize catch] — `catch {}` on `splashWindow.minimize()`. Add `console.warn('[splash] minimize failed:', e?.message)`.

16. [main.js:700 — app.exit catch in splash cancel] — `catch {}` on `app.exit(0)` in splash cancel timer. Add `console.error('[splash] app.exit failed:', e?.message)`.

17. [main.js:708 — splashWindow.destroy catch] — `catch {}` on destroying splash window. Add `console.warn('[splash] destroy failed:', e?.message)`.

18. [main.js:790 — mainWindow.show catch] — `catch {}` on `ctx.mainWindow.show()` after splash closes. Add `console.warn('[splash] mainWindow.show failed:', e?.message)`.

19. [main.js:845 — auditLog preflight catch] — `catch {}` on audit logging critical preflight failures. Add `console.warn('[preflight] audit write failed:', e?.message)`.

20. [main.js:929 — auditLog system_resume catch] — `catch {}` on audit logging system resume. Add `console.warn('[resume] audit write failed:', e?.message)`.

21. [main.js:971 — auditLog system_suspend catch] — `catch {}` on audit logging system suspend. Add `console.warn('[suspend] audit write failed:', e?.message)`.

22. [main.js:983 — ensureKnowledgeFolders catch] — `catch {}` on ensuring knowledge folders in app.whenReady. Add `console.warn('[boot] ensureKnowledgeFolders error:', e?.message)`.

23. [main.js:1026 — auditLog app_boot catch] — `catch {}` on audit logging app boot. Add `console.warn('[boot] audit log failed:', e?.message)`.

24. [main.js:1057 — clearInterval retentionTimer catch] — `catch {}` when clearing retention timer. Add `console.warn('[cleanup] retention timer clear failed:', e?.message)`.

25. [boot.js:50 — getBundledVendorDir catch] — `catch {}` when accessing vendor dir. Add `console.warn('[boot] getBundledVendorDir error:', e?.message)`.

26. [boot.js:76 — getBundledNodeBin catch] — `catch {}` when checking bundled node binary. Add `console.warn('[boot] getBundledNodeBin error:', e?.message)`.

27. [boot.js:133 — nvm enumeration catch] — `catch {}` when enumerating nvm versions. Add `console.warn('[findNodeBin] nvm scan error:', e?.message)`.

28. [boot.js:139 — volta enumeration catch] — `catch {}` when checking volta bin. Add `console.warn('[findNodeBin] volta scan error:', e?.message)`.

29. [boot.js:290 — augmentPathWithBundledNode catch] — `catch {}` on path augmentation. Add `console.warn('[boot] augmentPath error:', e?.message)`.

30. [boot.js:597 — child.kill SIGTERM catch in spawnOpenClawSafe] — `catch {}` when killing child process on timeout. Add `console.warn('[spawn] SIGTERM failed:', e?.message)`.

31. [vendor-patches.js:20 — _logPatchFailure inner catch] — `catch {}` when writing to patch-failures.log. This is the error logger's own error handler — add `/* meta-failure: can't log patch failure */` comment for clarity.

32. [ceo-nudge.js:37 — statSync auditPath catch] — `catch {}` when checking audit file size. Add `console.warn('[nudge-watcher] stat error:', e?.message)`.

33. [ceo-nudge.js:64 — JSON.parse line catch in watcher] — `catch {}` when parsing individual audit log lines. Add `/* skip malformed audit line */` comment.

34. [ceo-nudge.js:66 — outer interval catch] — `catch {}` on the entire watcher interval body. Add `console.warn('[nudge-watcher] tick error:', e?.message)`.

35. [ceo-memory.js:287 — db.close catch] — `catch {}` when closing better-sqlite3 database. Add `console.warn('[ceo-memory] db close error:', e?.message)`.

## Category 2: Missing try/catch on async operations

36. [gateway.js:318 — syncAllBootstrapData] — `syncAllBootstrapData()` at line ~318 is called without try/catch. If persona module throws, entire boot sequence aborts. Wrap in try/catch with console.error.

37. [gateway.js:273 — purgeAgentSessions] — `purgeAgentSessions('startOpenClaw')` called without try/catch in `_startOpenClawImpl`. Could throw if sessions dir is locked.

38. [channels.js:112 — persistStickyChatId crypto import] — `require('crypto').createHash()` inside persistStickyChatId could throw if crypto module is corrupted. Already in try/catch at outer level but inner `require` is unguarded.

39. [cron.js:377 — selfTestOpenClawAgent await] — `await selfTestOpenClawAgent()` in `_runCronAgentPromptImpl` is not wrapped in try/catch. If the self-test promise rejects unexpectedly, the entire cron run fails. Add try/catch around the await.

40. [dashboard-ipc.js:173 — start9Router IPC] — `start9Router()` in the IPC handler is synchronous but can throw. The outer try/catch covers it, but the `await new Promise(r => setTimeout(r, 2000))` has no individual catch for timer failures.

41. [fb-schedule.js:774 — _sendTelegram fire-and-forget] — `_sendTelegram(...)` called with `.catch(() => {})`. Replace with `.catch(e => console.warn('[fb-schedule] notify error:', e?.message))`.

42. [channels.js:569 — fs.unlinkSync in resumeChannel] — `try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}` — add `catch (e) { console.warn('[pause] resume unlink failed:', e?.message); }`.

43. [follow-up.js:70 — runCronAgentPrompt await] — `await _runCronAgentPrompt(prompt, ...)` is inside try/catch but the catch sets `firedAt = 'error:...'` and continues. No CEO alert on follow-up fire failure. Add `sendCeoAlert` on failure.

44. [cron-api.js:116 — startCronApi require('node-cron')] — `require('node-cron')` at the top of `startCronApi()` could throw if the module is missing. Already inside the function body — add explicit error message.

45. [chat.js:248 — spawnOpenClawSafe in sendChatMessage] — The spawn call has a try/catch but `_chatAbortController.abort()` at line 238 has only `try { ... } catch {}`. Add warning log.

46. [escalation.js:23 — fs.renameSync in processEscalationQueue] — `try { fs.renameSync(queueFile, tmpFile); } catch { return; }` — silent return on rename failure means escalations are lost if file is locked. Add `console.warn('[escalation] rename failed — will retry next tick:', e?.message)`.

47. [main.js:980 — ensureZaloPlugin fire-and-forget] — `ensureZaloPlugin().catch(() => {})` in app.whenReady. Replace with `.catch(e => console.warn('[boot] ensureZaloPlugin late error:', e?.message))`.

48. [fb-publisher.js:213 — _postQueue catch] — `_postQueue = job.catch(() => {})` swallows post queue errors. Replace with `.catch(e => console.error('[fb-publisher] queue error:', e?.message))`.

49. [config.js:269 — _openClawConfigMutex catch] — `_openClawConfigMutex.then(() => fnResult).catch(() => {})` swallows mutex errors. Replace with `.catch(e => console.warn('[config-lock] mutex chain error:', e?.message))`.

50. [appointments.js:264 — apptDispatcherTick fire-and-forget] — `.catch(() => {})` on `apptDispatcherTick()`. Replace with `.catch(e => console.warn('[appointments] tick error:', e?.message))`.

## Category 3: Missing null checks

51. [channels.js:59 — getWorkspace() in sendCeoAlert] — `getWorkspace()` could return null if workspace isn't initialized yet. `path.join(null, 'logs')` throws TypeError. Add null check before path.join.

52. [channels.js:441 — _getPausePath null workspace] — `getWorkspace()` can return null, making `_getPausePath` return null. Callers like `isChannelPaused` check for null, but `pauseChannel` doesn't check the return of `_getPausePath` before calling `writeJsonAtomic`. Add guard.

53. [cron.js:37 — cronJournalPath getWorkspace] — `getWorkspace()` in `cronJournalPath()` could return null. `path.join(null, 'logs', 'cron-runs.jsonl')` would throw. Add null guard.

54. [cron.js:473 — getSchedulesPath getWorkspace] — Same pattern: `getWorkspace()` null check needed.

55. [chat.js:81 — _getChatHistoryPath null ws] — `getWorkspace()` returns null → `path.join(null, 'logs')` throws. Returns null correctly but the `try { fs.mkdirSync(...) }` on line 85 would still throw on null base. Already handled by the null check, but add explicit comment.

56. [channels.js:217 — getTelegramConfig config parsing] — `config?.channels?.telegram?.botToken` — if `fs.readFileSync` returns empty string, `JSON.parse('')` throws. Outer catch returns `{}` which is correct, but add specific empty-file check.

57. [gateway.js:276 — findOpenClawBin null check] — `await findOpenClawBin()` returns null when bin not found. The subsequent code sends bot-status error but doesn't return early in all paths. Verify the `return` statement covers all branches.

58. [cron.js:599 — loadDailySummaries getWorkspace] — `getWorkspace()` in `loadDailySummaries` could return null. Add null guard with early return of empty array.

59. [dashboard-ipc.js:886 — JSON.parse readFileSync] — `JSON.parse(fs.readFileSync(p, 'utf-8'))` — if file exists but is empty, JSON.parse throws. Wrap in try/catch.

60. [knowledge.js:70 — getDocumentsDir getWorkspace] — `getWorkspace()` null → `path.join(null, 'documents')` throws. Add null guard.

61. [follow-up.js:26 — getFollowUpQueuePath getWorkspace] — `getWorkspace()` null → `path.join(null, 'follow-up-queue.json')` throws. Add null guard.

62. [fb-schedule.js:33 — getSchedulesPath getWorkspace] — Same null workspace pattern. Add guard.

63. [escalation.js:19 — getWorkspace in processEscalationQueue] — `getWorkspace()` null → `path.join(null, 'logs', 'escalation-queue.jsonl')` throws. Add null guard with early return.

64. [image-gen.js:66 — resolveAssetPath null brandAssetsDir] — `resolveAssetPath(brandAssetsDir, name)` where brandAssetsDir could be null if `getBrandAssetsDir()` returns null workspace. Add null check.

65. [workspace.js:150 — readFbConfig JSON.parse] — `JSON.parse(raw)` could fail on empty file. Already caught by outer catch, but the decryption attempt on line 158 accesses `cfg.accessToken` — verify cfg is always an object after parse.

## Category 4: Missing IPC error handling

66. [dashboard-ipc.js:764 — setup-zalo handler] — `ipcMain.handle('setup-zalo', ...)` — verify the entire handler body is wrapped in try/catch. If spawn fails, IPC would reject without a user-friendly message.

67. [dashboard-ipc.js:863 — get-zalo-mode handler] — No try/catch wrapping. If `fs.readFileSync` fails on the mode file, the IPC rejects with a raw Error. Wrap and return `{ error: ... }`.

68. [dashboard-ipc.js:880 — get-shop-state handler] — No try/catch visible. Add try/catch returning `{ error: e.message }` on failure.

69. [dashboard-ipc.js:918 — get-persona-mix handler] — Reads persona config file. Missing try/catch for file read failure. Add error envelope.

70. [dashboard-ipc.js:1066 — list-zalo-user-memories handler] — Reads memory directory. If dir doesn't exist, `fs.readdirSync` throws. Add try/catch with empty array fallback.

71. [dashboard-ipc.js:1098 — read-zalo-user-memory handler] — `senderId` parameter not validated. Could be undefined/null/empty. Add `if (!senderId) return { error: 'senderId required' }`.

72. [dashboard-ipc.js:1115 — reset-zalo-user-memory handler] — Same missing senderId validation.

73. [dashboard-ipc.js:1136 — append-zalo-user-note handler] — Missing validation for both `senderId` and `note` parameters. Add null/empty checks.

74. [dashboard-ipc.js:1166 — delete-zalo-user-note handler] — Missing validation for `senderId` and `noteTimestamp`.

75. [dashboard-ipc.js:2282 — add-cron handler] — Missing input validation for `name`, `cron`, `message` fields. Add minimum length checks.

76. [dashboard-ipc.js:2714 — check-telegram-ready handler] — `async () => probeTelegramReady()` — no try/catch. If probe throws, IPC rejects with raw error. Wrap in try/catch returning `{ ready: false, error: e.message }`.

77. [dashboard-ipc.js:2715 — check-zalo-ready handler] — Same pattern as above. Add try/catch.

78. [dashboard-ipc.js:3208 — upload-knowledge-file handler] — Missing validation for `category` parameter against KNOWLEDGE_CATEGORIES whitelist. Malicious category could create arbitrary directories.

79. [dashboard-ipc.js:3434 — delete-knowledge-file handler] — Missing validation that `filename` doesn't contain path traversal characters (`..`, `/`, `\`).

80. [dashboard-ipc.js:3745 — test-telegram handler] — Missing validation for `token` format (should start with digits and contain `:`) and `chatId` (should be numeric string).

## Category 5: Missing timeout on async operations

81. [channels.js:174-209 — recoverChatIdFromTelegram] — HTTPS request has `timeout: 5000` but no AbortController. If the server sends data extremely slowly, the request could hang. Add `setTimeout(() => req.destroy(), 10000)` as a hard cap.

82. [gateway.js:123 — isGatewayAlive HTTP probe] — HTTP GET has configurable timeout but no hard upper bound. If called with extremely large `timeoutMs`, it could hang. Add `Math.min(timeoutMs, 60000)` clamp.

83. [license.js:51 — sbFetch] — `req.setTimeout(12000, ...)` but no overall promise timeout. If the server sends response headers but hangs mid-body, the request may never complete. Add a 15s hard timeout via setTimeout.

84. [fb-publisher.js:57-86 — graphRequest] — Has `RESPONSE_TIMEOUT_MS` for body, connect timeout via `req.setTimeout(15000)`, but no overall hard limit. If response headers arrive at 14.9s and body takes 60s, total time is 75s. Add 45s hard cap.

85. [nine-router.js:77-79 — gogExec default timeout] — `gogExec` defaults to 15s timeout. Some Google API operations (Drive upload large files) may need more. Add configurable timeout parameter with sensible default.

86. [google-api.js:77 — gogExec calls] — Multiple `gogExec` calls throughout google-api.js may use the 15s default. Long-running operations like calendar list with many events need 30s+. Audit and set per-operation timeouts.

87. [cron.js:409 — spawnOpenClawSafe in runCronAgentPrompt] — `timeoutMs` parameter defaults to 600000 (10 min). This is correct but there's no timeout on the `await sendCeoAlert(...)` calls in the retry loop. If Telegram is unresponsive, alert delivery could hang the cron queue.

88. [dashboard-ipc.js:207-228 — HTTP login request in setup-9router-auto] — `timeout: 5000` on the request but no overall promise timeout. Wrap in `Promise.race` with 10s fallback.

89. [chat.js:248-252 — sendChatMessage spawn] — 600s timeout is correct for LLM, but the image pickup loop on line 278 (`for let _w = 0; _w < 18; _w++`) waits up to 90s with no AbortSignal check between iterations. Check `_chatGenerationAborted` (already done on line 280) — verified correct.

90. [model-downloader.js — downloadModels] — Model download (~450MB) has no overall timeout. Network stalls could leave the splash screen hung indefinitely. Add 30-minute hard timeout with progress check.

## Category 6: Missing loading states in UI

91. [dashboard.html — Telegram "Kiểm tra" button] — When CEO clicks the check button, there's no visual loading state while `checkTelegramReady()` runs (~6s). Add spinner/disabled state during probe.

92. [dashboard.html — Zalo "Kiểm tra" button] — Same as above for Zalo probe. Add loading indicator.

93. [dashboard.html — "Gửi tin test" Telegram button] — `telegramSelfTest()` can take 5-10s. Button should show loading state and disable during send.

94. [dashboard.html — Knowledge file upload] — `uploadKnowledgeFile()` may take 10-30s for large PDFs (AI summarization). Add upload progress indicator.

95. [dashboard.html — Cron "Test" button] — `testCron()` spawns an agent that can take 30-60s. Button should show spinner and "Đang chạy..." text.

96. [dashboard.html — Brand asset upload] — `upload-brand-asset` IPC can take 5-10s for large images. Add loading state.

97. [wizard.html — "Thiết lập AI" button] — `setup9RouterAuto()` can take 30-60s. Already has some loading but verify the button is fully disabled during the operation.

98. [dashboard.html — Custom cron save] — `saveCustomCrons()` IPC handler. Add brief loading indicator to prevent double-submit.

99. [dashboard.html — Zalo cache refresh button] — `refreshZaloCache()` can take 10-30s. Add loading state.

100. [dashboard.html — Factory reset button] — `factory-reset` IPC handler takes time to delete files. Add confirmation dialog + progress indicator.

## Category 7: Missing error toasts / user notifications

101. [dashboard-ipc.js:1032 — refresh-zalo-cache] — If `runZaloCacheRefresh()` fails, error is logged but not shown to CEO. Return error in response for UI to display toast.

102. [dashboard-ipc.js:2419 — save-schedules handler] — If `writeJsonAtomic` fails, error is caught but UI doesn't show a toast. Return `{ success: false, error: e.message }`.

103. [dashboard-ipc.js:2374 — save-custom-crons handler] — Same as above. Missing error feedback to UI on save failure.

104. [dashboard-ipc.js:2667 — save-telegram-config handler] — If config save fails mid-write, CEO sees no error. Add error return.

105. [dashboard-ipc.js:3062 — delete-brand-asset handler] — If `fs.unlinkSync` fails (file locked), error is caught but not surfaced to UI.

106. [dashboard-ipc.js:3365 — set-knowledge-visibility handler] — DB update failure returns error but verify UI actually shows it as a toast.

107. [chat.js:260 — gateway_offline error] — Returns `{ ok: false, error: 'gateway_offline' }` but verify the chat UI renders a user-friendly Vietnamese message for this code.

108. [chat.js:262 — agent_error] — Returns error with `detail` field. Verify UI shows the detail in a toast, not just generic "error".

109. [dashboard-ipc.js:1485 — save-zalo-manager-config handler] — Complex handler with many possible failure points. Verify each failure branch returns an error that UI can display.

110. [cron.js:384-390 — cron chatId missing] — Writes to `cron-cannot-deliver.txt` but CEO never sees this file. Add a one-time Dashboard notification on next load.

## Category 8: Missing fallback values / destructuring defaults

111. [channels.js:220 — getTelegramConfig destructuring] — `const token = config?.channels?.telegram?.botToken` — returns undefined if path doesn't exist, which is handled. But `const allowFrom = config?.channels?.telegram?.allowFrom` — if `allowFrom` is not an array, `allowFrom[0]` returns undefined. Add `Array.isArray(allowFrom)` check.

112. [cron.js:124 — parseAgentJsonOutput destructuring] — `const payloads = parsed?.result?.payloads || parsed?.payloads || []` — handles null but doesn't verify `payloads` is actually an array before indexing. Add `Array.isArray(payloads)` guard.

113. [chat.js:137-142 — extract function] — `const payloads = parsed?.result?.payloads || parsed?.payloads || []` — same pattern. Already has `Array.isArray` check. Verified OK.

114. [cron.js:334 — _runCronAgentPromptImpl default opts] — `{ label, zaloTarget, timeoutMs = 600000 }` — `label` and `zaloTarget` have no defaults. If caller passes `undefined`, `niceLabel` becomes `'cron'`. Correct behavior but add explicit `= null` defaults for documentation.

115. [dashboard-ipc.js:2230 — save-wizard-config configs] — `configs` parameter not validated as array. If renderer sends an object, `for...of` throws. Add `if (!Array.isArray(configs))` guard.

116. [dashboard-ipc.js:2197 — set-batch-config ops] — `ops` parameter not validated as array. Add `if (!Array.isArray(ops))` guard.

117. [channels.js:79 — sendMemoryWriteAlert destructuring] — `{ senderId, action, details }` — no defaults. If called with `undefined`, all fields are undefined. Already handles this with `|| '?'` fallbacks. Verified OK.

118. [fb-schedule.js:63-70 — parseTime null input] — Returns null on invalid input. Callers (subtractMinutes, timeToCron) check for null. Verified OK but add JSDoc `@returns {null}` for clarity.

119. [cron-api.js:108-114 — resolveZaloIsGroup defaults] — `isGroupParam` compared against strings and booleans. Missing check for `undefined` — should return `false` as default. Add explicit `if (isGroupParam === undefined || isGroupParam === null) return false`.

120. [image-gen.js:26-33 — normalizeImageSize] — Already has good fallback to `'1024x1024'`. Verified OK.

## Category 9: Missing input validation on IPC handlers

121. [dashboard-ipc.js:958 — save-zalo-mode handler] — `mode` parameter not validated. Should be one of a known set of values (e.g. 'auto', 'manual'). Add whitelist check.

122. [dashboard-ipc.js:2826 — pause-telegram handler] — `minutes` parameter not validated. Could be negative, zero, or extremely large. Add `Math.max(1, Math.min(minutes || 30, 1440))` clamp.

123. [dashboard-ipc.js:2838 — pause-zalo handler] — Same as above. Add minutes validation.

124. [dashboard-ipc.js:2951 — set-inbound-debounce handler] — `channel` and `ms` not validated. `channel` should be 'telegram' or 'zalo'. `ms` should be clamped 0-10000.

125. [dashboard-ipc.js:3091 — upload-media-asset handler] — `type` parameter not validated against allowed types. Could store arbitrary type values. Add whitelist.

126. [dashboard-ipc.js:3579 — create-knowledge-folder handler] — `name` not validated for length, special characters, or path traversal. Add sanitization.

127. [dashboard-ipc.js:3603 — delete-knowledge-folder handler] — `id` not validated. Could be empty string or path traversal. Add validation.

128. [dashboard-ipc.js:3191 — queue-follow-up handler] — `delayMinutes` not validated. Negative value would fire immediately. Clamp to `Math.max(1, Math.min(delayMinutes, 1440))`.

129. [dashboard-ipc.js:3561 — set-rag-config handler] — `cfg` object not validated for expected shape. Could contain unexpected fields. Add schema check.

130. [dashboard-ipc.js:1718 — save-personalization handler] — `tone`, `pronouns`, `ceoTitle`, `botName` not length-limited. Extremely long strings could corrupt IDENTITY.md. Add `String(x).slice(0, 200)`.

131. [dashboard-ipc.js:1890 — save-business-profile handler] — `payload` fields not length-validated. Add truncation for string fields.

132. [preload.js:9 — addCron bridge] — `opts` passed directly to IPC. Add renderer-side validation before invoke.

133. [preload.js:94 — readZaloUserMemory bridge] — `senderId` passed without sanitization. Add basic type check in preload.

134. [preload.js:96 — appendZaloUserNote bridge] — `note` content passed without length limit. Add `note.slice(0, 5000)` guard.

135. [preload.js:106 — createKnowledgeFolder bridge] — `name` passed without sanitization. Add `name.trim().slice(0, 100)` in preload.

## Category 10: Missing file existence checks

136. [conversation.js:70 — sessionsDir check] — `fs.existsSync(sessionsDir)` is checked, but `fs.readdirSync(sessionsDir)` could still throw if directory becomes inaccessible between check and read. Wrap in try/catch.

137. [cron.js:544 — schedulesPath existsSync + readFileSync] — Between `existsSync` and `readFileSync`, file could be deleted (TOCTOU). Already handled by outer try/catch. Verified OK.

138. [escalation.js:21 — queueFile existsSync] — `fs.existsSync(queueFile)` then `fs.renameSync(queueFile, tmpFile)`. TOCTOU race: file could be deleted between check and rename. The catch block handles this, but add explicit comment.

139. [channels.js:487 — openclaw.json existsSync in isZaloChannelEnabled] — Correct pattern. Verified.

140. [fb-schedule.js:129-136 — loadSchedules] — Reads file without existsSync check. Relies on catch to return `[]`. Add explicit `if (!fs.existsSync(getSchedulesPath())) return []` for clarity.

141. [cron-api.js:57-69 — stripCronApiTokenFromCustomCrons] — Checks existsSync before read. Correct. But `JSON.parse(raw)` has no try/catch inside the outer try. Already caught by outer catch. Verified OK.

142. [knowledge.js:293-295 — getDocumentsDb] — Access to `db` variable without checking if database connection is open. Add `if (!db || !db.open)` guard before prepare() calls.

143. [follow-up.js:31 — readFollowUpQueue existsSync] — Correct pattern: checks existsSync before read. Verified.

144. [zalo-plugin.js:67 — listener-owner.json unlink] — `if (fs.existsSync(ownerFile))` then `fs.unlinkSync(ownerFile)` — TOCTOU. Already in try/catch. Add comment.

145. [workspace.js:272 — existingAgents existsSync] — Checks `fs.existsSync(existingAgents)` before read. Correct pattern. Verified.

## Category 11: Missing JSON parse safety

146. [dashboard-ipc.js:551 — db.json parse] — `try { db = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch {}` — empty catch swallows parse errors. Add `catch (e) { console.warn('[setup-9router] db.json parse error:', e?.message); }`.

147. [dashboard-ipc.js:703 — db.json re-read] — `try { currentDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); }` — if parse fails, `currentDb` stays as previous value. Add fallback.

148. [dashboard-ipc.js:1297 — blocklist parse] — `try { blocklist = JSON.parse(fs.readFileSync(bp, 'utf-8')); } catch {}` — swallows parse errors. Add warning log.

149. [dashboard-ipc.js:1302 — allowlist parse] — Same pattern. Add warning log.

150. [dashboard-ipc.js:1307 — groupSettings parse] — `groupSettings = JSON.parse(fs.readFileSync(gsPath, 'utf-8'))` — no try/catch. If file is corrupt, entire handler throws. Wrap in try/catch.

151. [dashboard-ipc.js:1312 — userSettings parse] — Same as above. Wrap in try/catch.

152. [dashboard-ipc.js:1317 — strangerPolicy parse] — Same pattern. Wrap in try/catch.

153. [cron-api.js:160 — friends.json parse in loadFriendsList] — `JSON.parse(fs.readFileSync(p, 'utf-8'))` inside try/catch that returns `[]`. Correct but add `console.warn` in catch for debugging.

154. [cron-api.js:175 — groups.json parse in loadGroupsMap] — Same pattern. Add warning in catch.

155. [channels.js:1374 — listener-owner.json parse] — `JSON.parse(fs.readFileSync(ownerFile, 'utf-8'))` — in try/catch but catch returns stale data. Add `console.warn` for corrupt owner file.

156. [nine-router.js:103 — db.json parse in ensure9RouterDefaultPassword] — Already in try/catch. But the `JSON.parse(raw)` on line 104 could fail on corrupt JSON, silently returning via outer catch. Add specific parse error logging.

157. [nine-router.js:147 — db.json + openclaw.json double parse in ensure9RouterApiKeySync] — Two `JSON.parse` calls. If first succeeds but second fails, the function exits via outer catch without logging which file was corrupt. Add per-file error handling.

158. [license.js:154 — license.json parse] — `JSON.parse(fs.readFileSync(p, 'utf-8'))` in try/catch returning null. Correct pattern for optional file.

159. [fb-publisher.js:34 — fb-last-post.json parse in _loadLastPostAt] — `JSON.parse(fs.readFileSync(TIMESTAMP_FILE, 'utf-8'))` in try/catch returning 0. Correct.

160. [chat.js:306 — chat-history.jsonl line parse] — `JSON.parse(line)` in try/catch. Correct pattern for per-line parsing.

## Category 12: Race condition guards

161. [channels.js:497-527 — setZaloChannelEnabled] — Uses `withOpenClawConfigLock` correctly. Verified.

162. [follow-up.js:39-50 — processFollowUpQueue lock] — Has `_followUpQueueLock` boolean guard with 15-minute deadlock recovery. Correct but add `console.warn` when deadlock recovery fires (currently only has `console.error`).

163. [cron.js:322-332 — runCronAgentPrompt queue] — Uses promise chain queue with depth counter. Correct pattern. But `_cronAgentQueueDepth` is never capped — infinite queue growth possible. Add `if (_cronAgentQueueDepth > 10)` rejection.

164. [gateway.js:196-259 — startOpenClaw re-entrant guard] — Has `ctx.startOpenClawInFlight` guard and `_startOpenClawPromise` for concurrent callers. Correct pattern.

165. [fb-publisher.js:210-226 — post rate limiting] — `_postQueue` serializes posts. But `enforcePostInterval()` reads `_lastPostAt` from disk — two processes could both read stale value and post within the interval. Add file lock or compare-and-swap.

166. [cron-api.js:116 — startCronApi guard] — `if (_cronApiServer) return` prevents double-start. Correct.

167. [knowledge.js:290 — _backfillInProgress guard] — `_backfillInProgress` boolean prevents concurrent backfill. Correct.

168. [zalo-plugin.js:16-17 — _zaloPluginInFlight promise guard] — In-flight promise pattern prevents concurrent `ensureZaloPlugin` runs. Correct.

169. [dashboard-ipc.js:148 — _saveZaloManagerInFlight guard] — Boolean flag for Zalo manager save. Correct.

170. [cron.js:1334 — sendTelegram fire-and-forget in error handler] — `sendTelegram('...').catch(() => {})` — if two cron errors fire simultaneously, both try to send Telegram. Low risk but could flood CEO. Add rate limiter.

## Category 13: Missing cleanup (intervals/timeouts/listeners)

171. [main.js — powerSaveBlocker] — `powerSaveBlocker.start('prevent-app-suspension')` at boot but `powerSaveBlocker.stop(id)` never called at quit. Add stop in `before-quit` handler.

172. [channels.js — _channelBootTimers] — `trackChannelBootTimer()` creates timeouts. Verify `cleanupChannelTimers()` clears all of them during app quit.

173. [cron.js — _cronWatcher fs.watch] — `watchCustomCrons()` creates a `fs.watch` on custom-crons.json. The watcher is never closed. Add cleanup function and call it in `cleanupCronTimers()`.

174. [ceo-nudge.js — _watcherTimerId] — `setInterval` in `startCeoMessageWatcher()`. The `cleanupNudgeTimers()` function clears both `_watcherTimerId` and `_nudgeTimerId`. Verify it's called during quit.

175. [escalation.js:93 — _escalationInterval.unref] — `.unref()` prevents the timer from keeping the process alive, but `cleanupEscalationTimers()` must still be called for clean shutdown. Verify it's in the quit handler.

176. [follow-up.js:136 — _followUpInterval.unref] — Same pattern. Verify cleanup is called.

177. [main.js — _retentionTimer] — `setInterval` for enforceRetentionPolicies. Cleanup on line 1057 uses `try { ... } catch {}`. Correct.

178. [gateway.js:49 — _fastWatchdogInterval] — Watchdog interval. Verify `cleanupGatewayTimers()` clears it and is called at quit.

179. [channels.js — _channelStatusBroadcastInterval] — Channel status broadcast interval. Verify cleanup function clears it.

180. [cron-api.js — HTTP server] — `_cronApiServer` is an HTTP server. `cleanupCronApi()` should call `_cronApiServer.close()`. Verify it does.

## Category 14: Missing retry logic for transient errors

181. [channels.js:639-656 — sendTelegram HTTP request] — Single attempt to send Telegram message. If network briefly drops, message is lost. Add 1 retry with 2s backoff for ECONNRESET/ETIMEDOUT.

182. [channels.js:720-740 — sendTelegramPhoto] — Same single-attempt pattern. Add 1 retry for transient errors.

183. [channels.js:1190-1210 — _spawnOpenzca for Zalo send] — No retry on spawn failure. If openzca process is busy, message is lost. Add 1 retry with 3s backoff.

184. [license.js:24-55 — sbFetch Supabase call] — No retry on network errors. Activation check fails permanently on transient 5xx. Add 1 retry with exponential backoff.

185. [fb-publisher.js:47-86 — graphRequest] — No retry on 5xx responses from Facebook. Add 1 retry with 3s backoff for HTTP 500/502/503.

186. [updates.js:24-83 — checkForUpdates GitHub API] — Single attempt. If GitHub API returns 5xx, update check fails silently until next check cycle. Add 1 retry.

187. [nine-router.js:142-168 — ensure9RouterApiKeySync] — Reads two JSON files. If either is temporarily locked (Windows Defender scan), sync fails. Add 1 retry with 500ms delay.

188. [escalation.js:60 — sendCeoAlert in processEscalationQueue] — `await sendCeoAlert(alertMsg)` — if Telegram is temporarily down, escalation is still deleted from queue (line 67 unlinkSync). Mark entry as retry-needed instead of deleting.

189. [cron.js:317 — sendCeoAlert in broadcast failure] — `try { await sendCeoAlert(...); } catch {}` — swallows alert failure. Add retry or disk fallback.

190. [google-api.js:77 — gogExec] — No retry on transient failures. Google API occasionally returns 503. Add 1 retry for non-auth errors.

## Category 15: Missing user-facing error messages

191. [gateway.js:457-458 — 9Router 60s timeout] — `console.warn` when 9Router doesn't respond in 60s. CEO has no idea. Add audit log entry that Dashboard overview can surface.

192. [cron.js:109 — selfTest FAIL] — `console.warn` when openclaw self-test fails. CEO is alerted via Telegram only if `_agentCliVersionOk === false`. Verify the alert fires correctly (already implemented via `startCronJobs` check).

193. [config.js:115 — openclaw.json invalid JSON] — `console.error('[heal-inline] openclaw.json is not valid JSON')` — CEO never sees this. Write to `logs/config-errors.log` (already partially implemented, verify it covers this path).

194. [knowledge.js:83-85 — DOCUMENTS_DB_ERROR_LOG_INTERVAL_MS] — ABI mismatch error throttled to once per 5 minutes in logs. But CEO never sees "Knowledge tab broken" in Dashboard. Add a `knowledgeDbError` flag that overview can check.

195. [channels.js:654 — Telegram send failure] — If `sendTelegram` fails (wrong token, network), error is logged but CEO only sees it in log files. Add a `telegram-send-errors.log` counter that Dashboard can display.

196. [boot.js:703-738 — bootDiagRunFullCheck] — Diagnostic results only logged to console. Surface critical failures to Dashboard overview as alerts.

197. [workspace.js:571-576 — schedules.json corrupt] — Sends CEO alert via Telegram. Correct. But also add Dashboard notification in case Telegram is also broken.

198. [cron-api.js:141 — token file write failure] — `console.error('[cron-api] failed to write token file')` — CEO never sees this. Critical: no token = all cron API calls fail silently. Add audit log entry.

199. [license.js:293-299 — license expired] — Returns `status: 'expired'` but verify the license.html page shows a clear Vietnamese message with renewal instructions.

200. [nine-router.js:116 — default password cleared] — `console.log('[9router] Cleared stored password')` — informational. No action needed. Verified OK.

## Additional empty catch blocks and silent failures

201. [boot.js:312 — findOpenClawBin catch] — `catch {}` on the entire binary search loop. Add `console.warn('[findOpenClawBin] search error:', e?.message)`.

202. [boot.js:469 — where/which catch] — `catch {}` when running system `where node` / `command -v node`. Expected to fail on some systems. Add comment explaining this is intentional.

203. [boot.js:639 — findGlobalPackageFile catch] — `catch {}` on file search. Add `console.warn` for unexpected errors (not ENOENT).

204. [gateway.js:83 — killPort catch] — `catch {}` on taskkill. Expected: no process on port. Add comment: `/* No process on port — expected on fresh start */`.

205. [gateway.js:106 — killAllOpenClawProcesses catch] — Outer `catch {}`. Expected to fail if no processes exist. Add comment.

206. [workspace.js:98 — mkdirSync workspace catch] — `catch {}` when creating workspace directory. If this fails, entire app is broken. Add `console.error('[getWorkspace] CRITICAL: cannot create workspace dir:', e?.message)`.

207. [workspace.js:255 — copyFileSync in seedWorkspace] — `try { fs.copyFileSync(sp, tp); } catch {}` — silent failure when seeding workspace files. Add `console.warn('[seed] copy failed:', sp, e?.message)`.

208. [cron-api.js:128-139 — token mirror to APPDATA catch] — `catch {}` on mirroring cron API token to APPDATA. Add `console.warn('[cron-api] APPDATA mirror failed:', e?.message)`.

209. [main.js:569 — openExternal catch] — `shell.openExternal(url).catch(() => {})`. Replace with `.catch(e => console.warn('[openExternal] failed:', e?.message))`.

210. [cron.js:1458 — sendTelegram in cron handler catch] — `.catch(() => {})`. Replace with `.catch(e => console.warn('[cron] telegram notify error:', e?.message))`.

211. [cron-api.js:2215 — sendCeoAlert catch] — `.catch(() => {})`. Replace with `.catch(e => console.warn('[cron-api] CEO alert error:', e?.message))`.

212. [cron-api.js:2336 — inner catch in image-gen handler] — `.catch(() => {})`. Replace with error log.

213. [cron-api.js:2363-2366 — Telegram photo send catches] — Multiple `.catch(() => {})`. Replace all with error logging.

214. [cron-api.js:2572 — sendCeoAlert catch] — `.catch(() => {})`. Replace with error log.

215. [cron-api.js:2618 — sendTelegram skill delete catch] — `.catch(() => {})`. Replace with error log.

## More IPC handlers needing try/catch or validation

216. [dashboard-ipc.js:3007 — get-app-prefs handler] — No try/catch visible around `loadAppPrefs()`. If prefs file is corrupt, IPC rejects. Wrap in try/catch with default prefs fallback.

217. [dashboard-ipc.js:3011 — set-app-prefs handler] — `partial` parameter not validated. Could overwrite critical pref fields. Add whitelist of allowed keys.

218. [dashboard-ipc.js:3017 — list-brand-assets handler] — If brand assets directory doesn't exist, `fs.readdirSync` throws. Add existsSync check or try/catch.

219. [dashboard-ipc.js:3038 — upload-brand-asset handler] — `filePath` not validated for existence before copy. Add `fs.existsSync(filePath)` check.

220. [dashboard-ipc.js:3084 — list-media-assets handler] — `filters` parameter not validated for expected shape.

221. [dashboard-ipc.js:3133 — get-fb-config handler] — `readFbConfig()` returns null on error. Verify IPC caller handles null response.

222. [dashboard-ipc.js:3155 — verify-fb-token handler] — No try/catch wrapper visible. If `verifyToken` throws (network error), IPC rejects with raw error. Wrap in try/catch.

223. [dashboard-ipc.js:3164 — get-fb-recent-posts handler] — Graph API call could throw. Verify try/catch wrapping.

224. [dashboard-ipc.js:4134 — wizard-complete handler] — Complex handler with many steps. Each step should have individual try/catch to prevent one failure from blocking the entire wizard completion.

225. [dashboard-ipc.js:4225 — install-openclaw handler] — Runtime installer could throw. Verify error is caught and sent to splash UI.

## Remaining file-specific gaps

226. [skill-runner.js:89 — runScript spawn] — `spawn(bin, args, { cwd, env, windowsHide: true })` — if `bin` is null (runtime detection failed), spawn throws ENOENT. Already checked on line 99-107. Verified OK.

227. [skill-runner.js:167 — testRunScript mkdtempSync] — `fs.mkdtempSync(...)` could fail if OS temp dir is full. Add try/catch with clear error message.

228. [migration.js:74-95 — getAllUserDataDirs] — `fs.existsSync(d)` filter is correct. But `fs.readdirSync(dir)` on line 47 of related functions could throw on permission errors. Verify try/catch coverage.

229. [installation-recovery.js — withRetry] — Imported with `try { ... } catch {}`. If module is missing, `withRetry` is undefined. Callers must check before use.

230. [runtime-installer.js:26-33 — SHARED_VERSIONS fallback] — `catch` falls back to hardcoded versions. Add `console.warn('[runtime-installer] versions.json not found, using defaults')` in catch.

231. [model-downloader.js:47-53 — migration renameSync] — `fs.renameSync(oldDir, dest)` could fail if cross-device (different partitions). Add `console.warn` and fall through to re-download.

232. [google-api.js:93 — _gogInstallInFlight] — `_gogInstallInFlight = runtimeInstaller.ensureGogCli().finally(...)` — if `ensureGogCli` itself throws synchronously before returning a promise, the catch on line 93 handles it. But `getGogBinaryPath()` on line 96 may still return null. Already throws on line 97. Verified OK.

233. [zalo-plugin.js:82-100 — ensureModoroZaloNodeModulesLink] — `fs.lstatSync(pluginNodeModules)` on line 98 could throw if path doesn't exist AND existsSync returned false. Already in try/catch. Verified.

234. [compact.js — compactAllSessions] — Verify that session compaction operations have try/catch around file writes to prevent data loss on disk-full scenarios.

235. [persona.js — syncAllBootstrapData] — Called from gateway.js without try/catch. If persona compilation throws (corrupt IDENTITY.md), boot fails. Already wrapped in `try { fn(); } catch` in the _patchFns loop. Verified.

236. [util.js — writeJsonAtomic] — Core atomic write utility. Verify it handles disk-full (ENOSPC) gracefully, doesn't leave partial .tmp files on error.

237. [context.js — ctx object] — Global shared state object. Verify all field accesses use optional chaining where ctx.mainWindow could be destroyed.

238. [preflight.js — runPreflightChecks] — If any check throws, does the entire preflight abort or continue? Verify each check is independently wrapped.

239. [conflict-detector.js:163 — JSON.parse(lsOut)] — `JSON.parse` on npm ls output. If npm outputs non-JSON warnings before the JSON, parse fails. Wrap in try/catch with specific npm output parsing.

240. [media-library.js — findMediaAsset] — Called from image-gen.js. Verify it returns null on not-found instead of throwing.

## UI-specific error handling (dashboard.html / wizard.html)

241. [dashboard.html — onChannelStatus callback] — If `callback(data)` throws in renderer, the IPC listener dies silently. Add try/catch wrapper inside the `ipcRenderer.on` callback.

242. [dashboard.html — onCustomCronsUpdated callback] — Same pattern. Wrap callback in try/catch.

243. [dashboard.html — webview 'did-fail-load' event] — Embedded 9Router/OpenClaw webviews should listen for `did-fail-load` to show a "Cannot load" message instead of blank frame.

244. [dashboard.html — webview 'crashed' event] — Embedded webviews should listen for `crashed` event and show recovery button.

245. [wizard.html — fetch/IPC error in auto-setup] — Verify all `window.claw.xyz()` calls in wizard steps have `.catch()` handlers that show user-facing Vietnamese error messages.

246. [splash.html — install-progress listener] — If the renderer crashes during install, progress stops but no error is shown. Add a 5-minute watchdog timer that shows "Cài đặt quá lâu" message.

247. [license.html — activation IPC error] — Verify the activation button's IPC call has a catch handler that shows the specific error (expired, machine_mismatch, network) in Vietnamese.

248. [dashboard.html — knowledge file upload drag-drop] — If the file picker returns an invalid path, the upload IPC may throw. Add try/catch around the `uploadKnowledgeFile` call in the drop handler.

249. [dashboard.html — chat send button] — If `sendChatMessage` IPC rejects (not just returns `ok:false`), verify the UI catches the rejection and shows error state.

250. [dashboard.html — bot toggle button] — `toggleBot` IPC handler. If gateway start/stop throws, button state may be out of sync. Add error handling that resets button to current actual state via `getBotStatus()`.
