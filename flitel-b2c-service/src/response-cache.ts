import { getDatabase } from "./mongodb.js";

type Entry = { expiresAt: number; value: unknown };
type StoredEntry = { _id: string; expiresAt: Date; data: unknown };

// Memory answers in microseconds; the collection survives restarts and is shared by every API instance.
// A request that finds neither loads once and fills both.
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const maxEntries = 500;
const storeTimeoutMs = 250;

const store = () => getDatabase().collection<StoredEntry>("hotel_cache");

async function readStored(key: string): Promise<{ found: boolean; value?: unknown; expiresAt?: number }> {
  try {
    const stored = await store().findOne(
      { _id: key, expiresAt: { $gt: new Date() } },
      { timeoutMS: storeTimeoutMs },
    );
    return stored && stored.expiresAt > new Date()
      ? { found: true, value: stored.data, expiresAt: stored.expiresAt.getTime() }
      : { found: false };
  } catch {
    // The database being slow or down only costs the shortcut.
    return { found: false };
  }
}

async function writeStored(key: string, value: unknown, expiresAt: Date): Promise<void> {
  try {
    await store().replaceOne(
      { _id: key },
      { expiresAt, data: value },
      { upsert: true, timeoutMS: storeTimeoutMs },
    );
  } catch {
    // Same: the cache is an optimisation, never a dependency.
  }
}

function remember(key: string, value: unknown, expiresAt: number): void {
  if (entries.size >= maxEntries) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(key, { expiresAt, value });
}

/**
 * Returns a recent answer, or runs the load once for everyone asking at the same time.
 * Only successful loads are kept, so an upstream failure is never replayed. This sits behind the rate
 * limiter, so a cache hit still counts against the visitor's allowance.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const started = (async () => {
    const stored = await readStored(key);
    if (stored.found && stored.expiresAt !== undefined) {
      // Memory never outlives the stored copy it came from.
      remember(key, stored.value, stored.expiresAt);
      return stored.value as T;
    }
    const value = await load();
    const expiresAt = Date.now() + ttlMs;
    remember(key, value, expiresAt);
    void writeStored(key, value, new Date(expiresAt));
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, started);
  return started;
}

/** Clears memory only; the collection is left to expire on its own. */
export function resetResponseCache(): void {
  entries.clear();
  inflight.clear();
}
