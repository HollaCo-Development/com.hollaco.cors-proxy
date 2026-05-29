---
title: 2026-05-29 Vitest 4 Bump
date: 2026-05-29
tags: [session-journal, cors-proxy, dependencies, security, vitest, dependabot]
type: session-journal
status: complete
---

# 2026-05-29 — Vitest 4 Bump (cleared both Dependabot alerts)

Single dev-dep bump cleared both open Dependabot alerts on this repo. Part of a same-day sweep that also cleaned up the sibling [[../../../hollaco-command-center/HollaCo Command/Daily/2026-05-29 Dependency Cleanup Sweep|HollaCo Command Center widget repo]] (9 alerts there, 2 here, all dev-only).

#project/cors-proxy #release/deps #topic/security #topic/dependencies

## What changed (commit `bbd8076`)

| Direct dep | Was | Now | What it cleared |
|---|---|---|---|
| `vitest` | 2.1.0 | 4.1.7 | 2 medium transitive: vite ≤ 6.4.1 path traversal in `.map` handling (GHSA-jqfw-vq24-v9c3), esbuild ≤ 0.24.2 dev-server SSRF (GHSA-67mh-4wv8-2f99) |

vitest 4 pulls patched vite + vite-node + esbuild as transitive deps, so a single bump cleared both vulnerabilities. No other direct deps needed touching.

**Verification:**
- `npm audit` → 0 vulnerabilities (was 5 moderate, deduped to 2 Dependabot alerts)
- `npm test` → 29/29 pass on vitest 4.1.7
- No code changes required — the test suite uses standard `vi.fn()`, no constructor-mocking patterns that vitest 4 might break

## Runtime impact

None. Dev-only dependency. The deployed Function App at `proxy.hollaco.com` is unaffected — the bundled function code, the Anthropic API wiring, the rate-limit logic, and the CORS allowlist all stay identical. Runtime version is still v0.2.1 from 2026-05-27.

## Dependabot PR cleanup

Both open PRs (#1 esbuild+vitest, #2 vite+vitest) were superseded by `bbd8076`. Unlike the widget repo where Dependabot auto-closed its PRs within 16 seconds of the supersession commit landing, the cors-proxy PRs did not auto-close within 20 seconds. Closed both manually with a comment pointing at `bbd8076`. Both repos now have 0 open PRs.

## Sibling widget repo notes

The widget repo had a richer bump (`happy-dom 14→20`, `tfx-cli 0.16→0.23.1`, `esbuild 0.21→0.28`, `vitest 1→4`) and hit one breaking-change pattern in vitest 4: arrow functions in `vi.fn()` are no longer callable with `new`. Fix in `src/lib/__tests__/msal.test.js` line 11 — switched from `vi.fn(() => stubInstance)` to `vi.fn(function () { return stubInstance; })`. Full diagnostic is in [[../../../hollaco-command-center/HollaCo Command/Daily/2026-05-29 Dependency Cleanup Sweep|the widget journal]].

The cors-proxy tests have no such pattern, so this bump was a clean no-op test-side.

## Related notes

- [[../Projects/2026-05-23 HollaCo CORS Proxy|HollaCo CORS Proxy project index]] — runtime still v0.2.1, this was a dev-dep maintenance pass
- [[../../../hollaco-command-center/HollaCo Command/Daily/2026-05-29 Dependency Cleanup Sweep|Widget Dependency Cleanup Sweep]] — sister-repo journal covering both bumps
- Commit: `bbd8076 chore(deps): bump vitest 2.1.0 -> 4.1.7 to clear both Dependabot alerts`
