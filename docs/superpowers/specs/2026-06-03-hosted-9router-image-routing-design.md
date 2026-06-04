# Spec — Route image generation through a hosted remote 9router (Cloudflare tunnel)

**Status:** Parked / design only (2026-06-03). NOT implemented. Verified feasible by live test.
**Owner decision needed before implementing:** API-key handling (§6) + scope (§6).

## TL;DR (vi)
Hiện image gen của app gọi 9router LOCAL (`127.0.0.1:20128`). Mục tiêu: cho nó gọi 1 con
9router REMOTE (host 1 tài khoản ChatGPT, mở qua Cloudflare tunnel) để nhiều máy/khách dùng
chung — không cần codex trên từng máy. **Đã test thật: chạy được** (xem §4). Việc còn lại chỉ
là trỏ `image-gen.js` sang tunnel + chọn cách quản lý API key.

## 1. Goal
Make 9BizClaw image generation use a **central hosted 9router** (one ChatGPT account, exposed
via Cloudflare tunnel) instead of a local codex connection, so client installs need no local
codex login. Keep the exact same `/codex/responses` + `image_generation`/`gpt-image-2` flow.

## 2. Background — current flow (the constraint)
Chat and images are **separate code paths**:
- **Chat** → gateway → 9router via a *configurable* provider base URL (already works remotely).
- **Image** → `electron/lib/image-gen.js`, **hardcoded local**:
  - `NINE_ROUTER_BASE = 'http://127.0.0.1:20128'` (image-gen.js:7)
  - picks codex connection from the *local* `%APPDATA%/9router/db.json` (`provider==='codex'`, ~:172/:194)
  - `POST 127.0.0.1:20128/codex/responses` with `Authorization: Bearer <local apiKey>` + `x-connection-id` (callCodexAPI ~:325-338)
  - request body: `model:"cx/gpt-5.4"`, `tools:[{type:"image_generation",model:"gpt-image-2",size,quality:"high"}]`, `stream:true` (buildCodexRequest ~:223-243)
  - response parsed from SSE for `image_generation_call.result` base64 PNG (parseSSEForImage ~:295-323)

So pointing chat at the tunnel does nothing for images; image-gen must change in code.

## 3. Endpoint (verified)
- Tunnel base: `https://rr9iade.abc-tunnel.us`
- Models: `GET /v1/models` (Bearer key) → lists `cx/gpt-5.4`, `cx/gpt-5.5`, codex variants
- Image: `POST /codex/responses` (root, NOT under `/v1`)

## 4. Verified test evidence (2026-06-03)
Live `curl` against the tunnel with the provided key:
- `GET /v1/models` → 200, model list OK (key + tunnel valid).
- `POST /codex/responses` with the image_generation body above, `stream:false`, **no x-connection-id**
  → **HTTP 200, ~1 MB, ~20s**, returned a valid **1024×1024 PNG** matching the prompt (a red coffee-cup logo).
- **Key findings:**
  - `x-connection-id` is **NOT required** remotely — the hosted 9router auto-routes `cx/gpt-5.4` to its
    single codex provider. (Local code needs it because a machine may have several connections.)
  - `stream:false` works and returns the full JSON (simpler than SSE parsing).

## 5. Design — change in `electron/lib/image-gen.js`
Make the codex call target the remote tunnel. Smaller than first estimated (3 changes, not 4):
1. **Base URL**: `NINE_ROUTER_BASE` → the tunnel (configurable, see §6). Use **https** + port 443
   (current `callCodexAPI` uses `http.request` with `url.hostname/url.port/url.pathname` — switch to
   `https` when the URL is https; protocol-aware).
2. **Auth**: `Authorization: Bearer <remote 9router key>`.
3. **Drop** the local `db.json` connection lookup (`findAllImageConnectionIds`/`findImageConnectionId`)
   **and** the `x-connection-id` header for the remote path — proven unnecessary (§4). This removes a
   fragile local dependency (no more "0 eligible codex connections" failures).
- Keep body (`cx/gpt-5.4` + image_generation/gpt-image-2) and SSE parsing unchanged. `stream` can stay
  `true` (works) or move to `false` (simpler) — either is fine; minimal change keeps `true`.
- Keep a **local fallback**: if the remote URL is unset/unreachable, fall back to the current local
  `127.0.0.1:20128` path (so dev machines with local codex still work). (Decision in §6.)

## 6. Open decisions (resolve before implementing)
1. **Scope** — dev machine only / all customer installs / configurable per install.
2. **API-key handling** (the key is a SHARED SECRET):
   - (a) Hardcode URL+key in source → ends up in every customer `app.asar` (extractable → account abuse);
     rely on rate-limiting at your 9router.
   - (b) **Runtime config** (recommended): app fetches `{imageRouterUrl, imageRouterKey}` from a config it
     pulls at boot (rotatable without a rebuild; can revoke a leaked key).
   - (c) Per-customer keys (most control, most ops).
3. **Cloudflare auth** — does the tunnel use plain passthrough (9router Bearer key only, as tested) or
   Cloudflare Access (then add `CF-Access-Client-Id`/`Secret` service-token headers)? Tested path used
   passthrough (Bearer only).
4. **Fallback** — remote-only, or remote-with-local-fallback (recommended for dev + resilience).

## 7. Risks / caveats
- **One shared ChatGPT account for many clients**: image gen is heavier + rate-limited harder than chat.
  Concurrent image requests across installs will hit per-account limits/queueing fast — need throttling/
  queue/fallback at the 9router. Capacity-plan before rolling to many customers.
- **Account-ban exposure**: all customers' image traffic on one account = single point of failure/ban.
- **Secret in asar** (if option 2a) — see §6.2.
- Only **images** move remote here; chat routing is out of scope (separate, already configurable).

## 8. Out of scope (anti-features)
- Chat/text routing (separate path, already configurable via provider base URL).
- Per-customer codex onboarding.
- Video / non-image media.
- Standing up the remote 9router + Cloudflare tunnel itself (infra task; already exists per §4).

## 9. Verification plan (after implementing)
1. Repeat the §4 `curl` (tunnel `/codex/responses`) — must return a valid PNG.
2. `npm run verify:caps` (the capability harness) with the app running — Facebook/Google/Zalo rows +
   confirm image path; extend the harness to probe the remote `/codex/responses` if desired.
3. End-to-end via Telegram: "tạo ảnh ..." → bot returns a real generated image sourced from the tunnel.
4. Confirm graceful fallback when the tunnel is unreachable (if option in §6.4 chosen).
