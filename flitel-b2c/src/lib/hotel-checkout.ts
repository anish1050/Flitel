import { formatPrice } from "./flights";
import type { HotelBookingOutcome, PendingHotelAttempt } from "./hotel-booking";
import type { Prebook } from "./hotels";

export function buildHotelReturnUrl(
  origin: string,
  ids: { attemptId: string; prebookId: string; transactionId: string },
): string {
  const query = new URLSearchParams({
    attempt: ids.attemptId,
    pid: ids.prebookId,
    tid: ids.transactionId,
  });
  return `${origin}/hotels/complete?${query}`;
}

/** What the customer must accept before the card form; empty when the prebook matches the summary. */
export function describePrebookChanges(
  prebook: Prebook,
  summary: { amount: number; currency: string },
): string[] {
  const changes: string[] = [];
  const { price } = prebook;
  const amountDiffers = price.amount !== summary.amount || price.currency !== summary.currency;
  if (amountDiffers) {
    changes.push(
      `The total changed from ${formatPrice(summary.amount, summary.currency)} to ${formatPrice(price.amount, price.currency)}.`,
    );
  } else if (prebook.priceDifferencePercent !== 0) {
    changes.push(`The total is now ${formatPrice(price.amount, price.currency)}.`);
  }
  if (prebook.cancellationChanged) changes.push("The cancellation terms changed.");
  if (prebook.boardChanged) changes.push("The board (meals included) changed.");
  return changes;
}

type StoredAttempt = { state: "ready"; pending: PendingHotelAttempt } | { state: "checking" } | undefined;

export type ReturnState =
  | { kind: "missing" }
  | { kind: "checking" }
  | { kind: "ready"; pending: PendingHotelAttempt };

/** The URL is only trusted when it names the same prebook and transaction the tab stored. */
export function resolveReturnState(
  params: { attempt: string | null; pid: string | null; tid: string | null },
  stored: StoredAttempt,
): ReturnState {
  if (!params.attempt || !stored) return { kind: "missing" };
  if (stored.state === "checking") return { kind: "checking" };
  const { pending } = stored;
  const matches =
    pending.attemptId === params.attempt &&
    pending.prebookId === params.pid &&
    pending.transactionId === params.tid;
  return matches ? { kind: "ready", pending } : { kind: "missing" };
}

/** Only a proven answer ends the attempt; anything else keeps the details so a re-send can finish it. */
export function shouldKeepAttempt(outcome: HotelBookingOutcome): boolean {
  return outcome.kind === "checking";
}
