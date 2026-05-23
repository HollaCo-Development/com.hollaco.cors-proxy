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
  // Phase 6.2 — HollaCo Command Center live consumers (v1.5.0)
  'n8n-cloud-health': 'https://holla.app.n8n.cloud/healthz',
  'vercel-status':    'https://www.vercel-status.com/api/v2/status.json',
  'expo-status':      'https://status.expo.dev/api/v2/status.json',

  // Reserved for HollaCo Command Center Phase 6.x retrofit — widget's
  // statuspage.js currently fetches these directly (Anthropic CORS-blocks,
  // OpenAI works). When the retrofit ships, statuspage.js switches to call
  // the proxy with these keys instead of the upstream URLs directly.
  'anthropic-status': 'https://status.anthropic.com/api/v2/status.json',
  'openai-status':    'https://status.openai.com/api/v2/status.json'
};
