---
title: 2026-05-23 Bootstrap
date: 2026-05-23
tags: [session-journal, cors-proxy, bootstrap, azure-functions]
type: session-journal
status: complete
---

# Bootstrap — HollaCo CORS Proxy v0.1.0

Initial repo creation and first deploy of [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy]] to `https://proxy.hollaco.com/api/proxy`. Lives at the same level as the rest of HollaCo's repos (sibling to com.hollaco.collections, com.hollaco.www, hollaco-command-center). Consumer wired up in the same session via HollaCo Command Center [[../../../hollaco-command-center/HollaCo Command/Daily/2026-05-23 Phase 6.2 (v1.5.0)|Phase 6.2 (v1.5.0)]].

#project/cors-proxy #topic/azure-functions #topic/bootstrap

## What shipped

- Azure Function App `hollaco-cors-proxy` on Consumption plan, Node.js 20 LTS, ES modules
- Custom domain `proxy.hollaco.com` with Azure managed SSL cert
- Single HTTP-triggered function `proxy` at route `/api/proxy?upstream=<key>`
- Hardcoded allowlist in `src/upstreams.js` (n8n-cloud-health live + anthropic-status/openai-status as Phase 6.x retrofit placeholders)
- ~10 Vitest tests covering all response branches (200 passthrough, non-2xx passthrough, 400 unknown-upstream, 400 missing-param, 504 timeout, OPTIONS preflight, CORS header presence)
- GitHub Actions workflows: pr-check (typecheck + lint + test), deploy (push to main → Azure), security-monthly (npm audit)

## Why this exists

n8n Cloud's `/healthz` returns clean JSON but doesn't set `Access-Control-Allow-Origin` — same problem as Anthropic's Statuspage. Rather than ship a "Status unknown" row that admits it can't probe anything (negative information value), we add a tiny piece of HollaCo-controlled infrastructure that proxies these endpoints with CORS headers. Reused by Phase 6.3 (Webflow) and Phase 6.x (Anthropic retrofit).

## Next steps

- Phase 6.3 — add `webflow-sites` allowlist entry + widget consumer
- Phase 6.x — switch Anthropic Statuspage (already in allowlist) from direct fetch to proxy-mediated fetch in widget's `statuspage.js`
- Eventually: monitoring/logging dashboard if traffic justifies it
