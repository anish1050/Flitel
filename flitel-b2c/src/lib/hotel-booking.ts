import { z } from "zod";
import { contactSchema } from "./booking";

// A hotel guest name is not matched against a passport, so it gets its own wording.
const guestNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z' -]{0,49}$/, "Use letters only, for example Anish.");

export const guestSchema = z.object({
  firstName: guestNameSchema,
  lastName: guestNameSchema,
  ...contactSchema.shape,
});
export type GuestInput = z.infer<typeof guestSchema>;

export type PendingHotelAttempt = {
  attemptId: string;
  prebookId: string;
  transactionId: string;
  expectedTotal: number;
  expectedCurrency: string;
  holder: GuestInput;
};

// Guest details stay here until the return page gets a confirmed or failed answer and clears the entry.
const storedAttemptSchema = z.object({
  state: z.literal("ready"),
  pending: z.object({
    attemptId: z.string(),
    prebookId: z.string(),
    transactionId: z.string(),
    expectedTotal: z.number(),
    expectedCurrency: z.string(),
    holder: z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
      phone: z.string(),
    }),
  }),
});

const attemptKey = (attemptId: string) => `flitel-hotel:${attemptId}`;

function writeAttempt(
  storage: Storage | undefined,
  attemptId: string,
  value: z.infer<typeof storedAttemptSchema>,
) {
  try {
    storage?.setItem(attemptKey(attemptId), JSON.stringify(value));
  } catch {}
}

export function savePendingHotelAttempt(storage: Storage | undefined, pending: PendingHotelAttempt) {
  const { attemptId, prebookId, transactionId, expectedTotal, expectedCurrency, holder } = pending;
  // Picked by name so a caller's extra fields (a secretKey, say) can never reach storage.
  writeAttempt(storage, attemptId, {
    state: "ready",
    pending: {
      attemptId,
      prebookId,
      transactionId,
      expectedTotal,
      expectedCurrency,
      holder: {
        firstName: holder.firstName,
        lastName: holder.lastName,
        email: holder.email,
        phone: holder.phone,
      },
    },
  });
}

export function readPendingHotelAttempt(
  storage: Storage | undefined,
  attemptId: string,
): { state: "ready"; pending: PendingHotelAttempt } | undefined {
  try {
    const raw = storage?.getItem(attemptKey(attemptId));
    if (!raw) return undefined;
    const parsed = storedAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function clearHotelAttempt(storage: Storage | undefined, attemptId: string) {
  try {
    storage?.removeItem(attemptKey(attemptId));
  } catch {}
}

export type HotelBookingOutcome =
  | { kind: "confirmed"; bookingId: string }
  | { kind: "checking" }
  | { kind: "failed"; code: string; message: string };

// The card is charged before the booking call, so every failed message says what happens to the money.
// BOOKINGS_UNAVAILABLE and LITEAPI_NOT_CONFIGURED claim nothing server-side, so a re-send can still book.
const refundNote =
  " If your card was charged, Flitel will arrange any refund. Please keep your booking reference.";
const failureReasons: Record<string, string> = {
  BOOKING_REJECTED: "The hotel could not accept these details, so your booking was not completed.",
  ROOM_UNAVAILABLE: "This room is no longer available, so your booking was not completed.",
  BOOKING_FAILED: "This booking could not be completed.",
  HOTELS_UNAVAILABLE: "Hotel booking is unavailable right now, so your booking was not completed.",
  INVALID_BOOKING: "We couldn't use these booking details, so your booking was not completed.",
};

const answerSchema = z.object({
  data: z.object({ bookingId: z.string().min(1) }).optional(),
  error: z.object({ code: z.string() }).optional(),
});

/** Only a booking id or an explicit failure code is proof; every other answer is still being checked. */
export function classifyHotelBooking(status: number, body: unknown): HotelBookingOutcome {
  const answer = answerSchema.safeParse(body);
  if (!answer.success) return { kind: "checking" };
  const { data, error } = answer.data;
  if (status === 200 && data) return { kind: "confirmed", bookingId: data.bookingId };
  // Only an error status proves a rejection; a 2xx carrying a code is not proof.
  if (status >= 400 && error && Object.hasOwn(failureReasons, error.code)) {
    return { kind: "failed", code: error.code, message: failureReasons[error.code] + refundNote };
  }
  return { kind: "checking" };
}
