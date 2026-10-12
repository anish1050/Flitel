"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { browserStorage } from "@/lib/booking";
import {
  classifyHotelBooking,
  clearHotelAttempt,
  readPendingHotelAttempt,
  type PendingHotelAttempt,
} from "@/lib/hotel-booking";
import { resolveReturnState, shouldKeepAttempt } from "@/lib/hotel-checkout";

type View =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "confirming" }
  | { kind: "checking"; pending?: PendingHotelAttempt }
  | { kind: "failed"; message: string };

const shortReference = (attemptId: string) => attemptId.slice(0, 8).toUpperCase();

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="itinerary-panel booking-panel" role="status">
      <div className="panel-heading">
        <span>
          <Info size={18} /> {title}
        </span>
      </div>
      <div className="itinerary-body booking-checking">{children}</div>
    </section>
  );
}

async function sendBooking(pending: PendingHotelAttempt) {
  const { attemptId, prebookId, transactionId, expectedTotal, expectedCurrency, holder } = pending;
  const response = await fetch("/api/hotel-bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attemptId, prebookId, transactionId, expectedTotal, expectedCurrency, holder }),
    cache: "no-store",
  }).catch(() => undefined);
  // No response means the booking may exist, which classifies as checking.
  const body: unknown = await response?.json().catch(() => null);
  return classifyHotelBooking(response?.status ?? 0, body);
}

export function HotelComplete() {
  const router = useRouter();
  const search = useSearchParams();
  const attempt = search.get("attempt");
  const [view, setView] = useState<View>({ kind: "loading" });
  // One return page load sends one booking request, even under Strict Mode.
  const started = useRef(false);
  const sending = useRef(false);

  // The ready attempt stays stored until the answer is proven: the card is already charged, so a
  // reload or "Check again" must be able to send the same request again (the backend claims it once).
  async function confirm(pending: PendingHotelAttempt) {
    if (sending.current) return;
    sending.current = true;
    setView({ kind: "confirming" });
    const outcome = await sendBooking(pending);
    sending.current = false;
    if (shouldKeepAttempt(outcome)) {
      setView({ kind: "checking", pending });
      return;
    }
    clearHotelAttempt(browserStorage(), pending.attemptId);
    if (outcome.kind === "failed") {
      setView({ kind: "failed", message: outcome.message });
      return;
    }
    if (outcome.kind === "confirmed")
      router.replace(
        `/hotel-bookings/${encodeURIComponent(outcome.bookingId)}?ref=${encodeURIComponent(pending.attemptId)}`,
      );
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const state = resolveReturnState(
      { attempt, pid: search.get("pid"), tid: search.get("tid") },
      attempt ? readPendingHotelAttempt(browserStorage(), attempt) : undefined,
    );
    if (state.kind === "ready") void confirm(state.pending);
    else setView({ kind: state.kind });
  }, []);

  const reference = attempt ? shortReference(attempt) : undefined;
  const referenceLine = reference && (
    <p>
      Quote reference <strong>{reference}</strong> if you contact us.
    </p>
  );

  if (view.kind === "loading" || view.kind === "confirming")
    return (
      <Panel title="Confirming your booking…">
        <p>Please keep this page open while we confirm your room with the hotel.</p>
      </Panel>
    );
  if (view.kind === "checking") {
    const { pending } = view;
    return (
      <Panel title="We’re checking your booking">
        <p>
          Your payment went through and we are confirming the room. Please keep this reference. If
          this stays on screen, press Check again. Please don’t book or pay again.
        </p>
        {referenceLine}
        {pending && (
          <button type="button" className="button button-blue" onClick={() => void confirm(pending)}>
            Check again
          </button>
        )}
      </Panel>
    );
  }
  if (view.kind === "failed")
    return (
      <section className="itinerary-panel booking-panel" role="alert">
        <div className="panel-heading">
          <span>We couldn’t complete this booking</span>
        </div>
        <div className="itinerary-body booking-checking">
          <p>{view.message}</p>
          {referenceLine}
          <Link href="/hotels" className="button button-blue">
            Search hotels
          </Link>
        </div>
      </section>
    );
  return (
    <section className="itinerary-panel booking-panel" role="alert">
      <div className="panel-heading">
        <span>We couldn’t find this payment attempt</span>
      </div>
      <div className="itinerary-body booking-checking">
        <p>
          This page only works in the browser tab where the payment started. If your card was
          charged, please keep your payment receipt and contact us.
        </p>
        {referenceLine}
        <Link href="/hotels" className="button button-blue">
          Search hotels
        </Link>
      </div>
    </section>
  );
}
