import { z } from "zod";
import {
  amountSchema,
  currencySchema,
  sliceSchema,
  type DuffelSlice,
} from "./duffel-offers";

const titles: Record<string, string> = { mr: "Mr", ms: "Ms", mrs: "Mrs", miss: "Miss" };

const orderSchema = z.object({
  id: z.string().regex(/^ord_[A-Za-z0-9]+$/),
  live_mode: z.literal(false),
  booking_reference: z.string().min(1),
  total_amount: amountSchema,
  total_currency: currencySchema,
  slices: z.array(sliceSchema).min(1),
  passengers: z
    .array(
      z.object({
        title: z.string().nullish(),
        given_name: z.string(),
        family_name: z.string(),
        email: z.string().nullish(),
      }),
    )
    .min(1),
});

export type BookedFlight = {
  id: string;
  bookingReference: string;
  totalAmount: string;
  currency: string;
  travellers: string[];
  email?: string;
  slices: DuffelSlice[];
};

export function parseDuffelOrder(input: unknown): BookedFlight {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) throw new Error("The booking details are incomplete.");
  const order = parsed.data;
  return {
    id: order.id,
    bookingReference: order.booking_reference,
    totalAmount: order.total_amount,
    currency: order.total_currency,
    travellers: order.passengers.map((passenger) =>
      [titles[passenger.title ?? ""], passenger.given_name, passenger.family_name]
        .filter(Boolean)
        .join(" "),
    ),
    email: order.passengers[0].email ?? undefined,
    slices: order.slices,
  };
}
