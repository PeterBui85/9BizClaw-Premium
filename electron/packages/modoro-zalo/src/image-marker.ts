// Customer image-send marker (Approach Y, 2026-06-08) — PURE parse only.
//
// The agent appends [[GUI_ANH: <keywords>]] to its reply when a Zalo customer
// wants a product image. This module extracts the keywords + strips the marker
// so it NEVER reaches the customer. The IO (search + send) lives in image-send.ts
// so this stays import-side-effect-free and unit-testable in bare tsx.
//
// Anti-features: no IO here; no config-object; the cap is overridable only by
// edit (no per-channel override in v1 — YAGNI).

export const MAX_CUSTOMER_IMAGES = 10;

// Closed marker: captures keywords. `[^\]\n]` keeps it single-line + bounded.
const MARKER_RE = /\[\[\s*GUI_ANH\s*:\s*([^\]\n]*?)\s*\]\]/i;
// Strip closed markers AND any unclosed `[[GUI_ANH: ...` fragment (to end of
// line) so a streaming-split marker can never leak to the customer.
const MARKER_STRIP_RE = /\[\[\s*GUI_ANH\s*:[^\]\n]*?\]\]|\[\[\s*GUI_ANH\s*:[^\n]*/gi;

export function parseImageMarker(text: string): { cleaned: string; query: string | null } {
  const raw = String(text ?? "");
  const m = raw.match(MARKER_RE);
  const q = m && m[1] ? m[1].trim() : "";
  const cleaned = raw
    .replace(MARKER_STRIP_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleaned, query: q || null };
}
