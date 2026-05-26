---
title: 2026-05-23 HollaCo CORS Proxy
date: 2026-05-23
tags: [project-index, cors-proxy, azure-functions]
type: project-index
status: active
---

# HollaCo CORS Proxy

Azure Function App that re-serves an allowlist of CORS-blocked public URLs with `Access-Control-Allow-Origin: *`. Single-purpose infrastructure piece serving the HollaCo Command Center widget (initial consumer) and any future HollaCo app that needs to probe a CORS-restricted public endpoint from the browser.

#project/cors-proxy #topic/cors #topic/azure-functions

## Origin

Created during HollaCo Command Center Phase 6.2 brainstorming once we discovered that `holla.app.n8n.cloud` (and other status endpoints we want to probe) block CORS from the widget's `hollaco.gallerycdn.vsassets.io` iframe origin. See [[../../../hollaco-command-center/HollaCo Command/Design/2026-05-23 Phase 6.2 n8n via CORS Proxy|Phase 6.2 Design]].

## Architecture

- **Runtime:** Azure Functions v4, Node.js 22 LTS, Flex Consumption plan with 512 MB instance size (auto-scale to zero, free at our scale)
- **Domain:** `proxy.hollaco.com` (custom, Azure managed SSL cert)
- **API:** `GET /api/proxy?upstream=<allowlisted-key>` → upstream body + `Access-Control-Allow-Origin: *`
- **Allowlist:** hardcoded in `src/upstreams.js`. Unknown keys return 400.
- **Auth:** none — every allowlisted upstream is already public.

## Routes

| Method | Route | Since | Purpose | Auth |
|---|---|---|---|---|
| GET | `/api/proxy?upstream=<key>` | v0.1.0 | Re-serve CORS-blocked public endpoints (allowlist in `src/upstreams.js`) | Allowlist only |
| POST | `/api/claude` | v0.2.0 | Forward `{prompt, widgetState}` to Anthropic Messages API; rate-limited | Anonymous + rate limit |

## Application Settings (Function App env vars)

| Name | Purpose | Since |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (secret) | v0.2.0 |
| `ANTHROPIC_MODEL` | Claude model id (e.g. `claude-sonnet-4-6`); change-and-restart to swap | v0.2.0 |

## Current upstreams (v0.1.1)

| Key | Upstream URL | Consumer |
|---|---|---|
| `n8n-cloud-health` | `https://holla.app.n8n.cloud/healthz` | Command Center widget Phase 6.2 (live) |
| `vercel-status` | `https://www.vercel-status.com/api/v2/status.json` | Command Center widget Phase 6.2 (live) |
| `expo-status` | `https://status.expo.dev/api/v2/status.json` | Command Center widget Phase 6.2 (live) |
| `webflow-status` | `https://status.webflow.com/api/v2/status.json` | Command Center widget Phase 6.3 (live, v1.5.1) |
| `anthropic-status` | `https://status.anthropic.com/api/v2/status.json` | Command Center widget Phase 6.3 retrofit (live, v1.5.1) |
| `openai-status` | `https://status.openai.com/api/v2/status.json` | Allowlisted but widget direct-fetches (intentional — OpenAI Statuspage allows wildcard CORS) |

## Releases

| Version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-05-23 | Initial release. n8n-cloud-health live, two retrofit placeholders in allowlist. |
| 0.1.1 | 2026-05-24 | Added webflow-status allowlist entry. Reserved-comment block updated for Anthropic retrofit (widget v1.5.1 now consumes anthropic-status). |
| 0.2.0 | 2026-05-26 | Added `POST /api/claude` route. New `src/rateLimit.js` helper (per-IP 60/min + global 1000/day, in-memory). Two new Application Settings: `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`. `package.json#main` switched to `src/functions/*.js` glob (single-file main silently broke the new function until fixed — see [[../Daily/2026-05-26 v0.2.0 (Ask Claude + main glob fix)|v0.2.0 journal]]). Supports HollaCo Command Center Phase 7.0 (v1.6.0+). |

## References

- [[../Daily/2026-05-23 Bootstrap|Bootstrap journal]]
- Setup walkthrough: `docs/setup-conventions.md` (added in a later commit during this slice)
- Consumer: [[../../../hollaco-command-center/HollaCo Command/Projects/2026-05-20 HollaCo Command Center|HollaCo Command Center]]
