type Entry = { expiresAt: number; value: unknown };

// ponytail: per-process memory, so each instance warms its own copy. Move to Mongo or Redis if the API scales out.
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const maxEntries = 500;

/**
 * Returns a fresh copy of a recent answer, or runs the load once for everyone asking at the same time.
 * Only successful loads are kept, so an upstream failure is never replayed. This sits behind the rate
 * limiter, so a cache hit still counts against the visitor's allowance.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const started = load()
    .then((value) => {
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, started);
  return started;
}

export function resetResponseCache(): void {
  entries.clear();
  inflight.clear();
}
