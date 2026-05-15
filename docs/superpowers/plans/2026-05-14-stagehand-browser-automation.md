# Stagehand Browser Automation Integration

**Status:** Plan only — not implementing yet.
**Date:** 2026-05-14
**Why:** CEO needs bot to scrape supplier prices, check competitor sites, fill order forms on JS-rendered web. Current `web_fetch` is HTTP-only — no JS execution, no DOM interaction.

## Goal

Integrate Stagehand v3 as the browser automation backend, controllable via CEO Telegram chat. Lazy-download Chromium on first use to avoid +80MB EXE bloat.

## Why Stagehand vs alternatives

| Option | Why rejected |
|---|---|
| OpenBrowserAI | Only 51 stars, early, no CLI |
| BrowserOS | Full GUI browser — too heavy |
| Browser Use | Python (need Python subprocess), persistent LLM cost per run |
| Skyvern | Vision-based = expensive per task |
| Vercel agent-browser | Pure CLI but no action cache — repeated cron runs eat tokens |
| **Stagehand v3** | TS (matches stack), extends Playwright, **action caching ≈ $0 after first run** for repeated workflows. MIT. |

Pattern fit: CEO runs same workflow repeatedly (daily NCC price check, weekly competitor scan). Stagehand's first run uses LLM to discover selectors; subsequent runs replay cached actions = near-zero token cost.

## Architecture

```
CEO Telegram → openclaw agent → skill "browse"
  → web_fetch http://127.0.0.1:20200/api/browse/run
  → cron-api.js spawns: node browse-worker.js <command-json>
  → browse-worker.js uses Stagehand → returns extracted data
  → bot summarizes + delivers to CEO
```

**Lazy install Chromium** (same pattern as `runtime-installer.js` for Node + vendor):
- First browse command → `getBundledChromium()` returns null
- Show CEO "tải Chromium ~120MB cho lần đầu, mất 1-2 phút"
- Download to `userData/vendor/chromium/`
- Cache for all subsequent runs

**Action cache location:** `workspace/browse-cache/<host>/<actionId>.json` — keyed by URL + intent. Auto-prune entries older than 30 days.

## High-level tasks

1. **Research API** — read Stagehand v3 docs, write 10-line spike: navigate google.com, fill search, click first result. Verify cache file location + format. Confirm Node API (not just CLI).
2. **Browse worker** — `electron/lib/browse-worker.js`. Accept JSON command via stdin: `{url, intent, extractSchema?}`. Return JSON result. Idempotent.
3. **Runtime install** — extend `runtime-installer.js` to handle Chromium binary. Stagehand uses `playwright-core` → needs separate Chromium download. Splash screen + progress bar.
4. **API endpoint** — `cron-api.js` route `/api/browse/run` (channel gate: telegram only, same as user-skills). Auth model same as `/api/exec`.
5. **Skill file** — `skills/operations/browser-automation.md`. Trigger phrases: "scrape", "vào website", "lấy giá", "check Shopee", "competitor", "tự đăng nhập". Document 5-6 common workflows (NCC price check, Shopee scan, fill form).
6. **Cron integration** — CEO can schedule "mỗi sáng 8h lấy giá NCC X, gửi báo cáo Telegram". Use existing cron infrastructure + `mode=browse`.
7. **Action cache UI** — Dashboard tab "Browser Actions" → list cached actions per host, manual purge button. CEO sees what's cached, can invalidate when site changes.
8. **Error UX** — site blocks bot (CAPTCHA, Cloudflare), session expired, login required — bot escalates CEO with screenshot.
9. **Smoke tests** — `npm run smoke` adds browse-worker test (mock Chromium, verify command/response shape).

## Risks

- **Distribution size:** EXE → 142MB still, but first-launch downloads +120MB for Chromium. Decide UX:
  - (a) Lazy on first browse command (recommended)
  - (b) Lazy on Knowledge tab open like RAG model
  - (c) Bundle in EXE (~220MB total, not premium-friendly)
- **CAPTCHA / anti-bot:** Stagehand has stealth plugins but commercial sites block headless. CEO needs to know which sites work.
- **Privacy:** Sites with CEO's logged-in session (Shopee seller dashboard, Lazada, NCC portal) — cookies live in `userData/vendor/chromium/profile/`. Document backup behavior. Never include in `backup-manifest.json` (PII).
- **License scope:** Stagehand MIT, Playwright Apache 2.0, Chromium BSD — all compatible with premium-only distribution.
- **Action cache poisoning:** If site changes layout, cached actions click wrong element. Detect by: hash page structure, invalidate cache when hash changes >30% from snapshot at cache time.
- **Token blow-up first run:** Complex workflow first time = many LLM calls. Add per-command token budget (~$0.50 default) with CEO confirm before exceed.

## Open questions (decide before implementing)

1. **Pricing tier:** part of premium subscription or paid add-on? Stagehand v3 commercial usage allowed under MIT but our distribution is premium-only.
2. **Storage for credentials:** CEO logs into Shopee NCC dashboard via headless Stagehand. Cookies stored where? Encrypted? CEO-revoke flow?
3. **Concurrency:** can browse cron + browse Telegram + browse Zalo customer all run simultaneously? Need worker pool or queue?
4. **Cron-only or Zalo-available too?** Reviewer flagged Item #6 (cron → skill mutation) — same risk applies if Zalo customer can trigger browse via memory poisoning. Recommend: telegram + cron only, never Zalo.

## Decision points for future me

- Skip if: Playwright/Chromium ABI mismatch with Electron version causes ABI mismatch hell like better-sqlite3.
- Reconsider: if browser-use ships JS port or Stagehand abandons action caching.

## References

- [Stagehand](https://github.com/browserbase/stagehand)
- [Stagehand v3 action caching](https://www.skyvern.com/blog/browser-use-vs-stagehand-which-is-better/)
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser) — fallback if Stagehand action cache underperforms
- [Browser Use](https://github.com/browser-use/browser-use) — fallback if need higher benchmark
