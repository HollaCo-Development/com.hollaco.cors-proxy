import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../functions/claude.js';
import { _resetForTests as resetRateLimit } from '../rateLimit.js';

function makeReq({ method = 'POST', body = null, headers = {} } = {}) {
  return {
    method,
    url: 'https://proxy.hollaco.com/api/claude',
    headers: new Map(Object.entries(headers)),
    json: () => Promise.resolve(body)
  };
}

const ctx = { log: () => {}, error: () => {} };

const VALID_BODY = {
  prompt: 'What is the status of POE beta?',
  widgetState: '# Current Widget State\n## Work Items\n- #42 Build recs'
};

beforeEach(() => {
  resetRateLimit();
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
  global.fetch = vi.fn();
});

describe('claude handler — OPTIONS preflight', () => {
  it('responds 204 with CORS headers and Allow: POST, OPTIONS', async () => {
    const res = await handler(makeReq({ method: 'OPTIONS' }), ctx);
    expect(res.status).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Allow']).toContain('POST');
    expect(res.headers['Allow']).toContain('OPTIONS');
  });
});

describe('claude handler — input validation', () => {
  it('returns 400 when prompt is missing', async () => {
    const res = await handler(makeReq({ body: { widgetState: 'x' } }), ctx);
    expect(res.status).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(res.body).error).toContain('required');
  });

  it('returns 400 when widgetState is missing', async () => {
    const res = await handler(makeReq({ body: { prompt: 'hi' } }), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('required');
  });

  it('returns 400 when prompt exceeds 4000 chars', async () => {
    const res = await handler(makeReq({ body: { prompt: 'a'.repeat(4001), widgetState: 'x' } }), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('prompt too long');
  });

  it('returns 400 when widgetState exceeds 64000 chars', async () => {
    const res = await handler(makeReq({ body: { prompt: 'hi', widgetState: 'a'.repeat(64001) } }), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('widgetState too long');
  });

  it('accepts widgetState at exactly 64000 chars', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 }
      })
    });
    const res = await handler(makeReq({ body: { prompt: 'hi', widgetState: 'a'.repeat(64000) } }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('claude handler — rate limiting', () => {
  it('returns 429 when per-IP limit (60/min) is exceeded', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 }
      })
    });
    // 60 allowed requests
    for (let i = 0; i < 60; i++) {
      await handler(makeReq({ body: VALID_BODY, headers: { 'x-forwarded-for': '1.2.3.4' } }), ctx);
    }
    // 61st should hit per-IP cap
    const res = await handler(makeReq({ body: VALID_BODY, headers: { 'x-forwarded-for': '1.2.3.4' } }), ctx);
    expect(res.status).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(JSON.parse(res.body).error).toContain('rate limited');
    expect(JSON.parse(res.body).retry_after_sec).toBeGreaterThan(0);
  });
});

describe('claude handler — env var validation', () => {
  it('returns 500 when ANTHROPIC_API_KEY env var is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toContain('AI not configured');
  });
});

describe('claude handler — upstream success', () => {
  it('returns 200 with text + model + usage on successful Anthropic response', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'POE beta is on track. 41% complete with 18 open items.' }],
        usage: { input_tokens: 5234, output_tokens: 412 }
      })
    });
    const res = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(res.status).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(res.body);
    expect(body.text).toContain('POE beta');
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.usage.input_tokens).toBe(5234);
    expect(body.usage.output_tokens).toBe(412);
    // Verify the upstream call shape
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01'
        })
      })
    );
  });
});

describe('claude handler — upstream errors', () => {
  it('returns 502 with upstream_status when Anthropic returns 4xx', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: { message: 'invalid api key' } })
    });
    const res = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(res.status).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('upstream AI error');
    expect(body.upstream_status).toBe(401);
  });

  it('returns 504 when Anthropic returns 5xx', async () => {
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({})
    });
    const res = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(res.status).toBe(504);
    expect(JSON.parse(res.body).error).toContain('upstream timeout');
  });

  it('returns 504 when fetch rejects (network error)', async () => {
    /** @type {*} */ (global.fetch).mockRejectedValue(new Error('network down'));
    const res = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(res.status).toBe(504);
    expect(JSON.parse(res.body).error).toContain('upstream timeout');
  });
});

describe('claude handler — CORS on every response', () => {
  it('400 / 200 / 502 paths all include Access-Control-Allow-Origin: *', async () => {
    // 400 (missing field) — no fetch
    const r1 = await handler(makeReq({ body: { prompt: 'x' } }), ctx);
    expect(r1.headers['Access-Control-Allow-Origin']).toBe('*');

    // 200 (success)
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 }
      })
    });
    const r2 = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(r2.headers['Access-Control-Allow-Origin']).toBe('*');

    // 502 (upstream 4xx)
    /** @type {*} */ (global.fetch).mockResolvedValue({
      ok: false, status: 401, json: () => Promise.resolve({})
    });
    const r3 = await handler(makeReq({ body: VALID_BODY }), ctx);
    expect(r3.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
