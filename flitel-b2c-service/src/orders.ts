import { z } from "zod";
import { offerId } from "./flights.js";
import type { FlightOffer } from "./flights.js";

const nameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z' -]{0,49}$/, "Use English letters as shown on the passport.");
const dateSchema = z.iso.date("Use a valid date.");

const travellerSchema = z.object({
  id: z.string().regex(/^pas_[A-Za-z0-9_]{1,128}$/),
  title: z.enum(["mr", "ms", "mrs", "miss"]),
  givenName: nameSchema,
  familyName: nameSchema,
  bornOn: dateSchema.refine(
    (date) => date < new Date().toISOString().slice(0, 10),
    "Date of birth must be in the past.",
  ),
  gender: z.enum(["m", "f"]),
  passport: z
    .object({
      number: z.string().regex(/^[A-Z0-9]{5,20}$/),
      issuingCountry: z.string().regex(/^[A-Z]{2}$/),
      expiresOn: dateSchema,
    })
    .optional(),
});

export const bookingRequestSchema = z.object({
  attemptId: z.uuid(),
  offerId,
  expectedTotal: z.string().regex(/^\d+(\.\d+)?$/),
  expectedCurrency: z.string().regex(/^[A-Z]{3}$/),
  travellers: z.array(travellerSchema).min(1).max(9),
  contact: z.object({
    email: z.email().max(254),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  }),
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const orderId = z.string().regex(/^ord_[A-Za-z0-9]{1,128}$/);
export const duffelOrderSchema = z.looseObject({
  id: orderId,
  live_mode: z.literal(false),
  booking_reference: z.string().min(1),
});

export function findTravellerMismatch(
  request: BookingRequest,
  offer: FlightOffer,
): string | undefined {
  const fareIds = offer.passengers.map((passenger) => String(passenger.id)).sort();
  const travellerIds = request.travellers.map((traveller) => traveller.id).sort();
  if (fareIds.join() !== travellerIds.join())
    return "Traveller details do not match this fare.";
  if (
    offer.passenger_identity_documents_required === true &&
    request.travellers.some((traveller) => !traveller.passport)
  )
    return "Passport details are required for this flight.";
  return undefined;
}

export function buildDuffelOrder(request: BookingRequest, offer: FlightOffer) {
  return {
    type: "instant",
    selected_offers: [offer.id],
    metadata: { attempt_id: request.attemptId },
    payments: [
      { type: "balance", amount: offer.total_amount, currency: offer.total_currency },
    ],
    passengers: request.travellers.map((traveller) => ({
      id: traveller.id,
      title: traveller.title,
      gender: traveller.gender,
      given_name: traveller.givenName,
      family_name: traveller.familyName,
      born_on: traveller.bornOn,
      email: request.contact.email,
      phone_number: request.contact.phone,
      ...(traveller.passport && {
        identity_documents: [
          {
            type: "passport",
            unique_identifier: traveller.passport.number,
            issuing_country_code: traveller.passport.issuingCountry,
            expires_on: traveller.passport.expiresOn,
          },
        ],
      }),
    })),
  };
}
