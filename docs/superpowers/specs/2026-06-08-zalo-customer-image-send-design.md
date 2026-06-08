# Zalo customer image-send — Design (Approach Y: outbound marker + plugin server-side send)

**Date:** 2026-06-08
**Status:** Approved (brainstorm)
**Approach:** Y — agent emits an outbound marker; the modoro-zalo plugin (trusted
server code) resolves + sends the image to the current conversation. No new
auth surface on the cron-API.

## Problem

When a Zalo customer asks for a product image ("cho xem ảnh giao diện app",
"gửi bảng giá", "xem menu"), the bot does NOT send the image. Live test
(2026-06-07, real bot @TroLyModoro9_bot, Huy Bui DM) — customer asked, bot
replied *"em chưa gửi ảnh trực tiếp trong khung chat này được"* and offered to
escalate. The feature has never worked end-to-end for a customer.

## Root cause (confirmed by live investigation)

The instructions are correct and deployed (live workspace AGENTS.md v119 +
`skills/operations/zalo.md` GỬI ẢNH both tell the agent to call
`/api/media/search` then `/api/zalo/send-media`). But:

- The cron-API is gated `X-Source-Channel: telegram` + Bearer; the bearer is
  injected into the agent's `web_fetch` **only for Telegram sessions**
  (`lib/vendor-patches.js` "Part 3", comment: *"Zalo/customer sessions still hit
  the Cron API without auth and get 403"*). Verified live: unauth /
  `X-Source-Channel: zalo` calls to `/api/media/search` → `"CEO Telegram only."`;
  `/api/zalo/send-media` unauth → **HTTP 403**.
- So the Zalo agent is instructed to call an API it is **architecturally
  forbidden** to call. Unable to succeed, the (capable, `ninerouter/main`) model
  improvises a refusal.
- The alternative `MEDIA:` reply-token path is also broken in this build: the
  plugin's `resolveMediaRoots` defaults to `stateDir/...` (~/.openclaw), not the
  9biz workspace `media-assets/`.

The 403 is **intentional** security (the Zalo customer agent must never hold
cron-API powers — exec/read/write are banned for it). The fix must NOT weaken
that invariant.

## Approach Y — why it wins

Key observation: the **modoro-zalo plugin already sends to Zalo customers** (it
delivers every bot reply via `send.ts:sendTextModoroZalo`) and already has
`sendMediaModoroZalo` (it can send images). It knows the 9biz workspace via
`process.env['9BIZ_WORKSPACE']`. So the plugin — trusted server code, owning the
current conversation — can do the send itself.

The agent's job shrinks to **emitting a marker in its reply text** (single-step
text generation — reliable for any model), instead of completing a multi-step
authenticated `web_fetch` (the thing that fails).

Rejected alternatives:
- **X — capability token / open a narrow cron-API endpoint to the Zalo agent:**
  still relies on the agent completing an authed API call (the failing step), and
  opens a (scoped) hole in the Telegram-only auth. More plumbing, weaker.
- **B — NLP intent-detection in code:** unnecessary; the model is capable, it
  just needs a reachable path. Y keeps the model deciding (it emits the marker).

## Flow

```
Customer asks for an image
 → agent writes a normal text reply AND appends a marker: [[GUI_ANH: <keywords>]]
 → reply leaves via send.ts:sendTextModoroZalo (existing outbound path)
 → plugin:
     (a) STRIP the marker from the text (unconditionally) → send clean text
     (b) if a marker was present:
         - read cron-API token from <9BIZ_WORKSPACE>/cron-api-token.txt
         - GET http://127.0.0.1:20200/api/media/search?q=<keywords>
               &audience=customer&limit=<MAX_IMAGES>
               (server-to-server; headers: X-Source-Channel: telegram + Bearer <token>)
           → results are already brand-excluded + public-only (audited guard:
             audience=customer hard-forces type=product server-side)
           NOTE: the search endpoint's internal default limit is 5 — the plugin
           MUST pass &limit=<MAX_IMAGES> explicitly to allow up to 10.
         - for each of up to MAX_IMAGES results: resolve abs path =
           join(9BIZ_WORKSPACE, result.relPath); send via sendMediaModoroZalo
           to the CURRENT conversation (threadId/isGroup), paced ~1s apart
           (result.relPath confirmed as the field name from live /api/media/list,
            e.g. "media-assets/product/<file>.png"; the API strips absolute paths)
```

Customer never sees `[[GUI_ANH:...]]`; they see clean text, then up to 10 images.

## Components changed (4)

| Component | Change |
|---|---|
| `AGENTS.md` + `skills/operations/zalo.md` (GỬI ẢNH) | Replace "call `/api/media/search` + `/api/zalo/send-media`" with: when the customer wants a product image / bảng giá / menu, write a standalone helpful text reply AND append `[[GUI_ANH: <từ khóa>]]`. The system attaches the image(s) if found. Drop all web_fetch-by-agent image instructions. Bump `CURRENT_AGENTS_MD_VERSION` + the AGENTS.md stamp (workspace refresh is gated on it). |
| `packages/modoro-zalo/src/send.ts` | Outbound hook: detect + strip the marker (always); if present, orchestrate the server-to-server search and paced `sendMediaModoroZalo` to the current conversation. |
| Output filter (`send.ts __ofBlockPatterns` + `lib/channels.js _outputFilterPatterns`) | Add a safety pattern so a `[[GUI_ANH:...]]` marker can NEVER reach a customer even if the strip step is bypassed. (Both mirrors edited — project invariant.) |
| `MODORO_ZALO_FORK_VERSION` (+ `.fork-version`) | Bump — fork source changed. |

## Marker format

- Canonical: `[[GUI_ANH: <từ khóa>]]` — double square brackets, fixed prefix
  `GUI_ANH:`, free-text keywords, closing `]]`.
- Strip regex tolerates whitespace and is global (multiple markers possible but
  only the first triggers a send; the rest are stripped). A malformed/unclosed
  `[[GUI_ANH:` with no `]]` is stripped to end-of-line by a fallback pattern so it
  never leaks.
- Chosen to be ASCII-only and unlikely to collide with normal Vietnamese text.

## Security

- **No new auth surface on the cron-API.** The agent still cannot call it; only
  the plugin (server code, reads the token file) calls it server-to-server. The
  "cron-API = Telegram-only for agents" invariant is preserved.
- **Implicit target** = the conversation the plugin is already handling. The agent
  passes no target, so even a prompt-injected customer cannot redirect an image to
  another person. No capability token needed.
- **Reuse the audited guard:** `/api/media/search?audience=customer` already
  excludes brand assets and returns public-only. The plugin trusts that result
  rather than re-implementing visibility filtering (no guard drift).
- **Fail-safe strip:** the marker is removed unconditionally; on any failure
  (empty search, send error, missing token) the customer still gets the clean
  text and the bot never claims it sent an image.

## Image cap + pacing

- `MAX_IMAGES = 10` — top-of-file constant in send.ts, overridable via
  `channels["modoro-zalo"].maxImagesPerReply`. Plugin sends
  `min(searchResults.length, MAX_IMAGES)`.
- **Paced sends** ~1s between images to avoid Zalo throttle / spam-flagging
  (account-safety; ties to the never-trigger-rate-limit rule). Pacing delay is a
  constant, overridable via config.

## Error handling

- Search returns 0 → send only the text (the agent's text must stand alone).
- `send-media`/`sendMediaModoroZalo` error on an image → log, skip that image,
  continue the rest; never tell the customer "đã gửi ảnh".
- Token file missing/unreadable → skip images, send text, log a warning; the
  reply must not crash.
- cron-API unreachable → same: text only, logged.

## Testing

- **Unit (TS, mirrors the other check-*.ts):** marker parse + strip — present /
  absent / malformed / multiple / mid-sentence; assert customer text is clean;
  assert `min(n, MAX_IMAGES)` selection; mock the search call.
- **Output-filter test:** a raw `[[GUI_ANH:...]]` never passes the filter.
- **Live (exactly one run, CEO DM):** customer message "cho xem ảnh giao diện
  app" → bot replies clean text + the product image, marker not visible. This is
  the close criterion — the feature is only "done" when seen working live.

## Anti-features (deliberately out of scope)

- No new cron-API endpoint or auth scope for the Zalo channel.
- No NLP intent-detection in code (the model decides via the marker).
- No capture/confirm/order flow — this is image-send only.
- No video / file types beyond what `sendMediaModoroZalo` already supports.
- No backfill of past conversations.

## Resolved decisions (closed during spec review)

- **Cron port:** hardcode `20200` as a top-of-file constant in send.ts (matches
  the `cron-api.js` module constant; the app does not export the port to the
  plugin subprocess). No discovery logic.
- **Server-to-server auth:** the plugin reuses the existing
  `X-Source-Channel: telegram` + `Bearer <token>` gate, reading the token from
  `<9BIZ_WORKSPACE>/cron-api-token.txt`. No new `internal` channel enum (YAGNI) —
  the token is secret and plugin-only either way, and the agent still never
  obtains it (vendor-patches injects the bearer only into Telegram agent
  sessions, never Zalo).
- **Search limit:** the plugin passes `&limit=<MAX_IMAGES>` explicitly (endpoint
  default is 5).
- **Asset path field:** `relPath` (verified from live `/api/media/list`);
  absolute paths are stripped by `sanitizeMediaAssetForApi`.
