# AGENTS.md — HollaCo CORS Proxy

Project conventions for agentic workers (Claude Code, Copilot, etc.).

## What this repo is

An Azure Function App that re-serves an allowlist of public URLs with `Access-Control-Allow-Origin: *`. Single-purpose, single function. ~100 lines of code total.

## Stack

- Azure Functions v4 (Node.js 20 LTS, ES modules — `"type": "module"`)
- Vitest + node environment for tests
- ESLint flat config (`eslint.config.mjs`)
- jsconfig + checkJs for type validation
- GitHub Actions for CI + deploy (publish-profile auth)

## Conventions

- Single-quoted strings.
- No comments unless WHY is non-obvious.
- TDD where it adds value (the handler is pure — easy to test). Skip TDD for config/scaffolding files.
- Frequent commits, conventional commit messages.
- Never add a new upstream without an allowlist entry in `src/upstreams.js`.
- Never accept arbitrary URLs as the `upstream` query param — always look up an allowlisted key.

## Project documentation vault

This repo keeps an Obsidian vault at `HollaCo CORS Proxy/`. Conventions: [f:\com.hollaco.portfolio\obsidian-vault-conventions.md](../com.hollaco.portfolio/obsidian-vault-conventions.md).

- **Filename rule**: every note is `YYYY-MM-DD Title.md`, no exceptions.
- **Folders**: `Daily/`, `Projects/`, `Tech/`, `Design/`, `Reports/`.
- **Front door**: [[Projects/2026-05-23 HollaCo CORS Proxy]].
