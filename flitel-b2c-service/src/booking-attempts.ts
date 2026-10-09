import { MongoServerError } from "mongodb";
import { getDatabase } from "./mongodb.js";

export type BookingStatus = "pending" | "confirmed" | "failed" | "unknown";
export type BookingAttempt = {
  _id: string;
  offerId: string;
  amount: string;
  currency: string;
  status: BookingStatus;
  orderId?: string;
  createdAt: Date;
  updatedAt: Date;
};
type NewAttempt = Pick<BookingAttempt, "_id" | "offerId" | "amount" | "currency">;

function bookingAttempts() {
  return getDatabase().collection<BookingAttempt>("booking_attempts");
}

export async function findBookingAttempt(id: string): Promise<BookingAttempt | null> {
  return bookingAttempts().findOne({ _id: id });
}

/** Returns undefined when this call owns the attempt, or the attempt another request already claimed. */
export async function claimBookingAttempt(
  attempt: NewAttempt,
): Promise<BookingAttempt | undefined> {
  const now = new Date();
  const pending: BookingAttempt = {
    ...attempt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await bookingAttempts().insertOne(pending);
    return undefined;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    return (await findBookingAttempt(attempt._id)) ?? pending;
  }
}

export async function recordBookingOutcome(
  id: string,
  status: Exclude<BookingStatus, "pending">,
  orderId?: string,
): Promise<void> {
  await bookingAttempts().updateOne(
    { _id: id },
    { $set: { status, updatedAt: new Date(), ...(orderId && { orderId }) } },
  );
}
