import "server-only";
import { z } from "zod";
import { hasFlightBackend } from "./flight-api";
import {
  findDestination,
  HOTEL_CURRENCY,
  HOTEL_NATIONALITY,
  hotelBookingSchema,
  hotelDetailSchema,
  hotelSummarySchema,
  roomSchema,
  type HotelBooking,
  type HotelDetail,
  type HotelSummary,
  type Room,
  type StayInput,
} from "./hotels";

// The hotel routes share the flight backend's URL.
const backendUrl = () => process.env.FLITEL_API_URL!.trim().replace(/\/$/, "");

const unavailableMessage = "Hotels are unavailable right now. Please try again shortly.";
const invalidResponseMessage = "The hotel service returned an invalid response. Please try again.";
const loadFailedMessage = "We couldn't load this booking right now.";
const hotelIdPattern = /^[A-Za-z0-9_-]{2,40}$/;
const bookingIdPattern = /^[A-Za-z0-9_-]{3,60}$/;
const attemptReferencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stayFields = (stay: StayInput) => ({
  checkin: stay.checkin,
  checkout: stay.checkout,
  adults: stay.adults,
  currency: HOTEL_CURRENCY,
  guestNationality: HOTEL_NATIONALITY,
});

async function requestHotels(
  path: string,
  body?: unknown,
  customUnavailable?: string,
  notFoundMessage = "We couldn't find this booking.",
): Promise<unknown> {
  const unavailable = customUnavailable ?? unavailableMessage;
  if (!hasFlightBackend()) throw new Error(unavailable);
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error(unavailable);
  }
  const answer: unknown = await response.json().catch(() => null);
  if (response.status === 404) throw new Error(notFoundMessage);
  // A caller-supplied message (the booking read-back) replaces the search-flavoured wording.
  if (response.status === 400 && customUnavailable === undefined)
    throw new Error("Check the stay details and try again.");
  if (response.status === 504 && customUnavailable === undefined)
    throw new Error("Hotel search took too long. Please try again.");
  if (!response.ok) throw new Error(unavailable);
  return answer;
}

function parseData<T>(schema: z.ZodType<T>, answer: unknown, message = invalidResponseMessage): T {
  const parsed = z.object({ data: schema }).safeParse(answer);
  if (!parsed.success) throw new Error(message);
  return parsed.data.data;
}

export async function searchHotels(stay: StayInput): Promise<HotelSummary[]> {
  const destination = findDestination(stay.destination);
  if (!destination) throw new Error("Choose a destination from the list.");
  const answer = await requestHotels("/api/hotels/search", {
    countryCode: destination.countryCode,
    cityName: destination.cityName,
    ...stayFields(stay),
  });
  return parseData(z.object({ hotels: z.array(hotelSummarySchema) }), answer).hotels;
}

export async function fetchHotelRooms(
  hotelId: string,
  stay: StayInput,
): Promise<{ hotel: HotelDetail; rooms: Room[] }> {
  if (!hotelIdPattern.test(hotelId)) throw new Error("This hotel could not be found.");
  const answer = await requestHotels(
    `/api/hotels/${encodeURIComponent(hotelId)}/rates`,
    stayFields(stay),
  );
  return parseData(z.object({ hotel: hotelDetailSchema, rooms: z.array(roomSchema) }), answer);
}

// Name, photo and address only: a room's offer id is not stable between rates calls.
export async function fetchHotelDetails(hotelId: string): Promise<HotelDetail> {
  const notFound = "This hotel could not be found.";
  if (!hotelIdPattern.test(hotelId)) throw new Error(notFound);
  const answer = await requestHotels(
    `/api/hotels/${encodeURIComponent(hotelId)}`,
    undefined,
    undefined,
    notFound,
  );
  return parseData(z.object({ hotel: hotelDetailSchema }), answer).hotel;
}

type BackendAnswer = { status: number; body: unknown };

// Reserving a room charges nothing, so a lost answer here is safe to report as unavailable.
export async function prebookRoom(offerId: string): Promise<BackendAnswer> {
  const unavailable = {
    status: 503,
    body: {
      error: {
        code: "HOTELS_UNAVAILABLE",
        message: "Hotels are unavailable right now. Nothing was booked.",
      },
    },
  };
  if (!hasFlightBackend()) return unavailable;
  try {
    const response = await fetch(`${backendUrl()}/api/hotels/prebook`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ offerId }),
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return unavailable;
  }
}

export async function createHotelBooking(input: unknown): Promise<BackendAnswer> {
  if (!hasFlightBackend())
    return {
      status: 503,
      body: { error: { code: "LITEAPI_NOT_CONFIGURED", message: "Hotel booking is not available yet." } },
    };
  try {
    const response = await fetch(`${backendUrl()}/api/hotel-bookings`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(85_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    // The card is already charged and the booking may exist, so never report failure here.
    return { status: 202, body: { data: { status: "checking" } } };
  }
}

export async function fetchHotelBooking(bookingId: string, ref: string): Promise<HotelBooking> {
  if (!bookingIdPattern.test(bookingId) || !attemptReferencePattern.test(ref))
    throw new Error("We couldn't find this booking.");
  const answer = await requestHotels(
    `/api/hotel-bookings/${encodeURIComponent(bookingId)}?ref=${ref}`,
    undefined,
    loadFailedMessage,
  );
  return parseData(hotelBookingSchema, answer, loadFailedMessage);
}
