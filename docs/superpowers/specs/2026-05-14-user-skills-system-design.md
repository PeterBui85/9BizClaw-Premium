# User Skills System — Design Spec

**Date:** 2026-05-14
**Status:** Final (v4)

## Problem

CEOs install MODOROClaw and want to customize bot behavior (tone, rules, workflows). Shipped skills get overwritten on update. No way to add custom rules that cooperate with shipped skills without conflicts.

**Two core requirements:**
1. **Avoid conflict** — user skills must not contradict shipped skills or each other
2. **Cooperate** — user skills complement shipped skills (shipped = WHAT, user = HOW)

## Architecture: Zero Injection

No skill content injected into AGENTS.md. Instead:
- AGENTS.md contains a small instruction (~200 chars) telling the bot about `user-skills/`
- Bot reads `_registry.json` on demand to discover available user skills
- When doing a task, bot checks `appliesTo` matches → `read_file` the relevant skill
- Shipped skill tells WHAT to do, user skill tells HOW (tone, style, constraints)

**Benefits:** No context waste, no 10-skill cap, no AGENTS.md size concerns, no re-injection logic, no gateway restart. Unlimited user skills.

## Storage

```
~/.openclaw/workspace/
├── skills/                         SHIPPED (seedWorkspace managed)
├── user-skills/                    USER (never overwritten)
│   ├── _registry.json              catalog
│   ├── tone-chuyen-nghiep-facebook.md
│   └── khong-noi-gia-duoi-500k.md
```

**Seeding:** `seedWorkspace()` creates `user-skills/` via explicit `fs.mkdirSync` + empty `_registry.json` (same pattern as CEO-MEMORY.md). NOT in `templateDirs`.

### Registry (`_registry.json`)

```json
{
  "version": 1,
  "skills": [
    {
      "id": "tone-chuyen-nghiep-facebook",
      "name": "Tone chuyên nghiệp cho Facebook",
      "type": "override",
      "appliesTo": ["operations/facebook-image"],
      "trigger": "khi đăng bài Facebook",
      "summary": "Dùng tone chuyên nghiệp, xưng chúng tôi, không dùng emoji",
      "enabled": true,
      "createdAt": "2026-05-14T10:00:00Z",
      "createdVia": "telegram-chat"
    }
  ]
}
```

- `id`: ASCII slug (auto-generated from `name`). Used as filename.
- `name`: Vietnamese display name with diacritics.
- `type`: `override` | `rule` | `workflow` | `custom`
- `appliesTo`: shipped skill paths relative to `skills/` (empty = standalone).
- Atomic writes (`.tmp` → rename). Max 100 skills. Namespace collision check against shipped skills on create.

### Skill Files

`workspace/user-skills/{id}.md` — plain markdown, max 500 chars.

## Cooperation Mechanism

AGENTS.md instruction (version bump):

```markdown
## Skill tùy chỉnh

CEO có thể tạo skill riêng. File: user-skills/_registry.json
Khi thực hiện task → đọc registry → nếu có skill `appliesTo` trùng hoặc `type: rule` → read_file skill đó.
Skill tùy chỉnh BỔ SUNG cho skill hệ thống, không thay thế.
Luôn tuân thủ cả skill hệ thống LẪN skill tùy chỉnh.
```

**Example flow:** CEO tạo "Tone chuyên nghiệp" (`appliesTo: operations/facebook-image`). Bot đăng bài Facebook → reads `skills/operations/facebook-image.md` (shipped — WHAT) → checks registry → finds matching user skill → `read_file user-skills/tone-chuyen-nghiep-facebook.md` (HOW) → combines both.

## Conflict Detection

### Layer 1: Keyword Overlap (server-side, deterministic)

On create/edit via API:
- Same `appliesTo` target + overlapping keywords → flag
- Same `trigger` pattern → flag
- Returns `{conflicts: [{skillId, reason}]}`

### Layer 2: Semantic (LLM inline)

- **Telegram:** Bot reads existing skills via API, compares in its own reasoning, warns CEO before saving. Instructed in AGENTS.md.
- **Dashboard:** IPC `check-skill-conflict` calls 9Router `/v1/chat/completions` (15s timeout). Fallback to Layer 1 only.

Non-blocking — warnings only. CEO decides.

## Telegram Skill Creation (Local HTTP API)

Agent has `web_fetch` but NOT `write_file`. Same pattern as cron management.

Endpoints on port 20200 (added to `cron-api.js`):

| Method | Endpoint | Action |
|--------|----------|--------|
| POST | `/api/user-skills/create` | Slugify name → write .md + registry |
| POST | `/api/user-skills/update` | Update .md + registry |
| POST | `/api/user-skills/delete` | Remove .md + registry entry |
| POST | `/api/user-skills/toggle` | Flip enabled |
| GET | `/api/user-skills/list` | Return all user skills |
| POST | `/api/user-skills/check-conflict` | Layer 1 conflict check |

Auth: same rotating cron-api token.

AGENTS.md instruction for bot:
```markdown
## Tạo skill tùy chỉnh

Khi CEO yêu cầu tạo rule/skill ("Từ giờ...", "Rule:...", "Tạo skill:..."):
1. web_fetch GET /api/user-skills/list (đọc skill hiện có)
2. So sánh — phát hiện mâu thuẫn
3. Trình bày cho CEO xác nhận
4. web_fetch POST /api/user-skills/create {name, type, appliesTo, trigger, content}
```

## Dashboard: Tab Skills

Sidebar item after Persona. `switchPage('skills')` pattern.

**Hệ thống (read-only):** Shipped skills from `workspace/skills/`, grouped by subdirectory. Click to view. Cannot edit.

**Tùy chỉnh (full control):** User skills from `user-skills/`. Create, edit, delete, enable/disable toggle. `appliesTo` badge. Conflict check on create/edit.

### IPC Handlers

- `list-all-skills` — shipped (scan dirs) + user (registry)
- `get-skill-detail` — read .md content
- `create-user-skill` → `update-user-skill` → `delete-user-skill` → `toggle-user-skill`
- `check-skill-conflict` — Layer 1 + Layer 2

### Preload Bridges (7 new)

`listAllSkills`, `getSkillDetail`, `createUserSkill`, `updateUserSkill`, `deleteUserSkill`, `toggleUserSkill`, `checkSkillConflict`

## Files Changed

- `electron/lib/skill-manager.js` — **(new)** registry CRUD, conflict detection, shipped skills scanner, slugify
- `electron/lib/cron-api.js` — `/api/user-skills/*` endpoints (6 routes)
- `electron/lib/workspace.js` — seed `user-skills/` dir
- `electron/main.js` — 7 IPC handlers
- `electron/preload.js` — 7 bridges
- `electron/ui/dashboard.html` — Skills tab
- `AGENTS.md` — skill instructions (version bump)

## Edge Cases

- Registry corruption: atomic write + `.tmp` recovery
- Concurrent writes: `_skillRegistryLock` in-flight promise
- Markdown injection: strip `<!--` and `#` from skill content before storing
- AGENTS.md upgrade: shipped skills refreshed, user-skills untouched, instruction re-applied via version bump

## Success Criteria

1. CEO Telegram "Rule: luôn xưng em với khách Zalo" → skill created → visible in Dashboard → bot applies on next Zalo message
2. CEO creates conflicting skill → warning + 3 options
3. App update → user skills preserved
4. User skill `appliesTo: operations/facebook-image` → bot reads it when posting to Facebook (cooperation)
5. Dashboard shows all shipped + user skills
6. Unlimited user skills, no cap
