---
title: 2026-05-29 Anthropic Key Rotation
date: 2026-05-29
tags: [session-journal, cors-proxy, security, anthropic, key-rotation, app-settings]
type: session-journal
status: complete
---

# 2026-05-29 — Anthropic API Key Rotation

Rotated the `ANTHROPIC_API_KEY` Function App setting on `hollaco-cors-proxy`. The previous key leaked into a chat transcript during routine `az` CLI output on 2026-05-26 — not urgent (Anthropic keys are designed to be rotated, and the per-IP/global rate limits in `POST /api/claude` cap blast radius), but worth closing.

#project/cors-proxy #release/key-rotation #topic/security #lessons/secure-handoff

## What changed

- **Anthropic console:** new key generated with traceable name (`hollaco-cors-proxy-2026-05-29`). Old key deleted after verification.
- **Function App `hollaco-cors-proxy`:** App Setting `ANTHROPIC_API_KEY` updated to the new value via `az functionapp config appsettings set`. App auto-restarted on the change. No code or version change — runtime stays v0.2.1.
- **Files:** none. The new key never landed in git.

## Handoff pattern (worth keeping for future rotations)

The credential moved from Anthropic console → user's clipboard → a one-shot file → Function App, with no observable surface exposing it along the way.

1. **Console → user clipboard.** Standard "copy" in the Anthropic UI.
2. **User clipboard → file** (no terminal history leak):
   ```powershell
   $key = Read-Host "Anthropic API key" -AsSecureString
   $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($key))
   [IO.File]::WriteAllText('F:\com.hollaco.cors-proxy\.anthropic-key', $plain)
   $plain = $null
   ```
   `Read-Host -AsSecureString` hides input. `WriteAllText` writes exactly the string with no trailing newline. `$plain = $null` zeroes the PS variable.
3. **File → Function App** (no transcript leak):
   ```bash
   az functionapp config appsettings set \
     --name hollaco-cors-proxy \
     --resource-group hollaco-cors-proxy-rg \
     --settings ANTHROPIC_API_KEY="$(cat .anthropic-key)" \
     -o none
   ```
   `-o none` suppresses the standard JSON echo of all current App Settings — without it, the new key would appear in transcript output. `cat` in the value position keeps the key out of the user's typed command-line history.
4. **Immediate deletion:** `rm .anthropic-key` right after the `az` command succeeds. File never gets committed; the new key only lives in (a) Anthropic console, (b) Function App App Settings (Azure-side secrets store, encrypted at rest).

## Verification

- GET `/api/proxy?upstream=anthropic-status` → HTTP 200 in 0.79s (proxy responding after restart)
- Function App state: `Running`
- Dashboard Ask Claude question via quick-ask chip → returned a grounded answer (confirms the new key is what `POST /api/claude` is using for outbound calls to Anthropic Messages API)

## Why the old key needed deleting

Updating the App Setting doesn't revoke the old key — Anthropic only stops accepting a key when you delete it in the console. Until that step, both keys are valid; a copy of the leaked key would still work for anyone holding it. The "delete old key" step is the actual security event. Order matters: verify new key works FIRST, then delete the old one — otherwise a botched cutover takes the AI panel offline.

## Related notes

- [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy project index]] — runtime still v0.2.1 (no version change for App Setting updates)
- [[../../../hollaco-command-center/HollaCo Command/Projects/2026-05-20 HollaCo Command Center|Widget project index]] — depends on this proxy's `POST /api/claude` for the Phase 7.0+ AI panel
