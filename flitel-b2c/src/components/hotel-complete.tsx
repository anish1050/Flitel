"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { browserStorage } from "@/lib/booking";
import {
  classifyHotelBooking,
  clearHotelAttempt,
  markHotelAttemptChecking,
  readPendingHotelAttempt,
  type PendingHotelAttempt,
} from "@/lib/hotel-booking";
import { resolveReturnState } from "@/lib/hotel-checkout";

type View =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "confirming" }
  | { kind: "checking" }
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

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const storage = browserStorage();
    const state = resolveReturnState(
      { attempt, pid: search.get("pid"), tid: search.get("tid") },
      attempt ? readPendingHotelAttempt(storage, attempt) : undefined,
    );
    if (state.kind !== "ready") {
      setView({ kind: state.kind });
      return;
    }
    const { pending } = state;
    setView({ kind: "confirming" });
    // Guest details leave storage as the booking call starts, so a reload mid-call cannot resend them.
    markHotelAttemptChecking(storage, pending.attemptId);
    void sendBooking(pending).then((outcome) => {
      if (outcome.kind === "checking") {
        setView({ kind: "checking" });
        return;
      }
      clearHotelAttempt(storage, pending.attemptId);
      if (outcome.kind === "failed") {
        setView({ kind: "failed", message: outcome.message });
        return;
      }
      router.replace(
        `/hotel-bookings/${encodeURIComponent(outcome.bookingId)}?ref=${encodeURIComponent(pending.attemptId)}`,
      );
    });
  }, [attempt, router, search]);

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
  if (view.kind === "checking")
    return (
      <Panel title="We’re checking your booking">
        <p>
          The hotel took longer than usual to answer, so we can’t yet confirm whether your room was
          booked. Please don’t book or pay again.
        </p>
        {referenceLine}
      </Panel>
    );
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
