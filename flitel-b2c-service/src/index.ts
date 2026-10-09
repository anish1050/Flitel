import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { getDatabase } from "./mongodb.js";
import {
  createOfferRequest,
  searchSchema,
  offerId,
  offerSchema,
  offerRequestSchema,
} from "./flights.js";
import type { FlightOffer } from "./flights.js";
import {
  bookingRequestSchema,
  buildDuffelOrder,
  duffelOrderSchema,
  findTravellerMismatch,
  orderId,
} from "./orders.js";
import {
  claimBookingAttempt,
  findBookingAttempt,
  recordBookingOutcome,
} from "./booking-attempts.js";
import type { BookingAttempt } from "./booking-attempts.js";
import {
  placeDuffelOrder,
  raiseApiError,
  readDuffelTestToken,
  requireDuffelTestToken,
  requestDuffel,
} from "./duffel.js";
import {
  fetchAndCacheFlightSearch,
  readFlightSearchCache,
  loadFlightSearch,
} from "./flight-search-cache.js";
import { fetchFlightBatches } from "./flight-batches.js";

const app = new Hono();

app.use("/api/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  await next();
});
app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      origin === (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:3000")
        ? origin
        : undefined,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);
app.use(
  "/api/flights/*",
  bodyLimit({
    maxSize: 4096,
    onError: () =>
      raiseApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
  }),
);
app.use(
  "/api/bookings",
  bodyLimit({
    maxSize: 32 * 1024,
    onError: () =>
      raiseApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
  }),
);

async function fetchCurrentOffer(id: string, token?: string): Promise<FlightOffer> {
  const response = await requestDuffel(
    `/air/offers/${encodeURIComponent(id)}`,
    undefined,
    { token },
  );
  const result = offerSchema.safeParse(response);
  if (!result.success || result.data.id !== id) {
    raiseApiError(
      502,
      "DUFFEL_INVALID_RESPONSE",
      "The flight supplier returned an invalid response. Please try again.",
    );
  }
  if (Date.parse(result.data.expires_at) <= Date.now()) {
    raiseApiError(410, "OFFER_UNAVAILABLE", "This offer has expired. Please search again.");
  }
  return result.data;
}

app.get("/api/health", async (context) => {
  let mongodbConnected = false;
  try {
    await getDatabase().command({ ping: 1 });
    mongodbConnected = true;
  } catch {
    // Driver errors can include credentials; readiness exposes only the result.
  }
  return context.json(
    {
      status: mongodbConnected ? "ok" : "degraded",
      duffelConfigured: Boolean(readDuffelTestToken()),
      mongodbConnected,
      mode: "test",
    },
    mongodbConnected ? 200 : 503,
  );
});

app.post("/api/flights/search", async (context) => {
  const input = await context.req.json().catch(() => undefined);
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    raiseApiError(
      400,
      "INVALID_SEARCH",
      parsed.error.issues[0]?.message ?? "Provide valid flight search details.",
    );
  }

  const search = parsed.data;
  const token = requireDuffelTestToken();
  const cache = await readFlightSearchCache(search, token);
  context.header(
    "X-Flight-Cache",
    cache.data ? "HIT" : cache.collection ? "MISS" : "BYPASS",
  );

  if (context.req.query("stream") === "true") {
    context.header("Content-Type", "application/x-ndjson; charset=utf-8");
    context.header("X-Accel-Buffering", "no");
    return stream(context, async (output) => {
      const cancelled = new AbortController();
      output.onAbort(() => cancelled.abort());
      const signal = AbortSignal.any([
        context.req.raw.signal,
        cancelled.signal,
      ]);
      try {
        const data =
          cache.data ??
          (
            await fetchAndCacheFlightSearch(cache, () =>
              fetchFlightBatches(search, {
                token,
                signal,
                onOffers: async (offers) => {
                  signal.throwIfAborted();
                  await output.writeln(
                    JSON.stringify({ type: "offers", offers }),
                  );
                },
              }),
            )
          ).data;
        signal.throwIfAborted();
        if (cache.data && data.offers.length)
          await output.writeln(
            JSON.stringify({ type: "offers", offers: data.offers }),
          );
        await output.writeln(JSON.stringify({ type: "complete" }));
      } catch {
        if (!signal.aborted)
          await output.writeln(
            JSON.stringify({
              type: "error",
              message:
                "Flight search could not be completed. Please try again.",
            }),
          );
      }
    });
  }

  if (cache.data) return context.json({ data: cache.data });
  const result = await loadFlightSearch(cache, async () => {
    const response = await requestDuffel(
      "/air/offer_requests?return_offers=true&supplier_timeout=10000",
      createOfferRequest(search),
      { token },
    );
    const parsedResponse = offerRequestSchema.safeParse(response);
    if (!parsedResponse.success)
      raiseApiError(
        502,
        "DUFFEL_INVALID_RESPONSE",
        "The flight supplier returned an invalid response. Please try again.",
      );
    return parsedResponse.data;
  });
  context.header("X-Flight-Cache", result.cache);
  return context.json({ data: result.data });
});

app.get("/api/flights/offers/:id", async (context) => {
  const parsed = offerId.safeParse(context.req.param("id"));
  if (!parsed.success) {
    raiseApiError(400, "INVALID_OFFER_ID", "Choose a valid flight offer.");
  }
  return context.json({ data: await fetchCurrentOffer(parsed.data) });
});

const checkingBooking = { data: { status: "checking" } } as const;

function replayBooking(context: Context, attempt: BookingAttempt) {
  if (attempt.status === "confirmed" && attempt.orderId)
    return context.json({ data: { orderId: attempt.orderId } });
  if (attempt.status === "failed")
    raiseApiError(
      422,
      "BOOKING_FAILED",
      "This booking could not be completed and nothing was booked. Please try again.",
    );
  return context.json(checkingBooking, 202);
}

function bookingsUnavailable(): never {
  raiseApiError(
    503,
    "BOOKINGS_UNAVAILABLE",
    "Booking is temporarily unavailable. Nothing was booked.",
  );
}

app.post("/api/bookings", async (context) => {
  const parsed = bookingRequestSchema.safeParse(
    await context.req.json().catch(() => undefined),
  );
  if (!parsed.success) {
    raiseApiError(
      400,
      "INVALID_BOOKING",
      parsed.error.issues[0]?.message ?? "Check the traveller details.",
    );
  }
  const booking = parsed.data;
  const token = requireDuffelTestToken();

  const earlier = await findBookingAttempt(booking.attemptId).catch(bookingsUnavailable);
  if (earlier) return replayBooking(context, earlier);

  const offer = await fetchCurrentOffer(booking.offerId, token);
  if (
    offer.total_amount !== booking.expectedTotal ||
    offer.total_currency !== booking.expectedCurrency
  ) {
    raiseApiError(409, "PRICE_CHANGED", "The fare has changed. Please review the new total.");
  }
  const mismatch = findTravellerMismatch(booking, offer);
  if (mismatch) raiseApiError(400, "INVALID_BOOKING", mismatch);

  const claimedElsewhere = await claimBookingAttempt({
    _id: booking.attemptId,
    offerId: offer.id,
    amount: offer.total_amount,
    currency: offer.total_currency,
  }).catch(bookingsUnavailable);
  if (claimedElsewhere) return replayBooking(context, claimedElsewhere);

  const result = await placeDuffelOrder(buildDuffelOrder(booking, offer), token);
  // A failed write only loses the replay; the customer must still see the real outcome.
  const record = (status: "confirmed" | "failed" | "unknown", orderId?: string) =>
    recordBookingOutcome(booking.attemptId, status, orderId).catch(() => {});

  if (result.outcome === "created") {
    const order = duffelOrderSchema.safeParse(result.order);
    if (order.success) {
      await record("confirmed", order.data.id);
      return context.json({ data: { orderId: order.data.id } });
    }
  }
  if (result.outcome === "rejected") {
    await record("failed");
    if (result.codes.some((code) => code === "offer_no_longer_available" || code === "offer_expired"))
      raiseApiError(410, "OFFER_UNAVAILABLE", "This fare has expired. Please search again.");
    if (result.codes.includes("price_changed"))
      raiseApiError(409, "PRICE_CHANGED", "The fare has changed. Please review the new total.");
    raiseApiError(
      422,
      "BOOKING_REJECTED",
      result.message ?? "The airline could not accept these details. Please check them and try again.",
    );
  }
  await record("unknown");
  return context.json(checkingBooking, 202);
});

app.get("/api/bookings/:orderId", async (context) => {
  const id = orderId.safeParse(context.req.param("orderId"));
  if (!id.success) raiseApiError(400, "INVALID_ORDER_ID", "Choose a valid booking.");
  const order = duffelOrderSchema.safeParse(
    await requestDuffel(`/air/orders/${encodeURIComponent(id.data)}`),
  );
  if (!order.success || order.data.id !== id.data) {
    raiseApiError(
      502,
      "DUFFEL_INVALID_RESPONSE",
      "The flight supplier returned an invalid response. Please try again.",
    );
  }
  return context.json({ data: order.data });
});

app.notFound(() =>
  Response.json(
    { error: { code: "NOT_FOUND", message: "API endpoint not found." } },
    { status: 404 },
  ),
);
app.onError((error) =>
  error instanceof HTTPException
    ? error.getResponse()
    : Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "The request could not be completed.",
          },
        },
        { status: 500 },
      ),
);

export default app;
