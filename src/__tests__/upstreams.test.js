import { describe, it, expect } from 'vitest';
import { UPSTREAMS } from '../upstreams.js';

describe('UPSTREAMS allowlist', () => {
  it('exports an object with the v0.1.0 keys', () => {
    expect(typeof UPSTREAMS).toBe('object');
    expect(UPSTREAMS['n8n-cloud-health']).toBe('https://holla.app.n8n.cloud/healthz');
    expect(UPSTREAMS['vercel-status']).toBe('https://www.vercel-status.com/api/v2/status.json');
    expect(UPSTREAMS['expo-status']).toBe('https://status.expo.dev/api/v2/status.json');
    expect(UPSTREAMS['anthropic-status']).toBe('https://status.anthropic.com/api/v2/status.json');
    expect(UPSTREAMS['openai-status']).toBe('https://status.openai.com/api/v2/status.json');
  });

  it('every value is a well-formed https:// URL', () => {
    for (const [key, url] of Object.entries(UPSTREAMS)) {
      expect(url, key + ' should be a string').toBeTypeOf('string');
      expect(url.startsWith('https://'), key + ' should be https://').toBe(true);
      // Should parse as a URL without throwing
      expect(() => new URL(url)).not.toThrow();
    }
  });
});
