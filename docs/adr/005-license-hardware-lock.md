# ADR-005: License Hardware Lock + Revocation

**Date:** 2026-04-01
**Status:** Accepted

## Context

The app needs a license system that:
1. Works offline indefinitely (no server required)
2. Prevents license file copying between machines
3. Allows instant revocation of compromised keys
4. Supports both trial and paid plans

## Decision

**Ed25519 offline-signed keys with HMAC hardware lock and GitHub Gist revocation.**

### Key Format

```
CLAW-{base64url(payload_json + 64-byte Ed25519 signature)}
```

Payload fields:
- `e` — customer email
- `p` — plan (`premium` | `enterprise`)
- `i` — issue date (YYYY-MM-DD)
- `v` — expiry date (YYYY-MM-DD)
- `m` — (optional) pre-bound machine fingerprint

### Hardware Lock (Seal)

On activation, `license.json` is written to `%APPDATA%/9bizclaw/license.json`. The HMAC seal is computed over `(key + stored_machineId + activatedAt + email)`. On every subsequent check, `verifySeal()` reads the **stored** machineId from the license data (not the current machine). This means:
- Copying `license.json` to another PC → seal uses PC-A's machineId on PC-B → fails
- Copying `%APPDATA%` folder → stored machineId is still PC-A's → fails
- Changing any field → HMAC breaks → rejected

Machine fingerprint: `SHA-256(hostname + first-real-MAC + platform)`. Stored in `%APPDATA%/9bizclaw/.machine-id`.

### Revocation

`revokeKey(hash)` in `license-manager.js`:
1. Removes key from active list (`~/.claw-license-issued.jsonl`)
2. Appends to revocation log (`~/.claw-license-revoked.jsonl`)
3. Pushes hash to a private GitHub Gist (`https://gist.githubusercontent.com/<user>/<gist>/raw/revoked-keys.json`)
4. Running apps check this Gist on every revalidation (24h cache, non-blocking)

### Why Ed25519 (not RSA/ECDSA)

Ed25519 keys produce 64-byte signatures (smaller than RSA 256-byte minimum), are faster, and have fewer implementation pitfalls. The public key is embedded in the app source (`license-public.pem`) — not a secret.

## Consequences

**Positive:**
- Works completely offline (revocation has 24h lag but is non-blocking)
- Hardware lock prevents casual piracy
- No server infrastructure needed
- Pre-bound keys prevent sharing before first activation

**Negative:**
- Hardware lock fails if user changes hostname/MAC (e.g., new network adapter)
- No instant revocation (24h cache on Gist check)
- Gist token must be stored securely on the issuer's machine
- Hardware lock is not true DRM — determined attackers can patch out the check

## Implementation

- `electron/lib/license.js` — core logic (seal, activation, revocation check)
- `electron/lib/license-public.pem` — Ed25519 public key
- `electron/scripts/generate-license.js` — CLI key generator
- `electron/scripts/license-manager.js` — web UI + revocation manager
- `electron/ui/license.html` — activation page
