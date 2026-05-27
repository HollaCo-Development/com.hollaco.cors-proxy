import { app } from '@azure/functions';
import { checkRateLimit } from '../rateLimit.js';

const UPSTREAM_TIMEOUT_MS = 20000;
const MAX_PROMPT_CHARS = 4000;
const MAX_WIDGET_STATE_CHARS = 64000;
const MAX_OUTPUT_TOKENS = 1500;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

const SYSTEM_PROMPT_PREAMBLE = 'You are an AI assistant inside the HollaCo Command Center dashboard. ' +
  'The user is an executive (Ross/Annie/Scott) asking quick operational questions about HollaCo\'s ' +
  'projects, status, and risks across HollaCo\'s stack (Azure DevOps, GitHub, Microsoft Graph, ' +
  'Supabase, n8n, Vercel, Expo, Webflow, Anthropic + OpenAI Statuspage).\n\n' +
  'Below is the current widget state. Answer the user\'s question concisely (1-3 short paragraphs) ' +
  'based on this state. If the state doesn\'t have what\'s needed, say so plainly. Don\'t speculate ' +
  'beyond what the data shows.\n\n';

/**
 * @param {*} req
 * @param {*} ctx
 * @returns {Promise<{status: number, headers: Record<string, string>, body: string}>}
 */
export async function handler(req, ctx) {
  // OPTIONS preflight — short-circuit
  if (req.method === 'OPTIONS') {
    return {
      status: 204,
      headers: { ...CORS_HEADERS, 'Allow': 'POST, OPTIONS' },
      body: ''
    };
  }

  // Env var check (operator misconfig)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  if (!apiKey) {
    return jsonError(500, 'AI not configured (server-side)');
  }

  // Parse body
  /** @type {*} */
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  const prompt = body && body.prompt;
  const widgetState = body && body.widgetState;

  // Input validation
  if (typeof prompt !== 'string' || typeof widgetState !== 'string') {
    return jsonError(400, 'prompt and widgetState required');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return jsonError(400, 'prompt too long (max ' + MAX_PROMPT_CHARS + ' chars)');
  }
  if (widgetState.length > MAX_WIDGET_STATE_CHARS) {
    return jsonError(400, 'widgetState too long (max ' + MAX_WIDGET_STATE_CHARS + ' chars)');
  }

  // Rate limit
  const ip = (req.headers.get ? req.headers.get('x-forwarded-for') : req.headers['x-forwarded-for']) || '';
  const ipFirst = ip.split(',')[0].trim();
  const rate = checkRateLimit(ipFirst, Date.now());
  if (rate.ok === false) {
    return {
      status: 429,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Retry-After': String(rate.retryAfterSec)
      },
      body: JSON.stringify({
        error: rate.reason === 'global' ? 'daily rate limit reached' : 'rate limited',
        retry_after_sec: rate.retryAfterSec
      })
    };
  }

  // Call Anthropic
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, UPSTREAM_TIMEOUT_MS);
  let upstreamRes;
  try {
    upstreamRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT_PREAMBLE + widgetState,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (ctx && ctx.log) ctx.log('Anthropic fetch failed: ' + ((err && err.message) || err));
    clearTimeout(timer);
    return jsonError(504, 'AI upstream timeout');
  }
  clearTimeout(timer);

  if (!upstreamRes.ok) {
    if (upstreamRes.status >= 500) {
      return jsonError(504, 'AI upstream timeout');
    }
    return {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'upstream AI error',
        upstream_status: upstreamRes.status
      })
    };
  }

  /** @type {*} */
  let upstreamBody;
  try {
    upstreamBody = await upstreamRes.json();
  } catch {
    return jsonError(502, 'upstream AI error (invalid response)');
  }

  // Extract text from Anthropic's content blocks
  const contentBlocks = upstreamBody.content || [];
  const text = contentBlocks
    .filter(function(b) { return b.type === 'text'; })
    .map(function(b) { return b.text; })
    .join('\n');

  return {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      model: model,
      usage: upstreamBody.usage || {}
    })
  };
}

function jsonError(status, message) {
  return {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

// Azure Functions v4 registration
app.http('claude', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'claude',
  handler: async function(req, ctx) {
    const adapted = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      json: () => req.json()
    };
    const result = await handler(adapted, ctx);
    return {
      status: result.status,
      headers: result.headers,
      body: result.body
    };
  }
});
