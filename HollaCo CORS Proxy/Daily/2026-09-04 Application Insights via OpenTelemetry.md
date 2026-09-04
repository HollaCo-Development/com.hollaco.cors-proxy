---
title: 2026-09-04 Application Insights via OpenTelemetry
date: 2026-09-04
tags: [session-journal, cors-proxy, telemetry, opentelemetry, application-insights, azure-functions, dependabot, security]
type: session-journal
status: complete
---

# Application Insights via OpenTelemetry

Wired [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy]] to Application Insights using the Azure Monitor OpenTelemetry path, then cleared the two `high` npm advisories that had been sitting unactioned. Both turned out to be the same failure mode: **something that looked fine because nothing was reporting.**

#project/cors-proxy #topic/telemetry #topic/opentelemetry #topic/azure-functions #topic/security #lessons/silent-telemetry

## The starting state was worse than "not set up"

Application Insights was already provisioned — `hollaco-cors-proxy`, workspace-based into the Sentinel workspace `hollaco-sentinel-us-east-001`, 90-day retention — and `APPLICATIONINSIGHTS_CONNECTION_STRING` was already an Application Setting. It looked done.

Thirty days of telemetry said otherwise:

| itemType | count |
|---|---|
| trace | 37 |
| customMetric | 9 |
| exception | 1 |
| **request** | **0** |
| **dependency** | **0** |

Zero dependency telemetry means no outbound call was observable — including the Anthropic API hop in `/api/claude`, which is the single most useful thing to see when the AI panel misbehaves. The auto-instrumentation agent was producing thin counts and nothing else, and the absence read as "quiet service" rather than "broken pipeline".

## What shipped (PR #20, commit `dba1916`)

- **`host.json`** — added `"telemetryMode": "OpenTelemetry"`. Removed the `logging.applicationInsights` sampling block, which `telemetryMode` ignores entirely. Deleted rather than left in place: config that lies about what runs is worse than no config.
- **`src/index.js`** — new worker bootstrap. Tracer provider + logger provider, `UndiciInstrumentation` for outbound `fetch`, and `AzureFunctionsInstrumentationESM`.
- **`package.json`** — `main` becomes `src/{index.js,functions/*.js}`. Without this the bootstrap never loads and nothing else has any effect. (Direct descendant of the v0.2.0 main-glob bug — see [[2026-05-26 v0.2.0 (Ask Claude + main glob fix)|v0.2.0 journal]]. Same field, same silent-failure shape, third time it has mattered.)
- **`src/__tests__/telemetry.test.js`** — guards the wiring whose failure mode is silence.

## Four things the Microsoft doc gets wrong for this repo

Ross pointed me at [the Azure Monitor OpenTelemetry enablement doc](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable). Following it literally would have produced a broken or duplicate-reporting app. Each of these fails *silently*.

### 1. `useAzureMonitor()` is the wrong entry point for Azure Functions

The doc's Node.js tab says call `useAzureMonitor()`. Microsoft's *own* Functions guidance says the opposite: **"avoid using the Azure Monitor distro in the worker process to prevent duplicate telemetry."** The host already emits request telemetry under `telemetryMode`; adding the distro double-counts every invocation.

Correct combination: host `telemetryMode` + exporter + `AzureFunctionsInstrumentation`, and instrument **only outbound `fetch`** in the worker.

### 2. This repo is ESM, so the documented class is the wrong class

`@azure/functions-opentelemetry-instrumentation` is CJS-only, so under `"type": "module"` its classes arrive on the **default export**, not as named exports. More importantly it ships two classes, and the doc only mentions one:

- `AzureFunctionsInstrumentation` — patches via the require hook. Cannot work under ESM.
- `AzureFunctionsInstrumentationESM` — exposes `registerAzFunc(azFunc)`, which you hand the module directly.

Use the documented one here and you get **no invocation spans and no error**.

Ordering matters too: `registerAzFunc()` must run **after** `registerInstrumentations()`, because that is what assigns the tracer and logger it patches with.

### 3. The doc's sample code no longer compiles against current OTel

`tsc` caught three separate drifts from the published sample:

| Doc sample | Reality in OTel v2 |
|---|---|
| `detectResourcesSync()` | Gone — use `resourceFromAttributes()` |
| `provider.addSpanProcessor(...)` | Gone — pass `spanProcessors` to the constructor |
| `loggerProvider.addLogRecordProcessor(...)` | Still present in `sdk-logs@0.200`, **removed** in 0.222 |

The typecheck was the only thing that caught these. Worth keeping `npm run typecheck` in the loop for any instrumentation work.

### 4. The logs pipeline is mandatory, and it is not obvious why

This is the one I nearly got wrong. My first instinct was to drop the logger provider as redundant — the Functions host already forwards worker logs, so why run a second path and risk duplicates?

Reading the instrumentation source showed the opposite. `_patch()` calls:

```js
azFunc.app.setup({ capabilities: { WorkerOpenTelemetryEnabled: true } })
```

That tells the host to **stop forwarding worker logs**, and re-emits them through `this.logger`. So omitting the logger provider does not de-duplicate anything — it **deletes `ctx.log()` output entirely**. Silent loss, no error, and it would have looked exactly like "the proxy never logs anything".

Lesson: when an instrumentation package sets a host capability, find out what that capability turns *off*.

## Dependency version alignment — a runtime trap, not an install trap

`@azure/monitor-opentelemetry-exporter@1.0.0-beta.32` targets the OTel **0.200** generation. npm happily installed the 0.222 generation alongside it. That combination installs cleanly and breaks later:

**`AzureMonitorLogExporter` has no `forceFlush`** — verified absent at runtime, not merely missing from the types — and `sdk-logs@0.222` requires it and calls it on shutdown.

Resolution: pin the OTel experimental packages to the 0.200 generation (`instrumentation@^0.200`, `instrumentation-undici@^0.11`, `sdk-logs@^0.200`). This is why `.github/dependabot.yml` now **groups** the OTel packages — they must move as a set, and a piecemeal bump would silently reintroduce this.

Separately, `overrides: { "@opentelemetry/core": "^2.11.0" }` clears GHSA-8988-4f7v-96qf. That sits inside the `^2.0.0` range the exporter itself declares, so it is a dedupe rather than a forced upgrade. The advisory was not reachable anyway — the `preInvocation` hook extracts only `traceparent`/`tracestate`, never `baggage`.

## Verification — and why "no errors" was never going to be enough

Given the starting state, an all-clear had to be a **non-zero count**, never an absence of errors.

Five requests driven through the live proxy after deploy:

| Signal | Before (30d) | After (5 requests) |
|---|---|---|
| requests | 0 | 5 |
| **dependencies** | **0** | **7** |
| traces | 37 | 62 |

Dependencies traced:

```
GET /api/v2/status.json  →  www.vercel-status.com    12ms, 14ms, 98ms
GET /api/v2/status.json  →  status.anthropic.com     97ms
GET /api/v2/status.json  →  status.claude.com        40ms   (redirect hop)
init (cold start)                                    629ms, 703ms
```

The correlation check is the part that actually proves it. All four `200` responses have correlated child dependencies; **the `400` has zero** — exactly right, because an unknown upstream key returns before any outbound fetch. A naive `dependencies > 0` assertion would have passed even with the trace tree broken.

Also confirmed: `Loaded entry point file "src/index.js"` appears in production traces, and `cloud_RoleName` resolves to `hollaco-cors-proxy` for App Map.

### Proving the worker log path

The riskiest piece, since a broken logger provider drops logs silently. Production data distinguishes the two sources cleanly:

- **Host** logs carry `CategoryName` / `EventId` (the ILogger schema)
- **Worker** logs arrive with **empty `customDimensions`** — the OTel signature

Since `WorkerOpenTelemetryEnabled` stops host forwarding, worker logs arriving *at all* proves the provider is delivering them.

## Gotcha: `az monitor app-insights query -o table` returns nothing

Burned ~15 minutes and nearly produced a false all-clear. `az monitor app-insights query ... -o table` prints **empty output even when the query returns rows**. Confirmed with a `print control_row=42` control query, which also printed nothing.

**Always use `-o json`** for this command. An empty table render is indistinguishable from a component with no telemetry — precisely the wrong failure mode for a tool you are using to check whether telemetry works.

Related: `summarize ... by itemType` with `min(timestamp)`/`max(timestamp)` returns `BadArgumentError: The request had some invalid properties`. Count-only summarize works. And `project` drops columns before `order by` sees them.

## What cannot be verified locally

Outside a real Functions host, `@azure/functions` runs in **test mode** and skips registering both the log and `preInvocation` hooks:

```
WARNING: Skipping call to register log hook because the "@azure/functions" package is in test mode.
WARNING: Skipping call to register preInvocation hook because the "@azure/functions" package is in test mode.
```

So no local test can prove the hooks fire — only a deployed invocation can. I deliberately did **not** write a test asserting `registerAzFunc()` works, because it would assert nothing. The post-deploy KQL check is not optional here; it is the only real verification.

## Second thread: the two `high` advisories (PR #21, commit `7578e34`)

`npm audit` had been reporting 2 high severity findings. Investigated on Ross's ask.

**Both were unreachable and neither ever shipped:**

- `nanoid` ← postcss ← vite ← vitest. postcss calls `nanoid(6)` — a hardcoded size. GHSA-2v37-7h3g-55p8 needs a *custom generator sized zero*. That call does not exist in this tree.
- `brace-expansion` ← minimatch ← eslint. minimatch's only inputs are this repo's own static eslint globs. The DoS needs an attacker-supplied brace pattern, and nothing untrusted reaches eslint.

Both dev-scoped, absent from `npm ls --omit=dev`, and the deploy prunes dev deps before packaging.

### Why nothing was ever going to fix them

GitHub **auto-dismissed** all three alerts (#10, #11, #14) on 2026-08-17 purely on `scope: development`. That quietly disabled every mechanism at once:

| Mechanism | Behaviour |
|---|---|
| Dependabot security updates | Auto-dismissed → no PR ever opens |
| `dependabot-to-errata.yml` | Queries `state=open` — auto-dismissed alerts are invisible to it |
| `security-15th.yml` | Runs `npm audit ... \|\| echo` — prints, never fails |

Dependabot had bumped brace-expansion to 1.1.16 in PR #11. GHSA-rgw5-rvv9-x895 then landed stating *that exact mitigation was bypassable* and 1.1.18 was required — and no PR followed, because by then the alert was auto-dismissed.

So `npm audit` was going to report "2 high" indefinitely with nothing on track to clear it. **That is the actual risk here** — not the DoS advisories, which are harmless in this repo, but an audit signal that is permanently red and therefore ignored.

### The fix

Both patched versions were already inside the declared ranges (`minimatch` wants `^1.1.7`, `postcss` wants `^3.3.16`), so no overrides were needed and `package.json` was untouched:

```
npm update brace-expansion nanoid
```

`npm audit` → **0 vulnerabilities**. Six-line lockfile diff.

`npm audit fix` was deliberately **not** used — it drags in 24 optional platform binaries (lightningcss, rolldown bindings) to arrive at the same two bumps.

Added `.github/dependabot.yml` for scheduled version updates, which are not conditional on an alert being open. Includes the `github-actions` ecosystem, which the deploy's Node 20 deprecation warnings already call for.

## Correction worth recording

I initially read the `npm audit fix --dry-run --json` output as proving the fix did not work, because the `audit` field still showed 2 high. That field is the **pre-fix** audit state, not post-fix. Applying it for real gives `found 0 vulnerabilities`. Do not read `--dry-run --json` audit metadata as a prediction of the result.

## Follow-ups

- **No version bump.** `package.json` remains `0.2.1` despite this being a shipped feature. The Releases table in the project index has a dated row instead. Decide whether telemetry warrants `0.3.0` retroactively.
- **App Insights daily cap is the default 100 GB** on a public anonymous endpoint. Irrelevant at current volume (~40 records/month) but it is the only real cost exposure. One command to lower.
- **Portal log streaming no longer works** under `telemetryMode: OpenTelemetry`. Documented Microsoft behaviour, accepted trade — use Live Metrics or KQL instead.
- **First dependabot run** after `7578e34` will likely open grouped PRs for pending dev-dependency and action updates. That is the config working, not a problem.
- `.gitignore` had `.vscode/` un-ignored locally at session start (not by me — timestamps predate my first edit, likely the Azure Functions VS Code extension). Restored.

## Related notes

- [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy project index]]
- [[../Tech/2026-09-04 Application Insights|Application Insights tech index]]
- [[2026-05-26 v0.2.0 (Ask Claude + main glob fix)|v0.2.0 journal]] — the original `package.json#main` silent-failure
- `docs/setup-conventions.md` §7 — telemetry runbook and verification queries
