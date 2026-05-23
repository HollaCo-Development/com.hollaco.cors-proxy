import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../functions/proxy.js';

// Helpers to build a minimal Azure Functions v4 HttpRequest-like object.
function makeReq({ method = 'GET', upstreamKey = 'n8n-cloud-health' } = {}) {
  const url = new URL('https://proxy.hollaco.com/api/proxy' + (upstreamKey != null ? '?upstream=' + upstreamKey : ''));
  return {
    method,
    url: url.toString(),
    query: new URLSearchParams(url.search)
  };
}

const ctx = { log: () => {}, error: () => {} };

describe('proxy handler — OPTIONS preflight', () => {
  it('responds 204 with CORS headers and Allow: GET, OPTIONS', async () => {
    const res = await handler(makeReq({ method: 'OPTIONS' }), ctx);
    expect(res.status).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Allow']).toContain('GET');
    expect(res.headers['Allow']).toContain('OPTIONS');
    expect(res.headers['Access-Control-Max-Age']).toBeDefined();
  });
});

describe('proxy handler — input validation', () => {
  it('returns 400 when upstream query param is missing', async () => {
    const res = await handler(makeReq({ upstreamKey: null }), ctx);
    expect(res.status).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.error).toContain('upstream');
  });

  it('returns 400 with allowed-keys list when upstream is unknown', async () => {
    const res = await handler(makeReq({ upstreamKey: 'not-a-real-key' }), ctx);
    expect(res.status).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.error).toContain('unknown upstream');
    expect(Array.isArray(body.allowed)).toBe(true);
    expect(body.allowed).toContain('n8n-cloud-health');
  });
});

describe('proxy handler — upstream success', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('proxies a 200 response with body and content-type preserved', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve('{"status":"ok"}')
    });
    const res = await handler(makeReq(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.body).toBe('{"status":"ok"}');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://holla.app.n8n.cloud/healthz',
      expect.objectContaining({ method: 'GET' })
    );
  });
});

describe('proxy handler — upstream non-2xx passthrough', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('passes through a 503 with body and CORS headers', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      status: 503,
      ok: false,
      headers: new Map([['content-type', 'text/plain']]),
      text: () => Promise.resolve('upstream down')
    });
    const res = await handler(makeReq(), ctx);
    expect(res.status).toBe(503);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.body).toBe('upstream down');
  });
});

describe('proxy handler — upstream timeout / network error', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('returns 504 with JSON error and CORS headers when fetch rejects', async () => {
    /** @type {*} */ (global.fetch).mockRejectedValue(new Error('network down'));
    const res = await handler(makeReq(), ctx);
    expect(res.status).toBe(504);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(res.body);
    expect(body.error).toContain('upstream');
  });

  it('returns 504 when fetch is aborted by timeout', async () => {
    /** @type {*} */ (global.fetch).mockImplementation(function(_url, init) {
      return new Promise(function(_resolve, reject) {
        init.signal.addEventListener('abort', function() {
          reject(new Error('aborted'));
        });
      });
    });
    vi.useFakeTimers();
    const promise = handler(makeReq(), ctx);
    vi.advanceTimersByTime(6000);
    const res = await promise;
    vi.useRealTimers();
    expect(res.status).toBe(504);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('proxy handler — every response includes CORS header', () => {
  it('200, 400, 504 paths all include Access-Control-Allow-Origin: *', async () => {
    // 400 (missing param) — synchronous, no fetch
    const r1 = await handler(makeReq({ upstreamKey: null }), ctx);
    expect(r1.headers['Access-Control-Allow-Origin']).toBe('*');

    // 400 (unknown key) — synchronous, no fetch
    const r2 = await handler(makeReq({ upstreamKey: 'nope' }), ctx);
    expect(r2.headers['Access-Control-Allow-Origin']).toBe('*');

    // 200 (upstream success)
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve('{}')
    });
    const r3 = await handler(makeReq(), ctx);
    expect(r3.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
