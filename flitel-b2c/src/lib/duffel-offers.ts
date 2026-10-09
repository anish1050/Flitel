import { z } from "zod";
import type { FlightOffer } from "./flights";

const airportSchema = z.object({
  iata_code: z.string().regex(/^[A-Z]{3}$/),
  name: z.string(),
});
const airlineSchema = z.object({
  name: z.string().min(1),
  iata_code: z.string().nullable(),
});
export const amountSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((amount) => Number.isFinite(Number(amount)));
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const conditionSchema = z
  .object({
    allowed: z.boolean(),
    penalty_amount: amountSchema.nullish(),
    penalty_currency: currencySchema.nullish(),
  })
  .nullish();

const segmentSchema = z.object({
  id: z.string(),
  origin: airportSchema,
  destination: airportSchema,
  departing_at: z.iso.datetime({ local: true }),
  arriving_at: z.iso.datetime({ local: true }),
  marketing_carrier: airlineSchema,
  marketing_carrier_flight_number: z.string(),
  operating_carrier: airlineSchema.nullish(),
  stops: z.array(z.object({ airport: airportSchema })).default([]),
  passengers: z
    .array(
      z.object({
        passenger_id: z.string(),
        cabin_class: z.string().nullish(),
        baggages: z
          .array(
            z.object({
              type: z.string(),
              quantity: z.number().int().nonnegative(),
            }),
          )
          .nullish(),
      }),
    )
    .default([]),
});

export const sliceSchema = z.object({
  id: z.string(),
  duration: z.string().nullish(),
  segments: z.array(segmentSchema).min(1),
});

export type DuffelSlice = z.infer<typeof sliceSchema>;
export type FareCondition = z.infer<typeof conditionSchema>;

const offerSchema = z.object({
  id: z.string().regex(/^off_[A-Za-z0-9_]+$/),
  live_mode: z.literal(false),
  total_amount: amountSchema,
  total_currency: currencySchema,
  passenger_identity_documents_required: z.boolean().default(false),
  expires_at: z.iso.datetime({ offset: true }),
  owner: airlineSchema,
  passengers: z.array(z.object({ id: z.string() })).min(1),
  slices: z.array(sliceSchema).min(1),
  conditions: z
    .object({
      refund_before_departure: conditionSchema,
      change_before_departure: conditionSchema,
    })
    .nullish(),
});

export function durationInMinutes(
  duration: string | null | undefined,
): number | null {
  const parts = duration?.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!parts) return null;
  return (
    Number(parts[1] ?? 0) * 1440 +
    Number(parts[2] ?? 0) * 60 +
    Number(parts[3] ?? 0) +
    Math.ceil(Number(parts[4] ?? 0) / 60)
  );
}

export function sliceStops(slice: DuffelSlice): number {
  return (
    slice.segments.length -
    1 +
    slice.segments.reduce((count, segment) => count + segment.stops.length, 0)
  );
}

export function parseDuffelOffer(input: unknown): FlightOffer {
  const parsed = offerSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "The flight provider returned an incomplete test offer. Please search again.",
    );
  const offer = parsed.data;
  if (Date.parse(offer.expires_at) <= Date.now())
    throw new Error("This fare has expired. Search again for current offers.");
  const outbound = offer.slices[0];
  const first = outbound.segments[0];
  const last = outbound.segments.at(-1)!;
  const durations = offer.slices.map((slice) =>
    durationInMinutes(slice.duration),
  );
  return {
    id: offer.id,
    airline: offer.owner.name,
    airlineCode: offer.owner.iata_code ?? "AIR",
    flightNumber:
      `${first.marketing_carrier.iata_code ?? ""} ${first.marketing_carrier_flight_number}`.trim(),
    departure: first.departing_at.slice(11, 16),
    arrival: last.arriving_at.slice(11, 16),
    arrivalDayOffset: Math.round(
      (Date.parse(last.arriving_at.slice(0, 10)) -
        Date.parse(first.departing_at.slice(0, 10))) /
        86_400_000,
    ),
    durationMinutes: durations.some((duration) => duration === null)
      ? null
      : durations.reduce<number>((total, duration) => total + duration!, 0),
    stops: offer.slices.reduce((total, slice) => total + sliceStops(slice), 0),
    price: Number(offer.total_amount),
    currency: offer.total_currency,
    totalAmount: offer.total_amount,
    identityDocumentsRequired: offer.passenger_identity_documents_required,
    priceScope: "journey",
    passengerIds: offer.passengers.map((passenger) => passenger.id),
    baggage: "See baggage by traveller in itinerary",
    refundable: offer.conditions?.refund_before_departure?.allowed ?? null,
    refundCondition: offer.conditions?.refund_before_departure,
    changeCondition: offer.conditions?.change_before_departure,
    expiresAt: offer.expires_at,
    slices: offer.slices,
  };
}
