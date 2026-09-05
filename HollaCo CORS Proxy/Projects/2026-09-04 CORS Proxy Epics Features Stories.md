---
title: 2026-09-04 CORS Proxy Epics Features Stories
date: 2026-09-04
tags: [project, ado, epics, features, stories, hc-cors]
type: project-index
status: active
---

# HollaCo CORS Proxy — Epics, Features & User Stories

**Project:** HollaCo CORS Proxy · **Version:** 0.2.1
**Live:** `proxy.hollaco.com`
**Stack:** Azure Functions v4 · Node.js 22 LTS · Flex Consumption (scale-to-zero)
**Repo scope:** Single-purpose infrastructure — re-serve CORS-blocked public endpoints, and hold the Anthropic key server-side, for the HollaCo Command Center widget

> Retroactive v2 documentation of a shipped service, authored 2026-09-04 per
> [epics-authoring-playbook.md](../../../com.hollaco.portfolio/epics-authoring-playbook.md),
> replacing the two-tier seed note staged in the portfolio repo. Story codes
> `HC-CORS-101`, `102` and `201…203` already exist on the ADO board and are **re-parented
> under Features here, never renumbered**.

---

## Milestones

ADO iteration path: `HollaCo\<iteration>`. Naming follows `milestone-<repo-slug>-<feature-or-phase>`.

| Iteration | Anchor date | Status | Epics | Start | Target |
|---|---|---|---|---|---|
| `milestone-cors-mvp` | 2026-05-24 | Closed | 1 | 2026-05-23 | 2026-05-24 |
| `milestone-cors-claude` | 2026-05-27 | Closed | 3 | 2026-05-26 | 2026-05-27 |
| `milestone-cors-telemetry` | 2026-09-04 | Closed | 4 | 2026-09-04 | 2026-09-04 |
| `milestone-cors-ops` | 2026-08-21 | Active | 2 | 2026-06-02 | 2026-08-21 |

---

## Epic 1: Browser-safe upstream access ✅

**Milestone:** `milestone-cors-mvp`

**Description:** The Command Center widget runs in a `gallerycdn.vsassets.io` iframe, an origin that several public status endpoints refuse. This service re-serves an allowlist of those endpoints with permissive CORS so the widget can show upstream health without a backend of its own.

### Feature: Allowlisted proxy endpoint
**Owner:** Ross McCullough
**Priority:** High
**Target Date:** 2026-05-23
**Description:** A single `GET` route that fetches an allowlisted upstream and returns its body with `Access-Control-Allow-Origin: *`. The allowlist is the entire security model — every entry is already public, so the route needs no authentication, and an unknown key is rejected rather than proxied.

**Acceptance Criteria:**
- [x] Only keys present in `src/upstreams.js` are fetched
- [x] An unknown key returns 400 and never performs a request
- [x] No authentication required, because no allowlisted upstream is private

### HC-CORS-101: Allowlisted Proxy Endpoint ✅
**Type:** Story | **Priority:** High | **Estimate:** 5 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-23)
**As** the Command Center widget,
**I want** to fetch CORS-blocked upstreams through a permissive proxy,
**So that** I can show their health from an iframe origin they don't allow.

**Acceptance Criteria:**
- [x] `GET /api/proxy?upstream=<key>` returns the upstream body with `Access-Control-Allow-Origin: *`
- [x] Allowed keys defined in `src/upstreams.js`
- [x] Unknown keys return 400

### HC-CORS-103: Upstream allowlist and its consumers ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 2 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-24)
Six upstreams are allowlisted: `n8n-cloud-health`, `vercel-status`, `expo-status`, `webflow-status`, `anthropic-status` and `openai-status`. The OpenAI entry is deliberately unused — its Statuspage allows wildcard CORS, so the widget fetches it directly and the allowlist entry is a fallback.

**Acceptance Criteria:**
- [x] All six keys resolve to their documented upstream
- [x] `n8n-cloud-health` unblocks the widget's Phase 6.2 health tile
- [x] The intentionally-unused `openai-status` entry is recorded as such, not treated as dead

### Feature: Adding an upstream
**Owner:** Ross McCullough
**Priority:** Low
**Target Date:** 2026-05-24
**Description:** Extending the allowlist is a one-line change plus an optional test, so a new consumer never needs a code review of the proxy's internals.

**Acceptance Criteria:**
- [x] A new entry in `src/upstreams.js` is proxied with no other change
- [ ] Optional coverage in `src/__tests__/upstreams.test.js`

### HC-CORS-102: Add Upstream Flow
**Type:** Story | **Priority:** Low | **Estimate:** 1 | **Owner:** Ross McCullough | **Status:** Active
Documented flow for adding a new allowlisted upstream with optional test coverage.

**Acceptance Criteria:**
- [x] New entry in `src/upstreams.js` is proxied
- [ ] Optional test in `src/__tests__/upstreams.test.js`

---

## Epic 2: CI/CD & Operations 🔄

**Milestone:** `milestone-cors-ops`

**Description:** Deployment on merge, blocking pull-request gates, the monthly deep security scan, and two-way errata routing into Azure DevOps. One story per `.github/workflows` pipeline.

### Feature: Build and deploy
**Owner:** Ross McCullough
**Priority:** High
**Target Date:** 2026-05-23
**Description:** Merges to `main` reach the Azure Function App without a manual step, and a failing check stops them first.

**Acceptance Criteria:**
- [x] Merge to `main` deploys to `hollaco-cors-proxy`
- [x] Typecheck, lint and tests block a failing pull request
- [x] Deployment can also be triggered by hand

### HC-CORS-201: Deploy ✅
**Type:** Story | **Priority:** High | **Estimate:** 3 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-23)
`deploy.yml` deploys the Azure Function on push to `main`, with `workflow_dispatch` for manual runs. Node 22.x.

**Acceptance Criteria:**
- [x] Merge to main deploys the function
- [x] Manual dispatch available

### HC-CORS-202: PR Checks ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 2 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-23)
`pr-check.yml` runs `typecheck`, `lint` and `test` on pull requests.

**Acceptance Criteria:**
- [x] PRs blocked on failing checks

### Feature: Scheduled security scanning
**Owner:** Ross McCullough
**Priority:** Medium
**Target Date:** 2026-04-30
**Description:** The deep scan only. This repo has no public URL, so under the fleet security v5 empty-shell rule the light 1st-of-month scan has no applicable jobs and is not installed; the 15th deep scan carries the universal history-aware secret scan, which is never pruned.

**Acceptance Criteria:**
- [x] Deep scan runs on the 15th at 09:00 UTC
- [x] Dependency audit and history-aware secret scanning both run
- [x] No `security-1st.yml`, correctly — no light add-on applies

### HC-CORS-203: Scheduled security scan ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 2 | **Owner:** Ross McCullough | **Status:** Complete (2026-04-30)
`security-15th.yml` runs the monthly deep pass — `audit`, `trufflehog` and `notify-failure`. *(Corrects the earlier seed note, which named this `security-monthly.yml`; it was renamed by the security v5 propagation.)*

**Acceptance Criteria:**
- [x] Monthly scan scheduled on the 15th
- [x] Dependency audit at high severity and above
- [x] History-aware verified-secret scan present and never pruned

### Feature: Errata automation
**Owner:** Ross McCullough
**Priority:** Medium
**Target Date:** 2026-08-21
**Description:** Security findings become Azure DevOps errata without anyone copying them across, and close again when the underlying alert clears. Both halves are required — filing alone leaves errata open forever, because Dependabot emits no alert-resolved event.

**Acceptance Criteria:**
- [x] A `security`-labelled issue files an ADO Erratum
- [x] A cleared alert closes its issue, which auto-resolves the work item
- [x] Dependabot raises version updates as well as security updates

### HC-CORS-204: Errata filing ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 3 | **Owner:** Ross McCullough | **Status:** Complete (2026-06-02)
`dependabot-to-errata.yml` opens a GitHub issue for a high or critical Dependabot alert; `file-errata.yml` files the matching ADO Erratum from the `security` label.

**Acceptance Criteria:**
- [x] Dependabot alerts and scan failures file errata items
- [x] Issues carry the `security`, `cve` and `dependency` labels

### HC-CORS-205: Errata auto-resolution ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 3 | **Owner:** Ross McCullough | **Status:** Complete (2026-08-21)
`resolve-errata.yml` transitions a work item to Auto-Resolved when its issue closes, and the `reconcile-resolved-alerts` job closes the issue once its GHSA leaves the open-alert set.

**Acceptance Criteria:**
- [x] Closing a `security` issue auto-resolves the work item
- [x] The daily reconcile job closes issues whose alert has cleared
- [x] Human-advanced advisories are left alone

### HC-CORS-206: Dependabot version updates ✅
**Type:** Story | **Priority:** Low | **Estimate:** 1 | **Owner:** Ross McCullough | **Status:** Complete (2026-09-04)
`.github/dependabot.yml` adds scheduled version updates alongside the existing security updates, so routine bumps arrive as pull requests rather than accumulating.

**Acceptance Criteria:**
- [x] `dependabot.yml` present and raising version-update pull requests

---

## Epic 3: Server-side key custody ✅

**Milestone:** `milestone-cors-claude`

**Description:** The widget needs to ask Claude a question, and a browser must never hold an Anthropic key. This service forwards the request and keeps the credential in Application Settings, which makes it the one place abuse has to be contained.

### Feature: Ask Claude endpoint
**Owner:** Ross McCullough
**Priority:** High
**Target Date:** 2026-05-26
**Description:** A `POST` route that forwards `{prompt, widgetState}` to the Anthropic Messages API using a key held only in Function App settings. The model is configuration, not code, so it can be swapped with a restart.

**Acceptance Criteria:**
- [x] `ANTHROPIC_API_KEY` never leaves Application Settings
- [x] `ANTHROPIC_MODEL` selects the model without a deploy
- [x] The browser sends only a prompt and widget state

### HC-CORS-301: Ask Claude forwarding route ✅
**Type:** Story | **Priority:** High | **Estimate:** 5 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-26)
**As** the Command Center widget,
**I want to** ask Claude a question without holding an API key,
**So that** the credential stays server-side where it can be rotated and rate-limited.

**Acceptance Criteria:**
- [x] `POST /api/claude` forwards `{prompt, widgetState}` to the Anthropic Messages API
- [x] Key and model read from Application Settings
- [x] `package.json#main` glob covers `src/functions/*.js` so the route registers

### HC-CORS-302: widgetState payload cap ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 1 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-27)
The `widgetState` cap was raised from 20K to 64K to unblock the widget's Phase 7.1 wiki grounding — a single-constant change.

**Acceptance Criteria:**
- [x] Payloads up to 64K accepted
- [x] Oversized payloads rejected rather than truncated

### Feature: Abuse protection
**Owner:** Ross McCullough
**Priority:** High
**Target Date:** 2026-05-26
**Description:** An anonymous route in front of a metered API needs a ceiling. Two in-memory limits — one per caller, one for the whole service — bound the blast radius of both a hot loop and a deliberate abuser.

**Acceptance Criteria:**
- [x] A single caller cannot exhaust the budget
- [x] A global ceiling protects spend even across many callers
- [x] Limits are unit-tested

### HC-CORS-303: Per-IP and global rate limiting ✅
**Type:** Story | **Priority:** High | **Estimate:** 3 | **Owner:** Ross McCullough | **Status:** Complete (2026-05-26)
`src/rateLimit.js` enforces 60 requests per IP over a sliding 60-second window and 1000 requests globally over a rolling 24 hours, both held in memory.

**Acceptance Criteria:**
- [x] Per-IP limit 60 / 60s sliding window
- [x] Global limit 1000 / 24h rolling window
- [x] Covered by `src/__tests__/rateLimit.test.js`

---

## Epic 4: Observability ✅

**Milestone:** `milestone-cors-telemetry`

**Description:** Until 2026-09-04 the service was a black box — the Anthropic hop in particular was invisible, so a slow or failing upstream looked identical to a slow function. Application Insights via OpenTelemetry makes both the request and its outbound dependencies observable.

### Feature: Application Insights via OpenTelemetry
**Owner:** Ross McCullough
**Priority:** Medium
**Target Date:** 2026-09-04
**Description:** Host-level request telemetry plus worker-level dependency and log export. Three pieces are load-bearing and each fails **silently** if broken: `host.json#telemetryMode`, `src/index.js`, and `package.json#main` including `src/index.js`.

**Acceptance Criteria:**
- [x] Request telemetry emitted by the host
- [x] Outbound `fetch` dependencies and worker logs exported
- [x] Absent connection string degrades to a no-op rather than an error

### HC-CORS-401: Host request telemetry ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 2 | **Owner:** Ross McCullough | **Status:** Complete (2026-09-04)
`host.json#telemetryMode` switches the Functions host to OpenTelemetry so requests are reported to Application Insights.

**Acceptance Criteria:**
- [x] `telemetryMode` set in `host.json`
- [x] Requests appear in Application Insights

### HC-CORS-402: Worker dependency and log export ✅
**Type:** Story | **Priority:** Medium | **Estimate:** 3 | **Owner:** Ross McCullough | **Status:** Complete (2026-09-04)
A new `src/index.js` bootstrap exports outbound `fetch` dependencies and worker logs. `package.json#main` was extended to `src/{index.js,functions/*.js}` so the bootstrap actually loads — the same class of silent breakage that hid the `/api/claude` route in v0.2.0.

**Acceptance Criteria:**
- [x] The Anthropic hop in `/api/claude` appears as a dependency
- [x] Worker logs reach Application Insights
- [x] `main` glob includes `src/index.js`

### HC-CORS-403: Safe absence of a connection string ✅
**Type:** Story | **Priority:** Low | **Estimate:** 1 | **Owner:** Ross McCullough | **Status:** Complete (2026-09-04)
With `APPLICATIONINSIGHTS_CONNECTION_STRING` unset, `src/index.js` no-ops and nothing is exported, so local runs need no telemetry configuration.

**Acceptance Criteria:**
- [x] No connection string means no export and no error
- [x] Covered by `src/__tests__/telemetry.test.js`

---

## Known gaps

| Item | Note |
|---|---|
| `package.json` version | Still `0.2.1`; the 2026-09-04 telemetry work shipped unversioned |
| Rate-limit state | In-memory, so limits reset on a cold start of a scale-to-zero plan |
| Upstream test coverage | `HC-CORS-102`'s optional test remains unwritten |

---

## Provenance

Derived per [epics-authoring-playbook.md](../../../com.hollaco.portfolio/epics-authoring-playbook.md):

- **Intent** — this vault, chiefly `Projects/2026-05-23 HollaCo CORS Proxy` (routes, application
  settings, allowlist and full release history) and the dated `Daily/` journals that fix each
  completion date, plus `Tech/2026-09-04 Application Insights`.
- **Structure** — the platform knowledge graph (`com.hollaco.cors-proxy`: 24 nodes, 4
  communities). The two substantive communities are `claude.js` + `rateLimit.js` (13 nodes)
  and `proxy.js` + `upstreams.js` (9 nodes); both map onto Features here. The remaining two
  are single config files.
- **Coverage check limitation** — the graph is the 2026-09-03 build, one day older than the
  telemetry work, so `src/index.js` and `telemetry.test.js` do not appear in it. Epic 4 comes
  from the vault and the source tree, not the graph. Worth re-running the survey after the
  next nightly build.

Codes `HC-CORS-101`, `102`, `201`, `202` and `203` came from the two-tier seed note and are
already on the board; they keep their numbers and are re-parented under Features. The seed's
claim that scanning runs from `security-monthly.yml` is corrected in `HC-CORS-203`, and its
Epic 2 covered only three of the six workflows — errata automation and Dependabot version
updates are added here.
