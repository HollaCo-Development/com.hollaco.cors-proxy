# AGENTS.md — HollaCo CORS Proxy

Project conventions for agentic workers (Claude Code, Copilot, etc.).

## What this repo is

An Azure Function App that re-serves an allowlist of public URLs with `Access-Control-Allow-Origin: *`. Two HTTP functions: `GET /api/proxy` (the allowlist re-server) and `POST /api/claude` (rate-limited Anthropic passthrough for the Command Center widget). Small — a few hundred lines.

## Stack

- Azure Functions v4 (Node.js 22 LTS, ES modules — `"type": "module"`), Flex Consumption
- Vitest + node environment for tests
- ESLint flat config (`eslint.config.mjs`)
- jsconfig + checkJs for type validation
- GitHub Actions for CI + deploy (**OIDC via Entra federated credential** — not publish-profile; see `docs/setup-conventions.md` §5)
- Application Insights via OpenTelemetry (`host.json` + `src/index.js`)

## Conventions

- Single-quoted strings.
- No comments unless WHY is non-obvious.
- TDD where it adds value (the handler is pure — easy to test). Skip TDD for config/scaffolding files.
- Frequent commits, conventional commit messages.
- Never add a new upstream without an allowlist entry in `src/upstreams.js`.
- Never accept arbitrary URLs as the `upstream` query param — always look up an allowlisted key.
- **`package.json#main` must keep matching every entry file.** It is currently `src/{index.js,functions/*.js}`. Adding a function without covering it here means the route 404s with no error (v0.2.0); dropping `src/index.js` means telemetry silently stops (2026-09-04). Same field, same silent-failure shape, twice.

## Telemetry

Application Insights via OpenTelemetry. Runbook: `docs/setup-conventions.md` §7. Background: [[Tech/2026-09-04 Application Insights]].

Three rules, each guarding a failure that produces **no error**:

- **Don't add `useAzureMonitor()` or HTTP instrumentation to the worker.** The host emits request telemetry under `host.json#telemetryMode`; either would double-count every invocation. Only outbound `fetch` is instrumented in the worker.
- **Use `AzureFunctionsInstrumentationESM` + `registerAzFunc()`**, called *after* `registerInstrumentations()`. This repo is ESM, so the non-ESM class silently produces no invocation spans. The package is CJS-only — its classes come off the default export.
- **Don't remove the logger provider.** `registerAzFunc()` sets `WorkerOpenTelemetryEnabled`, which stops the host forwarding worker logs, so it becomes the only path for `ctx.log()`.

Bump the OpenTelemetry packages **as a group, never individually** — `@azure/monitor-opentelemetry-exporter` targets one OTel generation at a time and mixing them breaks at runtime, not install. `.github/dependabot.yml` groups them.

When verifying, always query with `az ... -o json`. The `-o table` renderer prints nothing even when rows exist, which reads as "no telemetry" on a healthy component.

## Project documentation vault

This repo keeps an Obsidian vault at `HollaCo CORS Proxy/`. Conventions: [f:\com.hollaco.portfolio\obsidian-vault-conventions.md](../com.hollaco.portfolio/obsidian-vault-conventions.md).

- **Filename rule**: every note is `YYYY-MM-DD Title.md`, no exceptions.
- **Folders**: `Daily/`, `Projects/`, `Tech/`, `Design/`, `Reports/`.
- **Front door**: [[Projects/2026-05-23 HollaCo CORS Proxy]].

## Graphify

This repo is indexed into the **HollaCo platform knowledge graph** (`com.hollaco.graphify`, rebuilt daily). Before grepping across repos to answer a cross-repo question, query the graph first with `graphify query "…"`.

Graphify is **pull, not push** — this repo emits nothing and needs no workflow or secret; inclusion is a single line in the grapher's `repos.txt`. Full runbook: [graphify-onboarding-setup.md](../com.hollaco.portfolio/graphify-onboarding-setup.md).
