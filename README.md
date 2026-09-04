# HollaCo CORS Proxy

Azure Function that re-serves an allowlist of CORS-blocked public URLs with `Access-Control-Allow-Origin: *`. Used by HollaCo Command Center widget to probe upstreams (n8n Cloud `/healthz`, Anthropic + OpenAI Statuspage) that don't allow our `hollaco.gallerycdn.vsassets.io` iframe origin.

**Live at:** `https://proxy.hollaco.com/api/proxy?upstream=<key>`

## Usage

```
GET https://proxy.hollaco.com/api/proxy?upstream=n8n-cloud-health
→ 200 {"status":"ok"} + Access-Control-Allow-Origin: *
```

Allowed `upstream` keys live in [src/upstreams.js](src/upstreams.js). Unknown keys return 400.

## Adding a new upstream

1. Add an entry to `src/upstreams.js`:
   ```js
   'new-key': 'https://example.com/api/health',
   ```
2. Add a test in `src/__tests__/upstreams.test.js` if you want explicit coverage.
3. Open a PR. CI runs `typecheck` + `lint` + `test`. Merge to `main` triggers the deploy workflow.

## Local dev

```powershell
npm install
cp local.settings.json.example local.settings.json
func start
# proxy at http://localhost:7071/api/proxy?upstream=n8n-cloud-health
```

Requires Azure Functions Core Tools v4: `npm install -g azure-functions-core-tools@4 --unsafe-perm true`.

## Deploy

GitHub Actions deploys on push to `main`, authenticating to Azure with an Entra federated credential (OIDC — no publish profile, no stored secret). First-time Azure setup (Function App creation, custom domain binding, OIDC setup) is documented in [docs/setup-conventions.md](docs/setup-conventions.md).

## Monitoring

Telemetry goes to Application Insights (`hollaco-cors-proxy`) via OpenTelemetry — requests, outbound dependencies, and worker logs. Setup and verification queries: [docs/setup-conventions.md](docs/setup-conventions.md) §7.

If you change `package.json#main`, `host.json`, or `src/index.js`, re-run the verification in §7. All three fail silently — the proxy keeps serving traffic and simply stops reporting.
