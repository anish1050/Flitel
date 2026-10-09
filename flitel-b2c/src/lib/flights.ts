import { z } from "zod";
import type { DuffelSlice, FareCondition } from "./duffel-offers";

export const airports = [
  {
    code: "BOM",
    city: "Mumbai",
    name: "Chhatrapati Shivaji Maharaj International",
    country: "India",
  },
  {
    code: "DEL",
    city: "New Delhi",
    name: "Indira Gandhi International",
    country: "India",
  },
  { code: "GOI", city: "Goa", name: "Dabolim Airport", country: "India" },
  {
    code: "DXB",
    city: "Dubai",
    name: "Dubai International",
    country: "United Arab Emirates",
  },
  {
    code: "LHR",
    city: "London",
    name: "Heathrow Airport",
    country: "United Kingdom",
  },
  {
    code: "SIN",
    city: "Singapore",
    name: "Changi Airport",
    country: "Singapore",
  },
  {
    code: "JTR",
    city: "Santorini",
    name: "Santorini Airport",
    country: "Greece",
  },
  {
    code: "CDG",
    city: "Paris",
    name: "Charles de Gaulle Airport",
    country: "France",
  },
  {
    code: "BKK",
    city: "Bangkok",
    name: "Suvarnabhumi Airport",
    country: "Thailand",
  },
  {
    code: "MLE",
    city: "Malé",
    name: "Velana International",
    country: "Maldives",
  },
];

export function findAirport(code: string) {
  return airports.find((airport) => airport.code === code);
}

function formatCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const airportCode = z
  .string()
  .refine(
    (code) => Boolean(findAirport(code)),
    "Choose an airport from the list.",
  );

export const searchSchema = z
  .object({
    from: airportCode,
    to: airportCode,
    depart: z.iso.date("Choose a valid departure date."),
    returnDate: z.iso.date("Choose a valid return date.").optional(),
    travellers: z.number().int().min(1).max(9),
    cabin: z.enum(["economy", "business"]),
    trip: z.enum(["one-way", "round-trip"]),
  })
  .superRefine((search, context) => {
    if (search.from === search.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "Choose a different arrival airport.",
      });
    }
    if (search.depart < formatCalendarDate(new Date())) {
      context.addIssue({
        code: "custom",
        path: ["depart"],
        message: "Departure must be today or later.",
      });
    }
    if (
      search.trip === "round-trip" &&
      (!search.returnDate || search.returnDate < search.depart)
    ) {
      context.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "Choose a return date on or after departure.",
      });
    }
  });

export type FlightSearch = z.infer<typeof searchSchema>;

export function createDefaultSearch(): FlightSearch {
  const departure = new Date();
  departure.setDate(departure.getDate() + 14);
  const returnDate = new Date(departure);
  returnDate.setDate(returnDate.getDate() + 7);
  return {
    from: "BOM",
    to: "DXB",
    depart: formatCalendarDate(departure),
    returnDate: formatCalendarDate(returnDate),
    travellers: 1,
    cabin: "economy",
    trip: "round-trip",
  };
}

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
): FlightSearch {
  return searchSchema.parse({
    ...params,
    travellers:
      typeof params.travellers === "string"
        ? Number(params.travellers)
        : params.travellers,
  });
}

export function buildSearchQuery(search: FlightSearch): string {
  const params = new URLSearchParams({
    from: search.from,
    to: search.to,
    depart: search.depart,
    travellers: String(search.travellers),
    cabin: search.cabin,
    trip: search.trip,
  });
  if (search.trip === "round-trip" && search.returnDate)
    params.set("returnDate", search.returnDate);
  return params.toString();
}

export type FlightOffer = {
  id: string;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  arrivalDayOffset: number;
  durationMinutes: number | null;
  stops: number;
  price: number;
  baggage: string;
  refundable: boolean | null;
  currency: string;
  priceScope: "adult" | "journey";
  passengerIds?: string[];
  expiresAt?: string;
  totalAmount?: string;
  identityDocumentsRequired?: boolean;
  slices?: DuffelSlice[];
  refundCondition?: FareCondition;
  changeCondition?: FareCondition;
};

// Handcrafted demo fares and schedules; these do not represent supplier availability.
const sampleOffers: Omit<FlightOffer, "currency" | "priceScope">[] = [
  {
    id: "emirates",
    airline: "Emirates",
    airlineCode: "EK",
    flightNumber: "EK 503",
    departure: "08:10",
    arrival: "11:25",
    arrivalDayOffset: 0,
    durationMinutes: 195,
    stops: 0,
    price: 12680,
    baggage: "25 kg checked bag",
    refundable: true,
  },
  {
    id: "air-india",
    airline: "Air India",
    airlineCode: "AI",
    flightNumber: "AI 983",
    departure: "10:30",
    arrival: "14:10",
    arrivalDayOffset: 0,
    durationMinutes: 220,
    stops: 0,
    price: 9870,
    baggage: "25 kg checked bag",
    refundable: false,
  },
  {
    id: "indigo",
    airline: "IndiGo",
    airlineCode: "6E",
    flightNumber: "6E 1453",
    departure: "06:15",
    arrival: "10:05",
    arrivalDayOffset: 0,
    durationMinutes: 230,
    stops: 0,
    price: 8790,
    baggage: "20 kg checked bag",
    refundable: false,
  },
  {
    id: "qatar",
    airline: "Qatar Airways",
    airlineCode: "QR",
    flightNumber: "QR 557",
    departure: "18:40",
    arrival: "00:45",
    arrivalDayOffset: 1,
    durationMinutes: 365,
    stops: 1,
    price: 11240,
    baggage: "25 kg checked bag",
    refundable: true,
  },
  {
    id: "etihad",
    airline: "Etihad Airways",
    airlineCode: "EY",
    flightNumber: "EY 205",
    departure: "14:20",
    arrival: "19:55",
    arrivalDayOffset: 0,
    durationMinutes: 335,
    stops: 1,
    price: 11920,
    baggage: "25 kg checked bag",
    refundable: false,
  },
];

export function createDemoOffers(search: FlightSearch): FlightOffer[] {
  const journeyMultiplier = search.trip === "round-trip" ? 2 : 1;
  const cabinMultiplier = search.cabin === "business" ? 2.6 : 1;
  return sampleOffers.map((offer) => ({
    ...offer,
    currency: "INR",
    priceScope: "adult",
    price: Math.round(offer.price * journeyMultiplier * cabinMultiplier),
  }));
}

export function formatPrice(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : undefined,
  }).format(amount);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Duration unavailable";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
