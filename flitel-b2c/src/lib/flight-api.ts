import "server-only";
import { z } from "zod";
import {
  createDemoOffers,
  type FlightOffer,
  type FlightSearch,
} from "./flights";
import { parseDuffelOffer } from "./duffel-offers";
import { parseDuffelOrder, type BookedFlight } from "./duffel-orders";

function backendUrl(): string {
  return process.env.FLITEL_API_URL!.trim().replace(/\/$/, "");
}

export function hasFlightBackend(): boolean {
  return Boolean(process.env.FLITEL_API_URL?.trim());
}

export async function streamFlightOffers(
  search: FlightSearch,
  signal: AbortSignal,
): Promise<Response> {
  if (!hasFlightBackend())
    return Response.json(
      { error: "Flight search is not available yet." },
      { status: 503 },
    );
  try {
    const response = await fetch(
      `${backendUrl()}/api/flights/search?stream=true`,
      {
        method: "POST",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(search),
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      },
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return Response.json(
        { error: "Flight search is temporarily unavailable." },
        { status: 502 },
      );
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { error: "Flight search is temporarily unavailable." },
      { status: 502 },
    );
  }
}

async function requestFlights(
  path: string,
  search?: FlightSearch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `${backendUrl()}${path}`,
      {
        method: search ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          ...(search ? { "Content-Type": "application/json" } : {}),
        },
        body: search ? JSON.stringify(search) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      },
    );
  } catch {
    throw new Error(
      "The flight search service is unavailable. Please try again shortly.",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 410)
    throw new Error("This fare has expired. Search again for current offers.");
  if (response.status === 503)
    throw new Error(
      "Flight search is not available yet. Please try again shortly.",
    );
  if (!response.ok) {
    throw new Error(
      "Flight search is temporarily unavailable. Please try again.",
    );
  }
  return body;
}

export async function fetchFlightOffers(
  search: FlightSearch,
): Promise<FlightOffer[]> {
  if (!hasFlightBackend()) return createDemoOffers(search);
  const response = z
    .object({
      data: z.object({
        live_mode: z.literal(false),
        offers: z.array(z.unknown()),
      }),
    })
    .safeParse(await requestFlights("/api/flights/search", search));
  if (!response.success)
    throw new Error(
      "The flight search service returned an invalid response. Please try again.",
    );
  return response.data.data.offers.map(parseDuffelOffer);
}

export async function fetchFlightOffer(
  id: string,
  search: FlightSearch,
): Promise<FlightOffer | undefined> {
  if (!hasFlightBackend())
    return createDemoOffers(search).find((offer) => offer.id === id);
  if (!/^off_[A-Za-z0-9_]+$/.test(id))
    throw new Error(
      "This sample fare is no longer available. Start a new search for Duffel test offers.",
    );
  return fetchSupplierOffer(id);
}

export async function fetchSupplierOffer(id: string): Promise<FlightOffer> {
  const response = z
    .object({ data: z.unknown() })
    .safeParse(await requestFlights(`/api/flights/offers/${encodeURIComponent(id)}`));
  if (!response.success)
    throw new Error("The flight search service returned an invalid response. Please try again.");
  return parseDuffelOffer(response.data.data);
}

const checkingBooking = { status: 202, body: { data: { status: "checking" } } };

export async function createBooking(
  input: unknown,
): Promise<{ status: number; body: unknown }> {
  if (!hasFlightBackend())
    return {
      status: 503,
      body: { error: { code: "BOOKINGS_UNAVAILABLE", message: "Booking is not available yet." } },
    };
  try {
    const response = await fetch(`${backendUrl()}/api/bookings`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(75_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    // The order may already exist when the backend stops answering, so never report failure here.
    return checkingBooking;
  }
}

export async function fetchBooking(orderId: string): Promise<BookedFlight> {
  if (!/^ord_[A-Za-z0-9]+$/.test(orderId) || !hasFlightBackend())
    throw new Error("This booking could not be found.");
  const response = z
    .object({ data: z.unknown() })
    .safeParse(await requestFlights(`/api/bookings/${encodeURIComponent(orderId)}`));
  if (!response.success) throw new Error("This booking could not be loaded.");
  return parseDuffelOrder(response.data.data);
}
