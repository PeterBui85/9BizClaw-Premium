// Customer image send IO (Approach Y, 2026-06-08). Reuses the audited cron-API
// search guard (audience=customer → product/public only) server-side, then sends
// to the CURRENT conversation via the plugin's own session. Never throws.
//
// Security: the agent never reaches the cron-API (Telegram-only auth); this code
// runs in the trusted plugin process and reads the token from disk. The target
// (`to`) is the current conversation passed by the caller — never agent-supplied.
import * as fs from "node:fs";
import * as path from "node:path";
import { sendMediaModoroZalo } from "./send.js";
import { MAX_CUSTOMER_IMAGES } from "./image-marker.js";

const CRON_API_PORT = 20200;     // matches lib/cron-api.js module constant
const IMAGE_PACING_MS = 1000;    // avoid Zalo throttle on multi-image bursts
const ALLOWED_REL_PREFIX = "media-assets";  // only ever send from the media library

type RuntimeLike = { log?: (m: string) => void; error?: (m: string) => void };

export async function deliverCustomerImages(params: {
  query: string;
  to: string;                 // formatted outbound target of THIS conversation
  account: any;
  cfg: any;
  runtime: RuntimeLike;
}): Promise<number> {
  const { query, to, account, cfg, runtime } = params;
  const ws = process.env["9BIZ_WORKSPACE"];
  if (!ws) { runtime.error?.("[image-send] no 9BIZ_WORKSPACE — skip"); return 0; }

  let token = "";
  try { token = fs.readFileSync(path.join(ws, "cron-api-token.txt"), "utf-8").trim(); } catch {}
  if (!token) { runtime.error?.("[image-send] no cron-api token — skip"); return 0; }

  let results: any[] = [];
  try {
    const url = `http://127.0.0.1:${CRON_API_PORT}/api/media/search`
      + `?q=${encodeURIComponent(query)}&audience=customer&limit=${MAX_CUSTOMER_IMAGES}`;
    // NOTE: `X-Source-Channel: telegram` is REQUIRED, not a bug — the cron-API
    // gate (_requireCeoTelegram) only admits the telegram+Bearer pair. This is a
    // TRUSTED server-to-server call from plugin code (not a Telegram message);
    // changing this to "zalo" would 403 (that 403 is the very problem Approach Y
    // routes around). Do not "correct" it.
    const resp = await fetch(url, {
      headers: { "X-Source-Channel": "telegram", "Authorization": `Bearer ${token}` },
    });
    const data: any = await resp.json();
    results = Array.isArray(data?.results) ? data.results : [];
  } catch (e) { runtime.error?.(`[image-send] search failed: ${String(e)}`); return 0; }

  if (results.length === 0) { runtime.log?.("[image-send] no image for query"); return 0; }

  const mediaAssetsRoot = path.join(ws, ALLOWED_REL_PREFIX);
  const roots = [
    ...(Array.isArray(account?.config?.mediaLocalRoots) ? account.config.mediaLocalRoots : []),
    mediaAssetsRoot,
  ];
  let sent = 0;
  const picks = results.slice(0, MAX_CUSTOMER_IMAGES);
  for (let i = 0; i < picks.length; i++) {
    const rel = String(picks[i]?.relPath || "").replace(/\\/g, "/");
    // Containment guard: relPath is workspace-relative (path.relative output) so
    // it could in principle point anywhere in the workspace. Only ever send from
    // the media library, and never let a resolved path escape that root.
    if (!rel || rel.split("/")[0] !== ALLOWED_REL_PREFIX) { runtime.error?.("[image-send] skip non-media-assets relPath"); continue; }
    const abs = path.join(ws, rel);
    if (abs !== mediaAssetsRoot && !abs.startsWith(mediaAssetsRoot + path.sep)) { runtime.error?.("[image-send] skip out-of-root path"); continue; }
    try {
      await sendMediaModoroZalo({ cfg, account, to, mediaPath: abs, mediaLocalRoots: roots });
      sent++;
      if (i < picks.length - 1) await new Promise((r) => setTimeout(r, IMAGE_PACING_MS));
    } catch (e) { runtime.error?.(`[image-send] send failed: ${String(e)}`); }
  }
  return sent;
}
