import { z } from "zod";
import { createOfferRequest, offerSchema } from "./flights.js";
import type { FlightOffer, FlightSearch, OfferRequest } from "./flights.js";
import { raiseApiError, requestDuffel } from "./duffel.js";

const batchSchema = z.object({
  id: z.string().regex(/^orq_[A-Za-z0-9_]{1,128}$/),
  live_mode: z.literal(false),
  remaining_batches: z.number().int().min(0),
  offers: z.array(offerSchema).optional(),
});

export async function fetchFlightBatches(
  search: FlightSearch,
  options: {
    token: string;
    signal: AbortSignal;
    onOffers: (offers: FlightOffer[]) => Promise<void>;
  },
): Promise<OfferRequest> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(23_000)]);
  const requestOptions = { token: options.token, signal };
  const started = batchSchema.parse(
    await requestDuffel(
      "/air/batch_offer_requests?supplier_timeout=10000",
      createOfferRequest(search),
      requestOptions,
    ),
  );
  const offersById = new Map<string, FlightOffer>();
  let remaining = started.remaining_batches;
  for (let attempt = 0; remaining > 0 && attempt < 100; attempt++) {
    signal.throwIfAborted();
    const batch = batchSchema.parse(
      await requestDuffel(
        `/air/batch_offer_requests/${encodeURIComponent(started.id)}?view=offers`,
        undefined,
        requestOptions,
      ),
    );
    if (batch.id !== started.id || !batch.offers)
      throw new Error("Invalid flight batch.");
    const offers: FlightOffer[] = [];
    for (const offer of batch.offers) {
      if (offersById.has(offer.id)) continue;
      offersById.set(offer.id, offer);
      offers.push(offer);
    }
    if (offers.length) await options.onOffers(offers);
    remaining = batch.remaining_batches;
  }
  signal.throwIfAborted();
  if (remaining > 0)
    raiseApiError(
      504,
      "DUFFEL_TIMEOUT",
      "Flight search took too long. Please try again.",
    );
  const offers = [...offersById.values()];
  return {
    id: started.id,
    live_mode: false,
    offers,
    passengers: offers[0]?.passengers ?? [],
  };
}
