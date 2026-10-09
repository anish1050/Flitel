import { z } from "zod";

const airportCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use a three-letter uppercase airport code.");
export const offerId = z.string().regex(/^off_[A-Za-z0-9_]{1,128}$/);
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
    if (search.depart < new Date().toISOString().slice(0, 10)) {
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
const supplierObject = z.record(z.string(), z.unknown());
export const offerSchema = z.looseObject({
  id: offerId,
  live_mode: z.literal(false),
  expires_at: z.iso.datetime({ offset: true }),
  total_amount: z.string().regex(/^\d+(\.\d+)?$/),
  total_currency: z.string().regex(/^[A-Z]{3}$/),
  slices: z.array(supplierObject).min(1),
  passengers: z.array(supplierObject).min(1),
});
export const offerRequestSchema = z.object({
  id: z.string().startsWith("orq_"),
  live_mode: z.literal(false),
  offers: z.array(offerSchema),
  passengers: z.array(supplierObject).min(1),
});

export type FlightSearch = z.infer<typeof searchSchema>;
export type OfferRequest = z.infer<typeof offerRequestSchema>;
export type FlightOffer = z.infer<typeof offerSchema>;

export function createOfferRequest(search: FlightSearch) {
  const slices = [
    {
      origin: search.from,
      destination: search.to,
      departure_date: search.depart,
    },
  ];
  if (search.trip === "round-trip") {
    slices.push({
      origin: search.to,
      destination: search.from,
      departure_date: search.returnDate!,
    });
  }
  return {
    slices,
    passengers: Array.from({ length: search.travellers }, () => ({
      type: "adult",
    })),
    cabin_class: search.cabin,
  };
}
