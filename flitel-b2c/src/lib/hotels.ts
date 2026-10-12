import { z } from "zod";
import { formatCalendarDate } from "./flights";

export const HOTEL_CURRENCY = "INR";
export const HOTEL_NATIONALITY = "IN";
const maxNights = 30;

// LiteAPI's city names may need tuning once a key exists; keep them in this one table.
export const hotelDestinations = [
  { id: "mumbai", label: "Mumbai", cityName: "Mumbai", countryCode: "IN" },
  { id: "new-delhi", label: "New Delhi", cityName: "New Delhi", countryCode: "IN" },
  { id: "goa", label: "Goa", cityName: "Goa", countryCode: "IN" },
  { id: "dubai", label: "Dubai", cityName: "Dubai", countryCode: "AE" },
  { id: "london", label: "London", cityName: "London", countryCode: "GB" },
  { id: "singapore", label: "Singapore", cityName: "Singapore", countryCode: "SG" },
  { id: "paris", label: "Paris", cityName: "Paris", countryCode: "FR" },
  { id: "bangkok", label: "Bangkok", cityName: "Bangkok", countryCode: "TH" },
  { id: "santorini", label: "Santorini", cityName: "Santorini", countryCode: "GR" },
  { id: "male", label: "Malé", cityName: "Malé", countryCode: "MV" },
];

export function findDestination(id: string) {
  return hotelDestinations.find((destination) => destination.id === id);
}

export type StayInput = {
  destination: string;
  checkin: string;
  checkout: string;
  adults: number;
};

export function nightsBetween(checkin: string, checkout: string): number {
  return Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000);
}

const adultsMessage = "Choose between 1 and 9 adults.";

function createStaySchema(today: string) {
  return z
    .object({
      destination: z
        .string("Choose a destination.")
        .refine((id) => Boolean(findDestination(id)), "Choose a destination from the list."),
      checkin: z.iso.date("Choose a valid check-in date."),
      checkout: z.iso.date("Choose a valid check-out date."),
      adults: z
        .number(adultsMessage)
        .int(adultsMessage)
        .min(1, adultsMessage)
        .max(9, adultsMessage),
    })
    .superRefine((stay, context) => {
      if (stay.checkin < today) {
        context.addIssue({ code: "custom", path: ["checkin"], message: "Check-in must be today or later." });
      }
      if (stay.checkout <= stay.checkin) {
        context.addIssue({ code: "custom", path: ["checkout"], message: "Check-out must be after check-in." });
      } else if (nightsBetween(stay.checkin, stay.checkout) > maxNights) {
        context.addIssue({
          code: "custom",
          path: ["checkout"],
          message: `Stays are limited to ${maxNights} nights.`,
        });
      }
    });
}

export function parseStayParams(
  params: Record<string, string | string[] | undefined>,
  today = formatCalendarDate(new Date()),
): StayInput {
  const parsed = createStaySchema(today).safeParse({
    ...params,
    adults: typeof params.adults === "string" && params.adults !== "" ? Number(params.adults) : undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return parsed.data;
}

export function defaultStay(from = new Date()): StayInput {
  const checkin = new Date(from);
  checkin.setDate(checkin.getDate() + 14);
  const checkout = new Date(checkin);
  checkout.setDate(checkout.getDate() + 2);
  return {
    destination: hotelDestinations[0].id,
    checkin: formatCalendarDate(checkin),
    checkout: formatCalendarDate(checkout),
    adults: 2,
  };
}

export function buildStayQuery(stay: StayInput): string {
  return new URLSearchParams({
    destination: stay.destination,
    checkin: stay.checkin,
    checkout: stay.checkout,
    adults: String(stay.adults),
  }).toString();
}

// Mirrors the backend's JSON (flitel-b2c-service/src/hotels.ts).
const priceSchema = z.object({ amount: z.number(), currency: z.string() });

export const hotelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  photo: z.string().optional(),
  address: z.string().optional(),
  stars: z.number().optional(),
  rating: z.number().optional(),
  price: priceSchema,
  refundable: z.boolean(),
});
export type HotelSummary = z.infer<typeof hotelSummarySchema>;

export const roomSchema = z.object({
  offerId: z.string(),
  name: z.string(),
  boardName: z.string().optional(),
  refundable: z.boolean(),
  cancelBefore: z.string().optional(),
  price: priceSchema,
  taxesNotIncluded: z.array(
    z.object({ description: z.string(), amount: z.number(), currency: z.string() }),
  ),
});
export type Room = z.infer<typeof roomSchema>;

export const hotelDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  photo: z.string().optional(),
  address: z.string().optional(),
  stars: z.number().optional(),
  rating: z.number().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  facilities: z.array(z.string()).optional(),
});
export type HotelDetail = z.infer<typeof hotelDetailSchema>;

export const prebookSchema = z.object({
  prebookId: z.string(),
  transactionId: z.string(),
  secretKey: z.string(),
  hotelId: z.string(),
  checkin: z.string(),
  checkout: z.string(),
  price: priceSchema,
  priceDifferencePercent: z.number(),
  cancellationChanged: z.boolean(),
  boardChanged: z.boolean(),
  refundable: z.boolean(),
});
export type Prebook = z.infer<typeof prebookSchema>;

export const hotelBookingSchema = z.object({
  bookingId: z.string(),
  status: z.string(),
  hotel: z.object({ id: z.string(), name: z.string() }),
  checkin: z.string(),
  checkout: z.string(),
  holder: z.object({ firstName: z.string(), lastName: z.string(), email: z.string() }),
  price: z.number(),
  currency: z.string(),
  cancellation: z.object({
    refundableTag: z.string().optional(),
    cancelPolicyInfos: z.array(
      z.object({
        cancelTime: z.string().optional(),
        amount: z.number().optional(),
        currency: z.string().optional(),
      }),
    ),
  }),
  hotelConfirmationCode: z.string().optional(),
});
export type HotelBooking = z.infer<typeof hotelBookingSchema>;
