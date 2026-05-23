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

## Current upstreams (v0.1.0)

| Key | Upstream URL | Consumer |
|---|---|---|
| `n8n-cloud-health` | `https://holla.app.n8n.cloud/healthz` | Command Center widget Phase 6.2 (live) |
| `anthropic-status` | `https://status.anthropic.com/api/v2/status.json` | Reserved for Command Center Phase 6.x retrofit |
| `openai-status` | `https://status.openai.com/api/v2/status.json` | Reserved for Command Center Phase 6.x retrofit |

## Releases

| Version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-05-23 | Initial release. n8n-cloud-health live, two retrofit placeholders in allowlist. |

## References

- [[../Daily/2026-05-23 Bootstrap|Bootstrap journal]]
- Setup walkthrough: `docs/setup-conventions.md` (added in a later commit during this slice)
- Consumer: [[../../../hollaco-command-center/HollaCo Command/Projects/2026-05-20 HollaCo Command Center|HollaCo Command Center]]
