/**
 * Allowlist of upstream URLs the proxy is permitted to fetch.
 *
 * Adding an entry here is the only way to authorize a new upstream — the
 * proxy handler looks up the request's `upstream` query param in this map
 * and rejects anything not present.
 *
 * Keep keys lowercase + hyphen-separated. URLs must be https://.
 *
 * @type {Record<string, string>}
 */
export const UPSTREAMS = {
  // Phase 6.2 — HollaCo Command Center live consumers (v1.5.0+)
  'n8n-cloud-health': 'https://holla.app.n8n.cloud/healthz',
  'vercel-status':    'https://www.vercel-status.com/api/v2/status.json',
  'expo-status':      'https://status.expo.dev/api/v2/status.json',
  'webflow-status':   'https://status.webflow.com/api/v2/status.json',

  // Phase 6.3 retrofit — Anthropic now consumed via this proxy (widget v1.5.1).
  // OpenAI still direct-fetched from the widget (its Statuspage sets wildcard
  // CORS so the proxy adds no value, only coupling risk). Kept allowlisted in
  // case we ever want to consolidate.
  'anthropic-status': 'https://status.anthropic.com/api/v2/status.json',
  'openai-status':    'https://status.openai.com/api/v2/status.json'
};
