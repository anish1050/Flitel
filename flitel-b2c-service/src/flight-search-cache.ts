import { createHash } from "node:crypto";
import { BSON } from "mongodb";
import type { Collection } from "mongodb";
import { getDatabase } from "./mongodb.js";
import { offerRequestSchema } from "./flights.js";
import type { FlightSearch, OfferRequest } from "./flights.js";

type CachedSearch = { _id: string; expiresAt: Date; data: OfferRequest };
type CacheLookup = {
  key: string;
  collection?: Collection<CachedSearch>;
  data?: OfferRequest;
};
type SearchResult = { data: OfferRequest; cache: "MISS" | "BYPASS" };
const inFlight = new Map<string, Promise<SearchResult>>();

function cacheExpiry(data: OfferRequest): number {
  if (!data.offers.length) return 0;
  return data.offers.reduce(
    (expiry, offer) => Math.min(expiry, Date.parse(offer.expires_at) - 30_000),
    Date.now() + 120_000,
  );
}

export async function readFlightSearchCache(
  search: FlightSearch,
  token: string,
): Promise<CacheLookup> {
  const identity = {
    version: 1,
    mode: "test",
    credential: createHash("sha256").update(token).digest("hex"),
    from: search.from,
    to: search.to,
    depart: search.depart,
    returnDate: search.trip === "round-trip" ? search.returnDate : undefined,
    trip: search.trip,
    cabin: search.cabin,
    travellers: search.travellers,
  };
  const key = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  try {
    const collection =
      getDatabase().collection<CachedSearch>("flight_searches");
    const cached = await collection.findOne(
      { _id: key, expiresAt: { $gt: new Date() } },
      { timeoutMS: 250 },
    );
    const parsed = offerRequestSchema.safeParse(cached?.data);
    const data =
      cached &&
      cached.expiresAt > new Date() &&
      parsed.success &&
      cacheExpiry(parsed.data) > Date.now()
        ? parsed.data
        : undefined;
    return { key, collection, data };
  } catch {
    return { key };
  }
}

export async function fetchAndCacheFlightSearch(
  cache: CacheLookup,
  fetchOffers: () => Promise<OfferRequest>,
): Promise<SearchResult> {
  const data = await fetchOffers();
  const expiresAt = new Date(cacheExpiry(data));
  if (!cache.collection || expiresAt.getTime() <= Date.now())
    return { data, cache: "BYPASS" };
  try {
    const document = { _id: cache.key, expiresAt, data };
    if (BSON.calculateObjectSize(document) > 15 * 1024 * 1024)
      return { data, cache: "BYPASS" };
    await cache.collection.replaceOne({ _id: cache.key }, document, {
      upsert: true,
      timeoutMS: 250,
    });
    return { data, cache: "MISS" };
  } catch {
    return { data, cache: "BYPASS" };
  }
}

export function loadFlightSearch(
  cache: CacheLookup,
  fetchOffers: () => Promise<OfferRequest>,
): Promise<SearchResult> {
  const pending = inFlight.get(cache.key);
  if (pending) return pending;
  // ponytail: deduplication is per process; use a shared lock if cross-instance bursts become costly.
  const request = fetchAndCacheFlightSearch(cache, fetchOffers).finally(() =>
    inFlight.delete(cache.key),
  );
  inFlight.set(cache.key, request);
  return request;
}
