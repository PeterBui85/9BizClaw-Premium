# PREFLIGHT.md — Checklist trước khi thêm tính năng mới

> Mỗi khi thêm function/integration mới, chạy qua checklist này TRƯỚC khi code.
> Mục đích: không làm vỡ cái cũ khi thêm cái mới.

---

## 1. Xác định loại thay đổi

| Loại | Ví dụ | Mức độ rủi ro |
|------|-------|---------------|
| **A. IPC handler mới** | Thêm `ipcMain.handle('xxx')` | Trung bình |
| **B. Output filter pattern** | Thêm regex vào `_outputFilterPatterns` | Thấp |
| **C. Patch/ensure function** | Thêm `ensureXxxFix()` | Cao |
| **D. Bootstrap rule** | Sửa AGENTS.md, SOUL.md, etc. | Cao |
| **E. Cron handler** | Thêm case trong `startCronJobs()` | Cao |
| **F. Preload bridge** | Thêm API vào `preload.js` | Trung bình |
| **G. Dashboard UI** | Thêm page/section trong `dashboard.html` | Thấp |
| **H. Openzalo fork** | Sửa `patches/openzalo-fork/*.ts` | Cao |

---

## 2. Checklist theo loại

### A. IPC handler mới

- [ ] `ipcMain.handle('xxx', ...)` trong `main.js`
- [ ] Bridge tương ứng trong `preload.js`: `xxx: () => ipcRenderer.invoke('xxx')`
- [ ] Nếu có callback/event: dùng `removeAllListeners` trước `on()` (tránh listener stack khi hot-reload)
- [ ] Nếu đọc/ghi file: dùng `getWorkspace()` path, KHÔNG hardcode
- [ ] Nếu ghi `openclaw.json`: dùng `writeOpenClawConfigIfChanged()`, KHÔNG `fs.writeFileSync` trực tiếp
- [ ] Verify: so sánh `ipcMain.handle` count vs `ipcRenderer.invoke` count (hiện tại 106 vs 102, chênh 4 là internal-only handlers: `cron-diagnostic`, `queue-follow-up`, `seed-group-history-all`, `seed-group-history-now`)

### B. Output filter pattern

- [ ] Thêm vào `_outputFilterPatterns` array (~line 11566 main.js)
- [ ] Test với câu tiếng Việt có chứa keyword (tránh false positive)
- [ ] Test với tên sản phẩm/địa chỉ có chứa keyword
- [ ] Regex KHÔNG quá rộng — phải có word boundary hoặc context
- [ ] Pattern có `name` field để log rõ ràng

### C. Patch/ensure function

- [ ] Function có marker idempotent (VD: `// === MODOROClaw XXX PATCH ===`)
- [ ] Được gọi trong `_startOpenClawImpl()` — chạy mỗi lần boot
- [ ] Nếu patch file plugin: kiểm tra anchor string còn tồn tại (openzalo có thể update)
- [ ] Nếu patch openclaw dist: thêm anchor check vào `smoke-test.js`
- [ ] Fresh-install safe: KHÔNG giả định file đã tồn tại trước
- [ ] **Nếu là openzalo patch**: KHÔNG thêm ensure function mới. Sửa trực tiếp trong `patches/openzalo-fork/inbound.ts` (hoặc send.ts/channel.ts/openzca.ts). Update `OPENZALO_FORK_VERSION` trong main.js.

### D. Bootstrap rule (AGENTS.md, SOUL.md, etc.)

- [ ] Kiểm tra tổng ký tự AGENTS.md < 20K (hiện tại ~14.5K, budget còn ~5.5K)
  ```bash
  wc -c AGENTS.md
  ```
- [ ] Kiểm tra tổng 8 file < 150K (bootstrap total limit)
  ```bash
  wc -c AGENTS.md SOUL.md TOOLS.md IDENTITY.md USER.md HEARTBEAT.md BOOTSTRAP.md MEMORY.md
  ```
- [ ] Rule mới có conflict với rule cũ không? Grep keyword trong tất cả 8 file
- [ ] Nếu thêm defense row: cập nhật số thứ tự `#` liên tục
- [ ] KHÔNG dùng emoji
- [ ] Tiếng Việt có đầy đủ dấu (KHÔNG "khong" — phải "không")
- [ ] Tăng `CURRENT_AGENTS_MD_VERSION` trong main.js (~line 640) nếu sửa AGENTS.md
- [ ] Tăng version trong comment `<!-- modoroclaw-agents-version: XX -->` dòng 1

### E. Cron handler

- [ ] Handler gọi `auditLog('cron_fired', ...)` khi thành công
- [ ] Handler gọi `auditLog('cron_failed', ...)` khi lỗi
- [ ] Lỗi → `sendCeoAlert()` (dual Telegram + Zalo), KHÔNG im lặng
- [ ] Journal vào `logs/cron-runs.jsonl`
- [ ] Dùng `spawnOpenClawSafe()` nếu cần chạy CLI (KHÔNG `exec` với `shell:true`)
- [ ] Test: click "Test" trên Dashboard phải trả kết quả thật

### F. Preload bridge

- [ ] Mỗi `ipcRenderer.invoke` phải có `ipcMain.handle` tương ứng
- [ ] Event listener: `removeAllListeners` trước `on()` (xem pattern `onCustomCronsUpdated`)
- [ ] Tham số phức tạp: truyền object `{ key: value }`, KHÔNG truyền nhiều tham số rời

### G. Dashboard UI

- [ ] KHÔNG dùng emoji
- [ ] KHÔNG dùng `\uXXXX` unicode escape trong HTML — ghi ký tự trực tiếp
- [ ] Tiếng Việt có dấu đầy đủ
- [ ] Test trên màn hình 1366x768 (laptop CEO)
- [ ] Tab mới: thêm sidebar menu item + page div + switchPage handler
- [ ] Auto-refresh: dùng `setInterval` với guard `isActiveTab` (tránh poll khi user ở tab khác)

### H. Openzalo fork

- [ ] Sửa file trong `electron/patches/openzalo-fork/` (KHÔNG sửa trực tiếp trong `~/.openclaw/extensions/`)
- [ ] Kiểm tra marker comments vẫn còn trong file fork (smoke-test.js verify)
- [ ] Tăng `OPENZALO_FORK_VERSION` trong main.js
- [ ] Test: restart Electron → console log `[openzalo-fork] applied fork-vX-...`

---

## 3. Cross-cutting — BẮT BUỘC mỗi thay đổi

- [ ] `npm run smoke` pass (0 failures)
- [ ] Mental-simulate fresh install: RESET.bat → RUN.bat → wizard → tính năng mới có hoạt động?
- [ ] Tính năng mới có cần `seedWorkspace()` tạo file template không?
- [ ] Tính năng mới có cần `ensureDefaultConfig()` set default không?
- [ ] KHÔNG break existing IPC — Dashboard cũ phải vẫn chạy được
- [ ] KHÔNG thêm dependency mới vào `package.json` mà chưa pin version chính xác

---

## 4. Trước khi build

```bash
# 1. Smoke test
cd electron && npm run smoke

# 2. Kiểm tra kích thước bootstrap files
wc -c ../AGENTS.md ../SOUL.md ../TOOLS.md ../IDENTITY.md ../USER.md ../HEARTBEAT.md ../BOOTSTRAP.md ../MEMORY.md

# 3. Kiểm tra IPC parity
echo "main.js handlers:" && grep -c "ipcMain.handle(" main.js
echo "preload.js bridges:" && grep -c "ipcRenderer.invoke(" preload.js

# 4. Kiểm tra AGENTS.md version match
grep "CURRENT_AGENTS_MD_VERSION" main.js | head -1
head -1 ../AGENTS.md

# 5. Kiểm tra openzalo fork version match
grep "OPENZALO_FORK_VERSION" main.js | head -1
cat patches/openzalo-fork/../../../.openclaw/extensions/openzalo/src/.fork-version 2>/dev/null || echo "(not applied yet — ok for build)"
```

---

## 5. Known landmines

| Khu vực | Bẫy | Hậu quả |
|---------|-----|---------|
| `openclaw.json` | Ghi bằng `fs.writeFileSync` thay vì `writeOpenClawConfigIfChanged()` | Gateway restart loop — CEO thấy "Gateway is restarting" |
| `openclaw.json` | Ghi bằng `openclaw config set` CLI | Cùng restart loop — CLI subprocess bypass byte-equal guard |
| `inbound.ts` | Sửa trực tiếp trong `~/.openclaw/extensions/` | Mất khi reboot — `applyOpenzaloFork()` overwrite |
| `ensureDefaultConfig` | Thêm key mà openclaw schema không chấp nhận | Mọi `openclaw` CLI exit 1 — cron chết |
| `_outputFilterPatterns` | Regex quá rộng (VD: `/error/i`) | Block reply bình thường chứa từ "error" |
| `schedules.json` | Hardcode cron expression thay vì đọc từ config | Heartbeat frequency drift |
| `tools.allow` | Bỏ sót tool cần thiết (VD: bỏ `exec`) | Cron pipeline chết im lặng |
| `bootstrapMaxChars` | Hạ xuống dưới kích thước AGENTS.md | Rules bị cắt ngầm — bot bỏ qua defense |
| `AGENTS.md` cuối file | Thêm rule ở cuối | Nếu bootstrapMaxChars không đủ → rule bị truncate |
| `preload.js` | Thêm `on()` không có `removeAllListeners` trước | Listener stack — event fire N lần |
| `better-sqlite3` | Update Electron version | ABI mismatch — Knowledge tab chết |

---

## 6. Sơ đồ tham chiếu nhanh

```
User message
  → Zalo listener (openzca) hoặc Telegram webhook
    → inbound.ts (fork: blocklist → system-msg → dedup → pause → mode → RAG → deliver)
      → openclaw gateway (bootstrap 8 files, tools.allow, contextInjection)
        → 9Router (ChatGPT Plus proxy)
          → AI response
    → outbound: filterSensitiveOutput() → sanitizeZaloText() → send
      
Cron:
  startCronJobs() → node-cron timers
    → runCronAgentPrompt() → spawnOpenClawSafe() → openclaw agent --message
    → auditLog + cron-runs.jsonl
    → sendTelegram / sendCeoAlert

Dashboard:
  dashboard.html → preload.js bridge → ipcMain.handle → main.js function
```

---

*Cập nhật lần cuối: 2026-04-22 | Version: v2.3.47.3*
