import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, _resetForTests } from '../rateLimit.js';

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('allows a first request from a new IP', () => {
    const out = checkRateLimit('1.2.3.4', 1000);
    expect(out.ok).toBe(true);
  });

  it('allows 60 requests in a minute from one IP, then blocks the 61st', () => {
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit('1.2.3.4', 1000 + i).ok).toBe(true);
    }
    const out = checkRateLimit('1.2.3.4', 1060);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('per-ip');
    expect(out.retryAfterSec).toBeGreaterThan(0);
  });

  it('expires per-IP entries after the 60-second sliding window', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('1.2.3.4', 1000 + i);
    }
    // 60s after the first request, it should be evicted from the window
    const out = checkRateLimit('1.2.3.4', 61000);
    expect(out.ok).toBe(true);
  });

  it('counts global requests across IPs and blocks the 1001st in a day', () => {
    // Use 1001 distinct IPs to avoid per-IP cap interference
    for (let i = 0; i < 1000; i++) {
      const ip = '10.0.' + Math.floor(i / 256) + '.' + (i % 256);
      expect(checkRateLimit(ip, 1000 + i).ok).toBe(true);
    }
    const out = checkRateLimit('10.99.99.99', 2000);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('global');
  });

  it('tracks distinct IPs independently for per-IP limits', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('1.1.1.1', 1000 + i);
    }
    // Different IP should still get through
    expect(checkRateLimit('2.2.2.2', 1060).ok).toBe(true);
  });

  it('handles missing/empty IP gracefully (uses "unknown" bucket)', () => {
    const out = checkRateLimit('', 1000);
    expect(out.ok).toBe(true);
    // Second request from "unknown" bucket should also work
    expect(checkRateLimit(null, 1001).ok).toBe(true);
  });
});
