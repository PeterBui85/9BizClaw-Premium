# ADR-002: Single-Agent Architecture

**Date:** 2026-04-01
**Status:** Accepted

## Context

The system serves multiple channels (Telegram CEO, Zalo customers, WhatsApp, Lark) with one OpenClaw agent instance. Each channel has different capabilities and trust levels. Zalo customers must not have access to `exec`, `write_file`, or cron creation.

## Decision

**Single agent, channel-isolated at input level**:

1. **Shared agent**: One `agents.defaults` config serves all channels. Single bootstrap prompt (`AGENTS.md` ~30k chars) includes the Capability Router and skill pointers.

2. **Input-level isolation (Zalo/WhatsApp)**: A runtime patch `COMMAND-BLOCK PATCH` rewrites rawBody before the agent sees it, replacing 8 admin command patterns (cron, broadcast, exec, openzca msg send) with placeholder text. This runs in the gateway's openzalo plugin, before the AI dispatch.

3. **tools.allow separation**: CEO Telegram has full tools. Zalo customers have only `message`, `web_search`, `web_fetch`, `update_plan`, `read_file`, `list_files`, `search_files`, `exec`, `write_file`, `apply_patch`, `memory`. Tools `cron`, `process`, `read`, `write` are explicitly excluded.

4. **Output-level isolation**: The output filter (`channels.js` + `send.ts` Layer K) blocks process acknowledgments and sensitive content from all channels.

5. **One-way Zalo cron (CEO Telegram → Zalo groups)**: A local HTTP API on port 20200 exposes cron CRUD. The bot uses `web_fetch` (which is in tools.allow) to call this API. This is safe because `web_fetch` is gated to the agent, and the agent only receives CEO messages. 4-layer protection: (a) command-block rewrites rawBody, (b) cron/exec removed from tools.allow, (c) rotating 48-char auth token regenerated each boot, (d) API binds localhost only.

## Consequences

**Positive:**
- Single model cost and latency
- Shared context across channels (customer history accessible to CEO)
- Simple architecture, no sub-agent spawning latency

**Negative:**
- Input rewriting is fragile — any openclaw update changing how rawBody is processed breaks the command block
- LLM can still attempt operations even with tools removed (safety depends on the model)
- Cannot truly isolate channel contexts (memory, conversation history)

## Alternatives Considered

**Per-channel agents**: Spawn separate openclaw instances per role (CEO-Telegram vs Zalo-customer). Rejected because openclaw natively supports only one agent. Multi-gateway setup is operationally complex and increases resource usage.
