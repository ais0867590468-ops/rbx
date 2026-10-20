/**
 * Per-instance sliding-window limiter with no database round trip. Used by hot,
 * low-risk endpoints (chat polling, Discord interactions) where a DB write per call
 * would cost more than the abuse it prevents. Each serverless instance counts on its own.
 */
const hits = new Map<string, number[]>();

export function localLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}
