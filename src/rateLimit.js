/**
 * In-memory rate limiter for the AI proxy.
 *
 * Two layers:
 *   - per-IP: 60 requests / sliding 60-second window
 *   - global: 1000 requests / rolling 24-hour window
 *
 * Trade-off accepted (spec): state resets on Function App cold start.
 * Persistent storage (Redis, Cosmos) would be overkill at HollaCo trio scale.
 *
 * @typedef {{ok: true} | {ok: false, reason: 'per-ip'|'global', retryAfterSec: number}} RateLimitResult
 */

const PER_IP_LIMIT = 60;
const PER_IP_WINDOW_MS = 60 * 1000;
const GLOBAL_LIMIT = 1000;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, number[]>} */
const perIpTimestamps = new Map();
/** @type {number[]} */
let globalTimestamps = [];

/**
 * Check whether a request from the given IP is allowed at the given time.
 * Mutates state on the ALLOW path (records the timestamp); does not mutate on DENY.
 * @param {string|null|undefined} ipAddress
 * @param {number} now milliseconds since epoch
 * @returns {RateLimitResult}
 */
export function checkRateLimit(ipAddress, now) {
  const ip = ipAddress || 'unknown';

  // Trim global window
  const globalCutoff = now - GLOBAL_WINDOW_MS;
  globalTimestamps = globalTimestamps.filter(function(t) { return t > globalCutoff; });

  if (globalTimestamps.length >= GLOBAL_LIMIT) {
    return {
      ok: false,
      reason: 'global',
      retryAfterSec: Math.ceil((globalTimestamps[0] + GLOBAL_WINDOW_MS - now) / 1000)
    };
  }

  // Trim per-IP window
  const perIpCutoff = now - PER_IP_WINDOW_MS;
  const ipTimes = (perIpTimestamps.get(ip) || []).filter(function(t) { return t > perIpCutoff; });

  if (ipTimes.length >= PER_IP_LIMIT) {
    return {
      ok: false,
      reason: 'per-ip',
      retryAfterSec: Math.ceil((ipTimes[0] + PER_IP_WINDOW_MS - now) / 1000)
    };
  }

  // Record the allowed request
  ipTimes.push(now);
  perIpTimestamps.set(ip, ipTimes);
  globalTimestamps.push(now);

  return { ok: true };
}

/**
 * Test-only: reset internal state. Not exported for production callers (the
 * leading underscore is a soft convention). Tests import this; the handler
 * never calls it.
 */
export function _resetForTests() {
  perIpTimestamps.clear();
  globalTimestamps = [];
}
