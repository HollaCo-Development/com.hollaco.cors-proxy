import { app } from '@azure/functions';
import { UPSTREAMS } from '../upstreams.js';

const UPSTREAM_TIMEOUT_MS = 5000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

/**
 * HTTP-triggered handler. Exported separately from `app.http()` registration
 * so it can be unit-tested without spinning up the Azure runtime.
 *
 * @param {*} req
 * @param {*} ctx
 * @returns {Promise<{status: number, headers: Record<string, string>, body: string}>}
 */
export async function handler(req, ctx) {
  // OPTIONS preflight — short-circuit with CORS headers.
  if (req.method === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'Allow': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  const upstreamKey = req.query.get ? req.query.get('upstream') : req.query['upstream'];

  if (!upstreamKey) {
    return jsonError(400, 'upstream query param required');
  }

  const upstreamUrl = UPSTREAMS[upstreamKey];
  if (!upstreamUrl) {
    return {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'unknown upstream',
        allowed: Object.keys(UPSTREAMS)
      })
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      signal: controller.signal
    });
    const body = await upstreamRes.text();
    const contentType = (upstreamRes.headers.get
      ? upstreamRes.headers.get('content-type')
      : (upstreamRes.headers.get('content-type') || upstreamRes.headers['content-type']))
      || 'application/octet-stream';
    return {
      status: upstreamRes.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType
      },
      body
    };
  } catch (err) {
    if (ctx && ctx.log) ctx.log('Upstream error for ' + upstreamKey + ': ' + ((err && err.message) || err));
    return jsonError(504, 'upstream timeout or network error');
  } finally {
    clearTimeout(timer);
  }
}

function jsonError(status, message) {
  return {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ error: message })
  };
}

// Azure Functions v4 programming model registration. Adapts the host's
// HttpRequest/HttpResponseInit shape to our pure handler.
app.http('proxy', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'proxy',
  handler: async function(req, ctx) {
    const result = await handler({
      method: req.method,
      url: req.url,
      query: req.query
    }, ctx);
    return {
      status: result.status,
      headers: result.headers,
      body: result.body
    };
  }
});
