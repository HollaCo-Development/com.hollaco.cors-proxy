# Setup Conventions — HollaCo CORS Proxy

How to deploy, rotate, and extend this proxy.

Live endpoint: `https://proxy.hollaco.com/api/proxy`
Repo: https://github.com/HollaCo-Development/com.hollaco.cors-proxy
Current allowlist: see `src/upstreams.js`

## 1. First-time Azure setup (one-time, by Ross)

Done as part of Phase 6.2 initial bring-up on 2026-05-23. Documented for posterity in case we ever need to recreate.

Inventory of what got created (all live as of v0.1.0):

| Resource | Name | Notes |
| --- | --- | --- |
| Subscription | `cseo-prod-002-eastus2` | Existing HollaCo subscription |
| Resource group | `hollaco-cors-proxy-rg` | East US 2 |
| Function App | `hollaco-cors-proxy` | Flex Consumption, Node 22 LTS, 512 MB |
| Custom domain | `proxy.hollaco.com` | CNAME in Azure DNS, managed SSL cert |
| Entra app reg | `hollaco-cors-proxy-github-deploy` | OIDC federated credential for GitHub |

### Step 1: Create the Function App

Azure Portal → Create a resource → Function App.

- Hosting plan: **Flex Consumption** (NOT Consumption — Flex is required for this guide because publish-profile-less OIDC deploys go through a different path)
- Subscription: `cseo-prod-002-eastus2`
- Resource group: create new `hollaco-cors-proxy-rg`
- Function App name: `hollaco-cors-proxy`
- Runtime stack: **Node.js**
- Version: **22 LTS**
- Region: **East US 2**
- Instance size: **512 MB** (smallest available; the proxy is stateless and barely uses memory)
- OS: Linux (Flex Consumption is Linux-only)
- "Secure unique default hostname": **leave ON** (this is the default in newly-created Function Apps and is the recommended posture)

After creation, the Function App's default hostname will have a random suffix, e.g. `hollaco-cors-proxy-fuddawhsb9euc3e9.eastus2-01.azurewebsites.net`. **This full unique hostname is what the CNAME in Step 3 must point to**, not the bare `hollaco-cors-proxy.azurewebsites.net` (which doesn't resolve when "Secure unique default hostname" is on).

### Step 2: Bind the custom domain `proxy.hollaco.com`

Function App `hollaco-cors-proxy` → Settings → Custom domains → Add custom domain.

- Domain: `proxy.hollaco.com`
- TLS/SSL certificate: leave blank for now — added in Step 4
- Azure will display two records you need to add to DNS (a CNAME and a TXT verification record) — copy both for Step 3.

Azure validates by checking DNS. The "Add" button stays disabled until both DNS records resolve, so do Step 3 first then come back here and complete the add.

### Step 3: Add DNS records in Azure DNS

Azure DNS zone `hollaco.com` → + Record set, twice:

1. **CNAME**
   - Name: `proxy`
   - TTL: 300
   - Alias: No
   - CNAME: the full unique default hostname from Step 1 (e.g. `hollaco-cors-proxy-fuddawhsb9euc3e9.eastus2-01.azurewebsites.net`)

2. **TXT**
   - Name: `asuid.proxy`
   - TTL: 300
   - Value: the domain verification ID Azure showed in Step 2 (long alphanumeric string)

Wait ~30 seconds for propagation, then return to Custom domains in Step 2 and click Validate → Add.

### Step 4: Provision SSL cert

Function App → Custom domains → click the `Add binding` link next to `proxy.hollaco.com`.

- TLS/SSL type: **SNI SSL**
- Source: **App Service Managed Certificate** (free, auto-renewed)
- Click Create — takes 30–60 seconds to provision.

After binding, `https://proxy.hollaco.com` resolves with a valid cert.

### Step 5: Set up OIDC (Entra federated credential — NOT publish-profile)

**Why OIDC instead of publish-profile:** Flex Consumption rejects the legacy Kudu `/api/zipdeploy` endpoint that publish-profile basic auth uses (returns 404). Microsoft's documented path for Flex deploys is bearer-token auth via Entra ID. The publish-profile approach in the original deploy.yml was a v0.1.0-pre-pivot artifact.

**5a. Create Entra ID app registration:**

Azure Portal → Microsoft Entra ID → App registrations → New registration.
- Name: `hollaco-cors-proxy-github-deploy`
- Supported account types: **Accounts in this organizational directory only** (single tenant — HollaCo Holdings)
- Redirect URI: leave blank
- Register

**5b. Add federated credential:**

The new app reg → Certificates & secrets → Federated credentials → Add credential.
- Federated credential scenario: **GitHub Actions deploying Azure resources**
- Organization: `HollaCo-Development`
- Repository: `com.hollaco.cors-proxy`
- Entity type: **Branch**
- GitHub branch name: `main`
- Name: `github-main`
- Audience: leave default (`api://AzureADTokenExchange`)

The subject identifier Azure builds from this is:
`repo:HollaCo-Development/com.hollaco.cors-proxy:ref:refs/heads/main`

**5c. Grant Website Contributor on the resource group:**

Resource group `hollaco-cors-proxy-rg` → Access control (IAM) → Add → Add role assignment.
- Role: **Website Contributor** (least-privilege for Function App deploys; Contributor also works but is broader)
- Assign access to: User, group, or service principal
- Members: search for `hollaco-cors-proxy-github-deploy` and select it
- Review + assign

**5d. Note the three IDs:**

- App registration Overview → **Application (client) ID**
- App registration Overview → **Directory (tenant) ID**
- Subscriptions → `cseo-prod-002-eastus2` → **Subscription ID**

**5e. Add to GitHub repo secrets:**

https://github.com/HollaCo-Development/com.hollaco.cors-proxy/settings/secrets/actions
- `AZURE_CLIENT_ID` = client ID from 5d
- `AZURE_TENANT_ID` = tenant ID from 5d
- `AZURE_SUBSCRIPTION_ID` = subscription ID from 5d

(These three IDs aren't actually sensitive — they're discoverable from Azure logs / DNS / public artifacts — but storing as GitHub Secrets is standard convention and works the same in workflow YAML as Variables. Either the Secrets or Variables tab works; we chose Secrets.)

## 2. Deploy

Automatic on push to `main` via `.github/workflows/deploy.yml`. The workflow:

1. Installs deps (with dev deps for tests)
2. Runs typecheck + lint + tests
3. Prunes dev deps
4. Authenticates to Azure via `azure/login@v2` using the OIDC federated credential
5. Deploys via `Azure/functions-action@v1` with `sku: flexconsumption` + `remote-build: true`

To deploy manually (e.g., to re-run a stuck deploy):
- https://github.com/HollaCo-Development/com.hollaco.cors-proxy/actions → "Deploy to Azure" → Run workflow

## 3. Add a new upstream

The proxy refuses to fetch anything not in `src/upstreams.js`. Adding a new upstream is a 3-step PR:

1. Add an entry to `src/upstreams.js`:
   ```js
   'new-key': 'https://example.com/api/health',
   ```
   Naming convention: lowercase, hyphen-separated, descriptive (e.g. `webflow-sites`, `posthog-status`).

2. (Optional) Add explicit coverage to `src/__tests__/upstreams.test.js`. The generic "every value is https://" test already covers shape.

3. Open a PR. CI runs typecheck + lint + test on the PR. Merge to `main` triggers the deploy workflow.

## 4. Verify a live deployment

```powershell
curl -sS -i "https://proxy.hollaco.com/api/proxy?upstream=n8n-cloud-health"
```

Expected: HTTP 200 with `{"status":"ok"}` body and `access-control-allow-origin: *` header.

Other verification commands:
- `curl "https://proxy.hollaco.com/api/proxy?upstream=evil-relay"` → HTTP 400 with `{"error":"unknown upstream","allowed":[...]}`
- `curl "https://proxy.hollaco.com/api/proxy"` → HTTP 400 with `{"error":"upstream query param required"}`
- `curl "https://proxy.hollaco.com/api/proxy?upstream=vercel-status"` → HTTP 200 with Vercel Statuspage v2 JSON
- `curl "https://proxy.hollaco.com/api/proxy?upstream=expo-status"` → HTTP 200 with Expo Statuspage v2 JSON

**Known: OPTIONS preflight currently returns 500** (likely Function App Platform CORS layer intercepting). Doesn't affect production usage because the widget's GET requests don't trigger preflight (no custom headers — they're CORS "simple requests"). Tracked for a v0.1.x follow-up.

## 5. Rotate OIDC credentials

The federated credential doesn't have a secret to rotate — that's the point of OIDC. If you ever need to invalidate it:

1. Azure Portal → Microsoft Entra ID → App registrations → `hollaco-cors-proxy-github-deploy` → Certificates & secrets → Federated credentials → delete the entry
2. Re-create following step 5b above
3. The three IDs (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) don't change — no GitHub Secrets to update

To rotate the role assignment scope (e.g. narrow from RG-level to App-level):
- Resource group `hollaco-cors-proxy-rg` → Access control (IAM) → find `hollaco-cors-proxy-github-deploy` → remove
- Function App `hollaco-cors-proxy` → Access control (IAM) → add the role at the resource level instead

## 6. Cost monitoring

Flex Consumption: pay only for executions. At ~6k req/day (HollaCo Command Center widget × 3 users × 11 fetchers × ~30 refreshes/day, of which only ~3 hit the proxy) we're well under the 1M req/month free allowance. If costs become non-trivial: Application Insights → Metrics → Function execution count.

## Known issues / follow-ups (v0.1.0)

- **OPTIONS preflight returns 500.** Doesn't affect production usage (widget uses simple GET requests, no preflight triggered). Likely Function App Platform CORS layer intercepting OPTIONS before our handler runs. Either configure Platform CORS to allow `*` (and remove our custom CORS handling) OR find a setting to disable Platform CORS entirely. Tracked for v0.1.1.
- **SCM basic auth is currently ON** (was re-enabled during the publish-profile attempt before pivoting to OIDC). Now that OIDC works, can be turned back OFF: Function App → Settings → Configuration → General settings → "SCM Basic Auth Publishing Credentials" → Off. Tracked for v0.1.1.
- **Leftover org-level secret** `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` on `HollaCo-Development` org (visibility: Selected → com.hollaco.cors-proxy). No longer used by deploy.yml. Can be deleted: Organization Settings → Secrets and variables → Actions → AZURE_FUNCTIONAPP_PUBLISH_PROFILE → delete.
- **Phase 6.x retrofit** — the widget's existing `statuspage.js` direct-fetches Anthropic and OpenAI. Anthropic is CORS-blocked (grey on dashboard); OpenAI works. The retrofit slice switches both to use this proxy (allowlist entries `anthropic-status` and `openai-status` are already in place).
- **Phase 6.3** — add `webflow-sites` upstream + widget consumer for Webflow CMS health.
