# ADR-004: DELIVER-COALESCE Patch Strategy

**Date:** 2026-05-01
**Status:** Accepted

## Context

The openzalo plugin's `deliver` callback in `inbound.ts` sends one message per AI token chunk. When the AI streams tokens, each chunk fires the callback immediately, causing Zalo to receive multiple messages instead of one.

## Decision

**Inject a coalescing buffer + modified deliver callback + flush timer via runtime string-regex patching of `inbound.ts`.**

The patch is versioned (DELIVER-COALESCE v4) and applied by `ensureOpenzaloForceOneMessageFix()` on every startup. It injects 3 components:

1. **Buffer setup** (Part 1): A `__mcBuffer` array and `__mcDeliver(payload)` function that collects messages and schedules a flush.
2. **Callback replacement** (Part 3): The original `deliver: async (payload) => { await deliverAndRememberOpenzaloReply({...}); }` is replaced with a coalescing version that pushes to the buffer.
3. **Flush injection** (Part 2): `await __mcFlush();` called at the flush anchor before agent dispatch.

The flush timer fires after `coalesceIdleMs` (default 1000ms) of no new tokens, or immediately if the message has `final: true`.

## Version History

- v2: Initial buffer injection, exact string match for callback
- v3: Added error logging to timer (was `.catch(() => {})`)
- v4 (current): Regex-based callback detection (whitespace-agnostic), v3→v4 upgrade path, marker bumped so re-injection is skipped on subsequent boots

## Consequences

**Positive:**
- Group messages are coalesced into one Zalo message
- Group send errors are now logged (not swallowed)
- Idempotent — re-patches on every boot but skips if marker found

**Negative:**
- Fragile: any openclaw update changing `inbound.ts` structure can break the regex match
- Buffer adds ~1s latency on slow models
- If the regex fails silently, the old callback runs unchanged

## Alternatives Considered

**Fork openzalo**: Maintain our own fork of openzalo and patch it at build time. Rejected because it creates a maintenance burden and diverges from upstream.

**Config-based**: Request openzalo to add a `coalesce` config option. Not feasible for third-party plugin.

**Runtime monkey-patch in Node**: Override the `deliver` function at runtime without file modification. Complex and fragile with ES modules.
