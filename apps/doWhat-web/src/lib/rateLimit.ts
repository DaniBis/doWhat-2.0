// Simple in-memory token bucket rate limiter (per process) for low scale.
// Not suitable for multi-instance deployments without shared store.

type Key = string;

interface Bucket {
  tokens: number;
  updated: number; // ms timestamp
}

const buckets = new Map<Key, Bucket>();

export function rateLimit(key: string, opts: { capacity: number; intervalMs: number }): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: opts.capacity, updated: now };
    buckets.set(key, b);
  }
  const elapsed = now - b.updated;
  if (elapsed > 0) {
    const refill = (elapsed / opts.intervalMs) * opts.capacity;
    b.tokens = Math.min(opts.capacity, b.tokens + refill);
    b.updated = now;
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export function remaining(key: string): number {
  const b = buckets.get(key);
  return b ? Math.floor(b.tokens) : 0;
}
