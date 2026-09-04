---
title: 2026-09-04 Application Insights
date: 2026-09-04
tags: [tech-index, application-insights, opentelemetry, azure-monitor, telemetry, sentinel]
type: tech-index
status: active
---

# Application Insights

Telemetry for [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy]], via the Azure Monitor **OpenTelemetry** path rather than the classic SDK or the auto-instrumentation agent.

#tech/application-insights #tech/opentelemetry #topic/telemetry #project/cors-proxy

## Resource topology

| | |
|---|---|
| Component | `hollaco-cors-proxy` (`microsoft.insights/components`) |
| Resource group | `hollaco-cors-proxy-rg` |
| Subscription | `cseo-prod-002-eastus2` |
| Ingestion mode | **Workspace-based** |
| Log Analytics workspace | `hollaco-sentinel-us-east-001` (`rg-analytics-prod-002`) |
| Retention | 90 days |
| Daily cap | 100 GB (default — see Cost below) |

Telemetry lands in the **same workspace as security data**, which is a deliberate fleet-wide choice: one workspace to query across app and security signals. The wider HollaCo topology is one component per property per environment, all pointing at this workspace.

## How it is wired

Three pieces, all required. Remove any one and telemetry degrades **silently**.

### 1. Host — `host.json`

```json
{ "version": "2.0", "telemetryMode": "OpenTelemetry" }
```

The host emits **request** telemetry. Under `telemetryMode` the `logging.applicationInsights` block is ignored entirely — it was removed rather than left as misleading config.

### 2. Worker — `src/index.js`

Tracer provider + logger provider, `UndiciInstrumentation` (outbound `fetch`), `AzureFunctionsInstrumentationESM`.

Only **outbound** HTTP is instrumented in the worker. The host owns request telemetry; instrumenting HTTP here too would double-count every invocation.

### 3. Entry point — `package.json`

```json
"main": "src/{index.js,functions/*.js}"
```

If `index.js` is not in `main`, the bootstrap never loads and **nothing else on this page has any effect**. Same field, same silent-failure shape as the v0.2.0 main-glob bug.

### Application Setting

| Name | Value |
|---|---|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Connection string for the component above |

`src/index.js` no-ops with a single console line when this is unset, so local `func start` does not attempt to export.

## Four traps specific to Azure Functions

Recorded because each one fails silently and the general Azure Monitor doc does not cover them.

1. **Do not use `useAzureMonitor()`.** Microsoft's Functions guidance says to avoid the Azure Monitor distro in a Functions worker — it duplicates the request telemetry the host already emits. Use the exporter plus `AzureFunctionsInstrumentation` instead.

2. **Use the ESM class under `"type": "module"`.** `AzureFunctionsInstrumentationESM` with `registerAzFunc(azFunc)`, called **after** `registerInstrumentations()`. The plain `AzureFunctionsInstrumentation` patches via the require hook and cannot work under ESM — you get no invocation spans and no error. The package is CJS-only, so its classes arrive on the **default export**.

3. **The logger provider is mandatory.** `registerAzFunc()` sets `WorkerOpenTelemetryEnabled: true`, which tells the host to **stop forwarding worker logs**. Without a logger provider, `ctx.log()` output is dropped entirely rather than duplicated.

4. **OTel packages must move as a set.** `@azure/monitor-opentelemetry-exporter` targets one OTel generation at a time (currently **0.200**). Mixing generations fails at runtime, not install: on the 0.222 line `AzureMonitorLogExporter` has no `forceFlush`, which `sdk-logs@0.222` requires and throws on at shutdown. `.github/dependabot.yml` groups them for this reason.

## Verification queries

> **Always pass `-o json`.** `az monitor app-insights query ... -o table` prints **nothing even when rows exist** — confirmed with a `print control_row=42` control query. An empty table render is indistinguishable from a dead pipeline, which is the worst possible failure mode for a tool used to check telemetry.

Is anything arriving at all:

```kusto
union isfuzzy=true requests, dependencies, traces, exceptions
| where timestamp > ago(1h)
| summarize n=count() by itemType
```

`dependencies > 0` is the signal that matters — that is what was missing before 2026-09-04.

Are dependencies correlated to their parent request (the real proof the trace tree works):

```kusto
requests
| where timestamp > ago(1h)
| join kind=leftouter (
    dependencies | where timestamp > ago(1h) | summarize deps=count() by operation_Id
  ) on operation_Id
| project name, resultCode, deps=coalesce(deps,0)
```

Expect `200` responses to carry dependencies and a `400` (unknown upstream) to carry **zero** — it returns before any outbound fetch. A bare `dependencies > 0` check would pass even with correlation broken.

What was actually called:

```kusto
dependencies
| where timestamp > ago(1h)
| project timestamp, name, target, type, success, duration
| order by timestamp desc
```

### Query gotchas

- `summarize ... by itemType` with `min(timestamp)`/`max(timestamp)` → `BadArgumentError`. Count-only summarize works.
- `project` drops columns before `order by` sees them — include `timestamp` in the projection if ordering by it.

## Distinguishing host from worker telemetry

Useful when checking whether the worker log path is alive:

| Source | Signature |
|---|---|
| Host (ILogger) | `customDimensions` carries `CategoryName`, `EventId`, `EventName` |
| Worker (OTel) | `customDimensions` **empty** |
| Deployment (Kudu) | `cloud_RoleName` **empty** — build pipeline, not app telemetry |

Because `WorkerOpenTelemetryEnabled` stops host forwarding, worker logs arriving *at all* proves the logger provider is delivering.

## What cannot be tested locally

Outside a real Functions host, `@azure/functions` runs in **test mode** and skips registering the log and `preInvocation` hooks. No local test can prove the hooks fire — only a deployed invocation can. Do not write a test asserting `registerAzFunc()` works; it asserts nothing.

## Trade-offs accepted

- **Portal log streaming stops working** under `telemetryMode: OpenTelemetry` (documented Microsoft behaviour). Use Live Metrics or KQL.
- **`SimpleSpanProcessor`, not `BatchSpanProcessor`** — on Flex Consumption the worker can be frozen between invocations, taking an unflushed batch with it. At this volume batching saves nothing worth that risk.

## Cost

Daily cap is the default **100 GB** with a 90% warning threshold. Volume is trivial (~40 records/month pre-change), so there is no live cost concern — but this is a **public anonymous endpoint**, so it is the one place a traffic spike could translate into ingest spend. Lowering the cap is a one-liner if that ever matters.

## Related notes

- [[../Daily/2026-09-04 Application Insights via OpenTelemetry|2026-09-04 implementation journal]]
- [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy project index]]
- `docs/setup-conventions.md` §7 — operational runbook
- [Azure Monitor OpenTelemetry enablement](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable) · [OpenTelemetry with Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/opentelemetry-howto)
