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

GitHub Actions deploys on push to `main`. First-time Azure setup walkthrough: [docs/setup-conventions.md](docs/setup-conventions.md).
