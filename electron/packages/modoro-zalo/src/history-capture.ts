// At-landing archive capture for inbound Zalo messages. WHY this duplicates the
// Node zalo-history-archive line shape in TS: the plugin runs in a separate
// process; writing straight to disk makes capture independent of the Electron
// main process AND of openzca's database (db enable / messages.sqlite), which is
// the layer that fails on real machines. The Node module stays the canonical
// reader; only the line shape + id rule are mirrored here, pinned by a parity test.
//
// Anti-features: no backfill (forward-only), no openzca calls, no outbound capture
// here (inbound only), no read/summary logic. Not independent of the openzca
// listener — that delivers the message; we only remove the DB dependency.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEDUP_TAIL_BYTES = 256 * 1024;

export type CaptureMessage = {
  messageId: string;
  msgId?: string;
  cliMsgId?: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  mediaPaths?: string[];
  mediaUrls?: string[];
};

export type CaptureParams = {
  ownerId: string;   // botUserId — the owner's Zalo self id (archive namespace)
  threadId: string;  // DM: resolved directPeerId; group: message.threadId
  isGroup: boolean;
  message: CaptureMessage;
  log?: (m: string) => void;
};

function isSafeId(id: unknown): boolean {
  return ID_RE.test(String(id == null ? "" : id));
}

// Pure mapping to the archive line shape — mirrors zalo-history-archive._toLine.
// `dir` derived from owner identity; `msgType` is best-effort ('' | 'media') since
// the inbound payload carries no openzca msg_type (no reader branches on it).
export function buildLine(p: { ownerId: string; message: CaptureMessage }): {
  msgId: string; ts: number; senderId: string; senderName: string;
  dir: "in" | "out"; msgType: string; text: string;
} {
  const m = p.message;
  const senderId = String(m.senderId == null ? "" : m.senderId);
  const hasMedia = (m.mediaPaths?.length || 0) > 0 || (m.mediaUrls?.length || 0) > 0;
  return {
    msgId: String(m.msgId || m.cliMsgId || m.messageId || ""),
    ts: Number(m.timestamp) || 0,
    senderId,
    senderName: String(m.senderName == null ? "" : m.senderName),
    dir: senderId === String(p.ownerId) ? "out" : "in",
    msgType: hasMedia ? "media" : "",
    text: String(m.text == null ? "" : m.text),
  };
}

// Resolve <ws>. Same chain as inbound.ts owner-takeover block: env → per-platform
// app-data. Full chain (not env-only) so it works when 9BIZ_WORKSPACE is unset.
function resolveWorkspace(): string {
  const env = process.env["9BIZ_WORKSPACE"];
  if (env) return env;
  const home = os.homedir();
  const appDir = "9bizclaw";
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", appDir);
  if (process.platform === "win32") {
    const ad = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(ad, appDir);
  }
  const cfg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(cfg, appDir);
}

// Existing msgIds in the file tail (dedup). Mirrors zalo-history-archive._existingMsgIds.
function existingMsgIds(file: string): Set<string> {
  const seen = new Set<string>();
  let raw: string;
  try {
    const size = fs.statSync(file).size;
    if (size > DEDUP_TAIL_BYTES) {
      const fd = fs.openSync(file, "r");
      try {
        const buf = Buffer.alloc(DEDUP_TAIL_BYTES);
        const n = fs.readSync(fd, buf, 0, DEDUP_TAIL_BYTES, size - DEDUP_TAIL_BYTES);
        raw = buf.toString("utf-8", 0, n);
      } finally { fs.closeSync(fd); }
      const nl = raw.indexOf("\n");
      if (nl >= 0) raw = raw.slice(nl + 1);
    } else {
      raw = fs.readFileSync(file, "utf-8");
    }
  } catch { return seen; }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try { const o = JSON.parse(line); if (o && o.msgId != null) seen.add(String(o.msgId)); } catch {}
  }
  return seen;
}

// Append one inbound message to the durable archive at landing. Best-effort:
// never throws. Returns true iff a line was written. Skips (returns false) on
// unsafe/missing ids or no usable msgId — the poller backup still captures those.
export function captureInbound(p: CaptureParams): boolean {
  try {
    if (!isSafeId(p.ownerId) || !isSafeId(p.threadId)) return false;
    const line = buildLine({ ownerId: p.ownerId, message: p.message });
    if (!line.msgId) return false;
    const ws = resolveWorkspace();
    if (!ws) return false;
    const root = p.isGroup ? "zalo-group-history" : "zalo-history";
    const dir = path.join(ws, root, p.ownerId);
    const file = path.join(dir, p.threadId + ".jsonl");
    if (existingMsgIds(file).has(line.msgId)) return false;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(line) + "\n", "utf-8");
    return true;
  } catch (e: any) {
    p.log?.(`modoro-zalo: history capture failed (non-blocking): ${e?.message}`);
    return false;
  }
}
