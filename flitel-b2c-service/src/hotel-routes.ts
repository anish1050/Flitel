import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { raiseApiError } from "./duffel.js";
import { normaliseRooms, roomsStaySchema, staySchema, summariseHotels } from "./hotels.js";
import {
  assertSandbox,
  LiteapiUnreachable,
  requestLiteapi,
  requireLiteapiKey,
} from "./liteapi.js";

const hotelIdPattern = /^[A-Za-z0-9_-]{2,40}$/;
const isSuccess = (status: number) => status >= 200 && status < 300;

// Mounted under /api; later hotel routes (prebook, bookings) are added here.
export const hotelRoutes = new Hono();

hotelRoutes.use(
  "/hotels/*",
  bodyLimit({
    maxSize: 4096,
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
