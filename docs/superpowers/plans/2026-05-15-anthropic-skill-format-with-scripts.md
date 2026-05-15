# Migrate Skill System to Anthropic Agent Skills Standard + Scripts

**Status:** Plan only — not implementing yet.
**Date:** 2026-05-15
**Why:** Anthropic Agent Skills open standard (Dec 2025) lets agent BUNDLE EXECUTABLE CODE with skill instructions. CEO Việt thường có task lặp lại: Excel/Sheet processing, browser automation (Shopee scrape), OCR receipt, batch image resize, custom CRM query, weekly report PDF... — hiện tại bot không làm được vì chỉ có HTTP API tools.

## Goal

Convert MODOROClaw skill từ flat `.md` sang folder pattern theo Anthropic standard, mỗi skill có optional `scripts/` cho code execution. Mở khả năng CEO tạo skill với automation thật sự.

## Wide-think — Skill scripts CEO có thể tự tạo

| Domain | Script ideas |
|---|---|
| **Excel/Sheet** | Đọc Excel khách gửi → parse → push lên Google Sheet; merge 12 file báo cáo tháng thành 1; filter rows có dấu hiệu bất thường; tính tồn kho từ stock.xlsx |
| **Browser automation** | Scrape Shopee shop competitor; login Lazada seller, lấy đơn pending; tải report Facebook Ads; check website NCC uptime |
| **Image batch** | Resize ảnh sản phẩm hàng loạt; thêm watermark; crop background trắng; convert PNG→WEBP |
| **OCR** | Đọc số tiền từ ảnh chuyển khoản; extract text từ ảnh hóa đơn; nhận diện CCCD khách |
| **Data export** | Weekly P&L → PDF + gửi kế toán; backup workspace → zip → Drive; export memory zalo-users dạng CSV |
| **Custom CRM** | Query SQLite memory.db; tính LTV khách; tìm khách inactive >60 ngày |
| **Network probe** | Ping NCC API mỗi giờ; check shop competitor có online không; monitor SSL expiry |
| **AI batch** | Bulk translate 200 product description; categorize 500 review tiêu cực/tích cực; generate hashtag từ product name |
| **File watcher** | Theo dõi folder "Đơn hàng" trên Desktop, mỗi PDF mới → trigger flow |

→ Foundation phải generic đủ để CEO/em không cần predict trước task gì.

## Architecture

### Folder structure (Anthropic standard)

```
skills/
├── operations/
│   ├── cron-management/
│   │   ├── SKILL.md
│   │   └── scripts/       (optional, mostly empty for existing)
│   ├── excel-utility/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── extract_to_json.py
│   │       ├── merge_sheets.py
│   │       └── requirements.txt
│   ├── browser-scrape/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   ├── scrape_shopee.js
│   │   │   └── package.json
│   │   └── references/
│   │       └── shopee-selectors.md
│   └── ...
├── marketing/
├── <industry>/
└── INDEX.md
```

User skills cũng follow:
```
user-skills/
├── _registry.json
├── <id>/
│   ├── SKILL.md
│   └── scripts/  (CEO upload via Dashboard hoặc Telegram)
└── ...
```

### Frontmatter (Anthropic style)

```yaml
---
name: excel-utility
description: Xử lý file Excel — merge, filter, extract, summarize. DÙNG NGAY khi CEO nói "đọc file Excel", "tổng hợp Sheet", "trộn file Excel", "lọc dữ liệu", "xuất CSV" — kể cả không nói cụ thể "Excel".
allowed-tools: [web_fetch, read_file]
scripts:
  - name: extract_to_json
    runtime: python
    args: [filepath]
    description: Parse Excel → JSON
  - name: merge_sheets
    runtime: python
    args: [output, ...inputs]
---
```

### Script execution

**New API endpoint:** `/api/skill/exec`

```
POST /api/skill/exec
{
  "skillId": "operations/excel-utility",   // hoặc user-skills/<id>
  "script": "extract_to_json",
  "args": ["C:/Users/CEO/Desktop/order.xlsx"],
  "timeoutMs": 60000
}
```

Server logic:
1. Resolve skill folder path
2. Verify `scripts/<script>.<ext>` exists (whitelist by SKILL.md frontmatter)
3. Pick runtime: `.py` → python, `.js` → node, `.sh` → bash, `.ps1` → powershell
4. Spawn with cwd = skill folder, env restricted (no secrets)
5. Capture stdout/stderr, max 1MB output
6. Return `{exitCode, stdout, stderr, durationMs}`

### Runtime management

| Runtime | Strategy |
|---|---|
| **Node.js** | Đã có trong vendor (~165MB) |
| **Python 3** | Lazy-download ~30MB embedded Python on first script use (Windows). Mac dùng `/usr/bin/python3` sẵn. |
| **Playwright** | Lazy-download Chromium ~120MB lần đầu chạy browser script |
| **Bash** | Native (Mac/Linux), Git Bash on Windows |
| **PowerShell** | Native Windows |

### Progressive disclosure

Anthropic standard 3 tầng — implement đầy đủ:
1. **Metadata** (~100 tokens/skill): name + description trong AGENTS.md catalog
2. **SKILL.md body** (<500 dòng): load on trigger (lazy match như user-skills v3)
3. **scripts/ + references/**: load on-demand khi bot quyết định cần

→ Refactor cả shipped skills sang lazy load (không còn AGENTS.md reference 14 skill paths eagerly).

### Security

| Concern | Mitigation |
|---|---|
| Malicious script | Whitelist via SKILL.md `scripts:` field (chỉ script được declare mới run được) |
| File access | Sandbox cwd = skill folder; cấp R/W workspace qua env var; deny `cron-api-token.txt`, `license.json`, `.machine-id` |
| Network | Default deny outbound trừ localhost; whitelist domain per skill nếu cần |
| Resource exhaustion | timeoutMs cap 5 phút, output 1MB, mem 1GB |
| Zalo customer trigger | `/api/skill/exec` channel gate giống `/api/user-skills/*` (telegram only) |

## Scope (per CEO decisions 2026-05-15)

- ✅ Shipped skills 29 files: **GIỮ NGUYÊN flat .md** — no migration
- ✅ User skills từ v2.4.5+: folder + SKILL.md + optional scripts/
- ✅ Python: **lazy-download** + detect existing 3.8+ trên máy CEO, reuse nếu compatible
- ✅ Code preview: **summary + collapse "xem code chi tiết"**
- ✅ LLM: **cùng main model (GPT-5.4 via 9router)**
- ✅ Timing: **làm luôn, không defer**

→ Skip Phase 3 (shipped migration), Phase 5 (pre-built ref skills), Phase 6 (progressive disclosure shipped). Scope còn 3 phase.

## High-level tasks (revised)

### Phase 1 — Foundation (~1 ngày)
1. Auto-detect support: `skill-manager.js` accept `user-skills/<id>.md` (legacy) AND `user-skills/<id>/SKILL.md` (Anthropic style). Backward compat cho existing user skills.
2. `createUserSkill({...scripts})` — nếu có scripts → tạo folder structure thay vì flat file.
3. `getUserSkillContent(id)` mở rộng đọc cả folder pattern.
4. Workspace whitelist `cron-api.js` thêm `user-skills/*/SKILL.md` + `user-skills/*/scripts/**` + `user-skills/*/references/**`.
5. Smoke test: tạo skill folder tay, verify lazy match + inject content read được.

### Phase 2 — Python runtime + script execution (~1.5 ngày)
6. `electron/lib/python-runtime.js`:
   - `detectSystemPython()` — check `python3`/`python` PATH, run `--version`, parse, accept ≥3.8
   - `getPythonBin()` — return cached path nếu detected, else null
   - `ensurePython(progressCb)` — lazy download embedded Python (Windows: python-3.11-embed-amd64.zip ~30MB; Mac/Linux: dùng system)
   - Marker file `userData/vendor/python-binary.txt` → cached path
7. New API `/api/skill/exec`:
   - Channel gate (telegram only)
   - Resolve user-skills/<id>/scripts/<script>
   - Whitelist check: script tên trong SKILL.md frontmatter
   - Spawn với cwd = skill folder, env restricted
   - Capture stdout/stderr, max 1MB, timeout default 60s
8. New API `/api/skill/test-exec`:
   - Same as exec nhưng cwd = isolated temp dir
   - Network: default deny (allow 127.0.0.1)
   - Output 100KB cap, timeout 30s
9. `electron/lib/skill-runner.js` — spawn helper với runtime detection (.py → python, .js → node, .sh → bash, .ps1 → powershell)

### Phase 3 — AI script generation flow (~2 ngày — TRỌNG TÂM)
10. New shipped skill `skills/operations/script-generator.md` — quy trình:
    - Phân tích task CEO mô tả (input/output/operation type)
    - Check existing user skill có match không (avoid re-generate)
    - Generate script (Python/Node) với template guidance từ references/
    - Run test-exec với sample data
    - Format preview cho CEO: summary 3 dòng + collapse "xem code chi tiết"
    - CEO confirm → save folder + scripts/<file> + SKILL.md
    - CEO reject/sửa → iterate
11. Script template library `skills/operations/script-generator/references/`:
    - `pandas-excel.md` — pandas patterns cho Excel/CSV
    - `sqlite-memory.md` — query memory.db, knowledge.db
    - `http-requests.md` — requests, fetch
    - `playwright-browser.md` — Playwright Python boilerplate
    - `pillow-image.md` — Pillow resize/crop/watermark
    - `fs-fileops.md` — pathlib, walk, glob
12. Iteration loop trong skill-generator: script fail → bot đọc stderr → fix → re-test (max 3 lần) → escalate CEO nếu vẫn fail
13. Edit existing script flow: CEO "skill X sai chỗ Y" → bot read existing scripts/<file> qua workspace/read → patch → test → confirm → overwrite
14. Auto-generate description "pushy" cho skill mới: bot tự viết description theo Anthropic standard
15. Audit log: `user_skill_script_generated`, `user_skill_script_executed`, `user_skill_script_edited` events

## Risks

- **Migration breakage:** Existing user `user-skills/<id>.md` sang folder phải tự convert. Add migration code in `seedWorkspace`.
- **Python install size + complexity:** Embedded Python on Windows = +30MB. macOS dùng system Python phụ thuộc user. Lazy install giống Node vendor.
- **Script security:** Mỗi script chạy = process spawn. Nếu CEO copy script từ internet, có thể chứa malware. Default deny network + whitelist file paths. Add Telegram confirm trước khi chạy lần đầu mỗi script.
- **Playwright size:** +120MB Chromium. Lazy download on first browser-script execution.
- **Cross-platform:** Bash on Windows = Git Bash trong vendor? Hoặc convert sang PowerShell tự động? Skip Windows-Bash if no Git Bash.
- **Performance:** Spawn Python mỗi lần ~200ms cold start. Long-running scripts OK, fast tools (Excel parse <1s) tốn overhead. Acceptable.

## ⭐ Architecture decision: AI generates scripts, NOT CEO uploads

CEO không tự code. Bot là người viết. Flow:

```
Turn 1 — First request (expensive)
  CEO: "Tính LTV khách iPhone tháng này"
  Bot:
    1. Phân tích yêu cầu — task type (data query), input (memory.db), output (number per customer)
    2. Detect: chưa có skill cho task này
    3. Generate Python script (with template guidance — pandas/sqlite3 patterns)
    4. Run TEST trên sample data (5 rows) → get output preview
    5. Trình CEO:
       "Em viết script này [code preview hoặc summary].
        Chạy thử trên 5 record thấy [output preview].
        Ok chạy thật trên toàn bộ không, và lưu thành skill để tháng sau dùng lại?"
  CEO: "ok"
  Bot:
    6. Run full dataset
    7. Return real output (LTV table)
    8. Save: skills/operations/ltv-customer/{SKILL.md + scripts/calc.py}
    9. Audit log

Turn 2 — Recurring (cheap, no LLM code gen)
  CEO: "Tính LTV iPhone tháng này"
  Bot:
    1. Lazy match → found skill "Tính LTV khách"
    2. Re-run scripts/calc.py với args mới
    3. Return output ngay (~2 giây)
    4. KHÔNG LLM call cho code generation
```

**Pattern này = action caching** (giống Stagehand v3 browser, generalized cho mọi task).

### Implications

- **No upload UX needed** — không Dashboard file picker, không Telegram file send
- **Single creation flow** — chat → AI generate → confirm → save (giống skill text)
- **Iteration:** Script test fail → bot tự fix → re-test, max 3 lần → escalate CEO nếu vẫn fail
- **Edit:** CEO "skill X chạy sai chỗ Y" → bot đọc existing script → patch → re-test → confirm CEO
- **Script template library** — bundle pattern guidance trong AGENTS.md hoặc references/ (pandas snippets, playwright patterns, requests boilerplate) để bot generate code đúng convention
- **Sandbox test** — generated code chạy first time với isolated cwd + restricted network, output capped 100KB

## Remaining open questions

1. **Bundle Python vs lazy?** Bundle adds 30MB to EXE. Lazy adds first-use latency. Recommend **lazy** với splash "Đang cài Python lần đầu (~30MB)".
2. **Code generation model?** Bot dùng cùng model main hay split (vd: cheap model cho code gen vs main model cho conversation)? Recommend **cùng model** (gpt-5 hoặc claude) — code quality > tiết kiệm.
3. **Show full code or summary to CEO?** Code 50 dòng Python show hết → CEO không hiểu, choáng. Recommend **summary + collapse** ("Script làm 3 việc: connect DB, query orders, aggregate by customer. Anh xem code chi tiết bằng cách bấm 'Xem code'.")
4. **Reuse vs regenerate?** Khi CEO request giống skill cũ ~80%, re-run cũ hay regenerate? Default reuse, có CTA "Đây có phải task khác cần script mới không?"
5. **Script template library bootstrap** — start với mấy template? Recommend 6: pandas/Excel, sqlite3/memory.db, requests/HTTP, playwright/browser, Pillow/image, fs/file-ops.

## Decision points for future me

- **Skip if:** Migration cost cao hơn benefit. Có thể CEO premium hài lòng với HTTP tools hiện tại + Stagehand browser plan.
- **Defer if:** v2.4.4 vừa ship, cần stabilize trước. Đợi feedback 2-4 tuần.
- **Prioritize if:** ≥3 CEO request "tự động Excel" hoặc "scrape competitor" — đây là signal demand.

## References

- [Anthropic Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Open standard repo](https://github.com/anthropics/skills)
- [Complete Guide PDF](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf)
- Prior plan: `2026-05-14-stagehand-browser-automation.md` — overlap với browser scripts, consider unifying
