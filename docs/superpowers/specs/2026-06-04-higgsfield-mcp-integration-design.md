# Higgsfield MCP Integration — full creative capability for 9BizClaw

Date: 2026-06-04
Status: Design (spec only; implementation deferred — CEO wants full capability later)

## Goal
Give the CEO (via Telegram) the full Higgsfield creative platform inside 9BizClaw —
image/video generation (35+ models), marketing studio, Virality Predictor, Soul
character training, YouTube clipper, upscale/reframe — through OpenClaw's MCP
client, co-equal with the existing free-Veo3 path. Customer-facing Zalo NEVER
gets these tools (paid credits + arbitrary media = abuse surface).

## Proven already (this session — de-risks the core)
- Higgsfield MCP is a **hosted remote server**: `https://mcp.higgsfield.ai/mcp`
  (Streamable HTTP, no binary — sidesteps the CLI's GitHub-release download wall
  that fails on customer proxy/AV networks).
- **OAuth device flow works** on the real machine/network. Endpoints (the device
  server's `.well-known` is non-standard; discovered via its `/openapi.json`):
  - `POST https://fnf-device-auth.higgsfield.ai/authorize` `{client_id:"openclaw",
    scope:"openid email offline_access"}` → `{device_code, verification_uri,
    interval, expires_in(900s)}`. `verification_uri` = `https://higgsfield.ai/device?code=…`
  - `POST …/token` `{device_code}` → `{access_token(Bearer,~60min), token_type,
    expires_in, refresh_token, refresh_expires_in}` (poll at `interval`=3s).
  - `POST …/refresh` (refresh_token) → new tokens. `POST …/approve` is the
    browser side. `POST …/validate`.
  - Protected-resource discovery: `https://mcp.higgsfield.ai/.well-known/oauth-protected-resource`
    (lists the device auth server + `higgsfield_auth_hints` → device_code flow is
    explicitly for clients `openclaw/hermes/memoclaw`).
- Token authenticates: MCP `initialize` → 200, `tools/list` → **29 tools**
  (generate_image, generate_video, models_explore, show_marketing_studio,
  virality_predictor, video_analysis, show_characters (Soul), media_upload,
  personal_clipper_create, reframe, upscale_video, balance, list_workspaces, …).

## Open question the implementation MUST resolve first
Does OpenClaw 2026.4.14's MCP client (a) accept a **static `Authorization: Bearer`
header** per `mcpServers` entry (then WE own token + refresh), or (b) insist on
running its **own** OAuth (its built-in flow is auth-code/PKCE, NOT Higgsfield's
device flow → would fail for a headless gateway)? Verify by inspecting the
`mcpServers` config schema in the bundled openclaw dist (look for `headers`/`type:
streamable-http`/`transport`). Decision branches the whole token-wiring design:
- **(a) static header (preferred):** we run the device flow + a refresh daemon,
  inject the current access_token as the server's `Authorization` header.
- **(b) OpenClaw-owns-OAuth:** find where OpenClaw stores MCP credentials for a
  remote server and write our device-flow tokens into that store in its format.

## Architecture

1. **`lib/higgsfield-auth.js`** — device-flow + token lifecycle (generalize the
   working poller from this session):
   - `startDeviceFlow()` → `{verification_uri, device_code, interval, expires_at}`.
   - `pollToken(device_code, interval, expires_at)` → tokens (resolves when the CEO
     approves).
   - `refreshIfNeeded()` → uses `refresh_token` via `…/refresh` before the 60-min
     access token expires (a small interval/daemon, or refresh-on-demand).
   - Token store: `<userData>/higgsfield-creds.json` (a CREDENTIAL — add to
     `.gitignore`; NOT in SACRED_DIRS backups since it's re-obtainable via re-auth,
     and we don't want tokens copied into plaintext backups).
   - Never log token values.

2. **Onboarding (CEO via Telegram, on-demand — not the wizard):**
   - CEO says "kết nối Higgsfield" → cron-api endpoint `POST /api/higgsfield/connect`
     → `startDeviceFlow()` → bot replies "Mở link này đăng nhập Higgsfield: <uri>"
     → background poll → on success bot confirms "Đã kết nối Higgsfield".
   - `GET /api/higgsfield/status` → connected? balance? (calls `balance` tool).

3. **OpenClaw MCP wiring (the integration seam):**
   - Add a `mcpServers` entry for `https://mcp.higgsfield.ai/mcp` (streamable-http)
     ONLY when creds exist. Per the open question, either static Authorization
     header (refreshed) or OpenClaw's credential store.
   - `ensureDefaultConfig()` must INJECT this entry (and preserve it through the
     "delete unrecognized keys" heal) when `higgsfield-creds.json` exists, and omit
     it when not — via `writeOpenClawConfigIfChanged()` (NEVER raw/PowerShell edit).
   - On token refresh, update the header in openclaw.json via the same in-process
     writer (byte-equal guard avoids a gateway restart storm).

4. **Security — CEO-only (HARD):**
   - Higgsfield MCP tools must be available ONLY on the CEO Telegram channel, never
     on a Zalo customer turn. Enforce at the tool-gate level (tools.allow scoping
     per channel) AND verify the MCP tools don't leak into the Zalo `inbound.ts`
     tool set. A Zalo customer must never be able to invoke `generate_image` (burns
     CEO credits) or any Higgsfield tool. Add a smoke/guard test.

5. **Intent routing (AGENTS.md, CEO section):**
   - Map CEO intents → tools: "tạo ảnh sản phẩm/marketing" → `generate_image`
     (marketing_studio preset); "tạo video" → `generate_video`; "nhân vật thương
     hiệu nhất quán" → Soul `show_characters`/training; "phân tích/virality video"
     → `virality_predictor`/`video_analysis`; "cắt clip YouTube" →
     `personal_clipper_create`; "đổi tỉ lệ/nâng nét video" → `reframe`/`upscale_video`.
   - Co-equal with free-Veo3: for plain image/video, offer both engines; Higgsfield
     when premium models/4K/Soul-consistency/marketing-studio are wanted.
   - Always check `balance` before a paid generation; surface cost; never silently
     overspend.

## Cost-conservation process (CRITICAL — CEO requirement)
A Plus customer has ~1,000 credits and model cost varies **~50×**. Defaulting to a
premium model burns their credits in a day. The bot MUST default to the cheapest
viable model and never waste credits. Community-reported rates (NOT published in API
— treat as approximate, refine from actual job cost at runtime):
- Image: **nano_banana ~1-2 cr** (budget, default) · nano_banana_2 (2k) · nano_banana_pro/4k (priciest image).
- Video: **Kling ~7 cr/720p** (cheapest, default) · Seedance ~25 cr/5s · **Sora 2 / Veo 3.1 ~40-70 cr** (avoid by default).
- Cost multipliers within a model: resolution (1k→4k, 480p→1080p), duration (4s→15s), mode (fast→std).

Process (enforced in CODE + AGENTS routing, not LLM goodwill):
1. **ECONOMY by default, always:** image → `nano_banana`; video → the cheapest model
   (Kling 720p), `mode:fast`, lowest resolution (1k / 480-720p), shortest duration (4-5s).
   A maintained **cost-tier table** (economy / mid / premium) lives in code; the
   default picker NEVER selects a mid/premium model on its own.
2. **Pre-flight check:** before ANY paid generation, call `balance`; estimate cost
   from the tier table × params. If the estimate exceeds a small threshold (e.g.
   >10 cr) OR balance is low → tell the CEO the cost + ask to confirm. Cheap economy
   gens (≤ a few cr) run without nagging.
3. **Premium = explicit opt-in only.** Sora/Veo/Seedance, 4k, 1080p, long video, Soul
   training → only when the CEO explicitly asks ("chất lượng cao", "Veo", "4k", "video dài").
   Then state the cost + remaining balance + confirm before spending.
4. **Learn real costs:** the generate job result reports actual credits used → record
   per (model, params) to refine the tier table over time (the published rates are
   approximate). Surface "đã dùng ~N credit, còn M" after each gen.
5. **Guardrails (fail-loud):** if balance below a floor → warn + refuse premium; cap
   credits/day per the CEO; never silently pick an expensive model; log every spend.

## Anti-features
- NOT the `@higgsfield/cli` (its install downloads a GitHub-release binary that
  fails on customer proxy/AV networks — the MCP path is chosen precisely to avoid this).
- NOT exposed to Zalo customers.
- NOT bundling Higgsfield credits — each CEO uses their own Higgsfield account/plan.
- NOT auto-connecting — opt-in per CEO (paid).

## Testing
- `higgsfield-auth`: device-flow request shape, token parse, refresh, expiry. (Unit;
  stub the HTTP. The live flow is already proven this session.)
- MCP reachability under the Electron runtime (`verify-runtime.js` extension):
  initialize + tools/list with a token → 200/29 tools.
- **Security guard:** a Zalo customer turn cannot see/invoke any `higgsfield`/MCP
  tool (assert tool-set isolation). This is the load-bearing test.
- ensureDefaultConfig injects the mcpServers entry when creds exist + preserves it
  across the heal; omits when absent.

## Effort estimate
~2-4 days. Lowest-risk part (MCP call + device flow) is done. Bulk is the token
lifecycle + OpenClaw config injection + the CEO-only isolation + verifying the
OpenClaw-MCP-client token mechanism (the open question above).
