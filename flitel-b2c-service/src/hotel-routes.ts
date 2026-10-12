import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  claimBookingAttempt,
  findBookingAttempt,
  recordBookingOutcome,
} from "./booking-attempts.js";
import type { BookingAttempt } from "./booking-attempts.js";
import { raiseApiError } from "./duffel.js";
import {
  attemptReferencePattern,
  bookingBelongsToAttempt,
  buildLiteapiBook,
  classifyBookResponse,
  hotelBookingRequestSchema,
  normaliseBooking,
  normalisePrebook,
  normaliseRooms,
  prebookRequestSchema,
  roomsStaySchema,
  staySchema,
  summariseHotels,
} from "./hotels.js";
import {
  assertSandbox,
  liteapiErrorCode,
  LiteapiUnreachable,
  requestLiteapi,
  requireLiteapiKey,
} from "./liteapi.js";

const hotelIdPattern = /^[A-Za-z0-9_-]{2,40}$/;
const isSuccess = (status: number) => status >= 200 && status < 300;

// Mounted under /api.
export const hotelRoutes = new Hono();

hotelRoutes.use(
  "/hotels/*",
  bodyLimit({
    maxSize: 4096,
    onError: () =>
      raiseApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
  }),
);

hotelRoutes.use(
  "/hotel-bookings",
  bodyLimit({
    maxSize: 8 * 1024,
    onError: () =>
      raiseApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
  }),
);

async function requestRates(body: unknown): Promise<unknown> {
  let result;
  try {
    result = await requestLiteapi("api", "/hotels/rates", { method: "POST", body });
  } catch (error) {
    if (error instanceof LiteapiUnreachable) {
      raiseApiError(504, "HOTELS_TIMEOUT", "Hotel search took too long. Please try again.");
    }
    throw error;
  }
  // LiteAPI answers 404 when nothing is available for the stay.
  if (result.status === 404) return { data: [] };
  if (!isSuccess(result.status)) {
    raiseApiError(
      502,
      "HOTELS_UNAVAILABLE",
      "Hotels are unavailable right now. Nothing was booked.",
    );
  }
  assertSandbox(result.body);
  return result.body;
}

async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

function invalidStay(message?: string): never {
  raiseApiError(400, "INVALID_STAY", message ?? "Provide valid stay details.");
}

hotelRoutes.post("/hotels/search", async (context) => {
  const parsed = staySchema.safeParse(await readJson(context.req.raw));
  if (!parsed.success) invalidStay(parsed.error.issues[0]?.message);
  const { countryCode, cityName, checkin, checkout, adults, currency, guestNationality } =
    parsed.data;
  requireLiteapiKey();

  const response = await requestRates({
    countryCode,
    cityName,
    occupancies: [{ adults }],
    currency,
    guestNationality,
    checkin,
    checkout,
    timeout: 6,
    includeHotelData: true,
    maxRatesPerHotel: 1,
    limit: 40,
  });
  return context.json({ data: { hotels: summariseHotels(response) } });
});

hotelRoutes.post("/hotels/:hotelId/rates", async (context) => {
  const hotelId = context.req.param("hotelId");
  if (!hotelIdPattern.test(hotelId)) {
    raiseApiError(400, "INVALID_HOTEL_ID", "Choose a valid hotel.");
  }
  const parsed = roomsStaySchema.safeParse(await readJson(context.req.raw));
  if (!parsed.success) invalidStay(parsed.error.issues[0]?.message);
  const { checkin, checkout, adults, currency, guestNationality } = parsed.data;
  requireLiteapiKey();

  // The details only enrich the page, so a failure there is never an error.
  const details = requestLiteapi(
    "api",
    `/data/hotel?hotelId=${encodeURIComponent(hotelId)}`,
    { timeoutMs: 4_000 },
  ).then(
    (result) => (isSuccess(result.status) ? result.body : undefined),
    () => undefined,
  );
  const response = await requestRates({
    hotelIds: [hotelId],
    occupancies: [{ adults }],
    currency,
    guestNationality,
    checkin,
    checkout,
    timeout: 6,
    includeHotelData: true,
  });
  return context.json({
    data: normaliseRooms(response, hotelId, await details),
  });
});

hotelRoutes.post("/hotels/prebook", async (context) => {
  const parsed = prebookRequestSchema.safeParse(await readJson(context.req.raw));
  if (!parsed.success) raiseApiError(400, "INVALID_OFFER_ID", "Choose a valid room.");
  requireLiteapiKey();

  let result;
  try {
    result = await requestLiteapi("book", "/rates/prebook", {
      method: "POST",
      body: { offerId: parsed.data.offerId, usePaymentSdk: true },
      timeoutMs: 30_000,
    });
  } catch (error) {
    if (error instanceof LiteapiUnreachable) {
      raiseApiError(504, "HOTELS_TIMEOUT", "Reserving the room took too long. Please try again.");
    }
    throw error;
  }

  if (!isSuccess(result.status)) {
    const code = liteapiErrorCode(result.body);
    if (code === 4040 || code === 4002) {
      raiseApiError(410, "OFFER_UNAVAILABLE", "This room is no longer available.");
    }
    const unavailable = result.status === 401 ? 503 : 502;
    raiseApiError(
      unavailable,
      "HOTELS_UNAVAILABLE",
      "Hotels are unavailable right now. Nothing was booked.",
    );
  }
  assertSandbox(result.body);
  try {
    return context.json({ data: normalisePrebook(result.body) });
  } catch {
    raiseApiError(
      502,
      "LITEAPI_INVALID_RESPONSE",
      "The hotel supplier returned an invalid response. Please try again.",
    );
  }
});

const checkingBooking = { data: { status: "checking" } } as const;

function replayBooking(context: Context, attempt: BookingAttempt) {
  if (attempt.status === "confirmed" && attempt.orderId) {
    return context.json({ data: { bookingId: attempt.orderId } });
  }
  if (attempt.status === "failed") {
    raiseApiError(
      422,
      "BOOKING_FAILED",
      "This booking could not be completed. Please keep your reference.",
    );
  }
  return context.json(checkingBooking, 202);
}

// One prebook is one payment, so the claim is keyed by it and not by the client's attemptId.
const attemptKey = (prebookId: string) => `hotel:${prebookId}`;

function bookingsUnavailable(): never {
  raiseApiError(
    503,
    "BOOKINGS_UNAVAILABLE",
    "We couldn't process this booking right now. Please keep your reference.",
  );
}

hotelRoutes.post("/hotel-bookings", async (context) => {
  const parsed = hotelBookingRequestSchema.safeParse(await readJson(context.req.raw));
  if (!parsed.success) {
    raiseApiError(
      400,
      "INVALID_BOOKING",
      parsed.error.issues[0]?.message ?? "Check the guest details.",
    );
  }
  const booking = parsed.data;
  requireLiteapiKey();

  const earlier = await findBookingAttempt(attemptKey(booking.prebookId)).catch(bookingsUnavailable);
  if (earlier) return replayBooking(context, earlier);

  // After this claim, never raise an error code the frontend treats as nothing-booked.
  const claimedElsewhere = await claimBookingAttempt({
    _id: attemptKey(booking.prebookId),
    offerId: booking.prebookId,
    amount: String(booking.expectedTotal),
    currency: booking.expectedCurrency,
  }).catch(bookingsUnavailable);
  if (claimedElsewhere) return replayBooking(context, claimedElsewhere);

  const outcome = classifyBookResponse(
    await requestLiteapi("book", "/rates/book", {
      method: "POST",
      body: buildLiteapiBook(booking),
      timeoutMs: 60_000,
    }).catch(() => "unreachable" as const),
  );
  // A failed write only loses the replay; the customer must still see the real outcome.
  const record = (status: "confirmed" | "failed" | "unknown", bookingId?: string) =>
    recordBookingOutcome(attemptKey(booking.prebookId), status, bookingId).catch(() => {});

  switch (outcome.kind) {
    case "confirmed":
      await record("confirmed", outcome.bookingId);
      return context.json({ data: { bookingId: outcome.bookingId } });
    case "rejected":
      await record("failed");
      raiseApiError(
        422,
        "BOOKING_REJECTED",
        "The hotel could not accept these details.",
      );
    case "room-unavailable":
      await record("failed");
      raiseApiError(
        410,
        "ROOM_UNAVAILABLE",
        "This room is no longer available. Please keep your reference.",
      );
    case "not-authorised":
      await record("failed");
      raiseApiError(
        503,
        "HOTELS_UNAVAILABLE",
        "Hotel booking is unavailable right now. Please keep your reference.",
      );
    case "unknown":
    default:
      // An outcome kind added later must still answer checking, never a 500 after a possible booking.
      await record("unknown");
      return context.json(checkingBooking, 202);
  }
});

const bookingIdPattern = /^[A-Za-z0-9_-]{3,60}$/;

function isBookingNotFound({ status, body }: { status: number; body: unknown }): boolean {
  if (status === 404 || status === 204) return true;
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return status < 500 && typeof message === "string" && /not found/i.test(message);
}

hotelRoutes.get("/hotel-bookings/:bookingId", async (context) => {
  const bookingId = context.req.param("bookingId");
  if (!bookingIdPattern.test(bookingId)) {
    raiseApiError(400, "INVALID_BOOKING_ID", "Choose a valid booking.");
  }
  const ref = context.req.query("ref") ?? "";
  if (!attemptReferencePattern.test(ref)) {
    raiseApiError(400, "INVALID_BOOKING_REF", "Use the link from your booking.");
  }
  requireLiteapiKey();

  const result = await requestLiteapi("book", `/bookings/${encodeURIComponent(bookingId)}`).catch(
    () => undefined,
  );
  if (result && isBookingNotFound(result)) bookingNotFound();
  if (!result || !isSuccess(result.status)) {
    raiseApiError(
      502,
      "HOTELS_UNAVAILABLE",
      "Hotels are unavailable right now. Please try again.",
    );
  }
  assertSandbox(result.body);
  if (!bookingBelongsToAttempt(result.body, ref)) bookingNotFound();
  try {
    return context.json({ data: normaliseBooking(result.body) });
  } catch {
    raiseApiError(
      502,
      "LITEAPI_INVALID_RESPONSE",
      "The hotel supplier returned an invalid response. Please try again.",
    );
  }
});

function bookingNotFound(): never {
  raiseApiError(404, "BOOKING_NOT_FOUND", "We could not find this booking.");
}
