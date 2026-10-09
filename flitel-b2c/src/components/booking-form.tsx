"use client";

import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import {
  CheckingPanel,
  ContactFields,
  ReviewPanels,
  TravellerFields,
} from "@/components/booking-panels";
import {
  createBookingInput,
  createBookingSchema,
  fieldErrors,
  type BookingDetails,
  type BookingInput,
} from "@/lib/booking";
import type { FareCondition } from "@/lib/duffel-offers";
import { formatPrice } from "@/lib/flights";

export type BookableOffer = {
  id: string;
  totalAmount: string;
  currency: string;
  passengerIds: string[];
  identityDocumentsRequired: boolean;
  refundCondition: FareCondition;
  changeCondition: FareCondition;
};

const latestPriceSchema = z.object({
  data: z.object({ totalAmount: z.string(), currency: z.string() }),
});
const bookingAnswerSchema = z.object({
  data: z.object({ orderId: z.string() }).optional(),
  error: z.object({ message: z.string() }).optional(),
});

export function BookingForm({
  offer,
  route,
  tripLabel,
  searchHref,
}: {
  offer: BookableOffer;
  route: { from: string; to: string };
  tripLabel: string;
  searchHref: string;
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("en-CA");
  const schema = createBookingSchema(offer.identityDocumentsRequired, today);
  const [input, setInput] = useState<BookingInput>(() =>
    createBookingInput(offer.passengerIds, offer.identityDocumentsRequired),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"edit" | "review" | "checking">("edit");
  const [details, setDetails] = useState<BookingDetails>();
  const [total, setTotal] = useState({ amount: offer.totalAmount, currency: offer.currency });
  const [priceNotice, setPriceNotice] = useState<string>();
  const [problem, setProblem] = useState<{ message: string; searchAgain: boolean }>();
  const [busy, setBusy] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const travellerCount = offer.passengerIds.length;

  function updateTraveller(index: number, changes: Partial<BookingInput["travellers"][number]>) {
    setInput((current) => ({
      ...current,
      travellers: current.travellers.map((traveller, position) =>
        position === index ? { ...traveller, ...changes } : traveller,
      ),
    }));
  }

  async function recheckPrice(): Promise<boolean> {
    const response = await fetch(`/api/flights/offers/${encodeURIComponent(offer.id)}`, {
      cache: "no-store",
    }).catch(() => undefined);
    const body: unknown = await response?.json().catch(() => null);
    const latest = latestPriceSchema.safeParse(body);
    if (!response?.ok || !latest.success) {
      const message = bookingAnswerSchema.safeParse(body).data?.error?.message;
      setProblem({
        message: message ?? "We couldn’t confirm the latest fare. Please try again.",
        searchAgain: true,
      });
      return false;
    }
    const { totalAmount, currency } = latest.data.data;
    if (totalAmount !== total.amount || currency !== total.currency) {
      setPriceNotice(
        `The fare changed from ${formatPrice(Number(total.amount), total.currency)} to ${formatPrice(Number(totalAmount), currency)}. Please check the new total.`,
      );
      setTotal({ amount: totalAmount, currency });
    }
    return true;
  }

  async function review() {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setProblem(undefined);
    setBusy(true);
    const priceKnown = await recheckPrice();
    setBusy(false);
    if (!priceKnown) return;
    setDetails(parsed.data);
    setAttemptId(crypto.randomUUID());
    setAcceptedRules(false);
    setStep("review");
  }

  async function confirm() {
    if (!details || busy) return;
    setBusy(true);
    setProblem(undefined);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        offerId: offer.id,
        expectedTotal: total.amount,
        expectedCurrency: total.currency,
        ...details,
      }),
    }).catch(() => undefined);
    const answer = bookingAnswerSchema.safeParse(await response?.json().catch(() => null));
    const orderId = answer.data?.data?.orderId;
    if (response?.status === 200 && orderId) {
      // Replace, so browser Back cannot return to a filled form and book the same trip twice.
      router.replace(`/bookings/${encodeURIComponent(orderId)}`);
      return;
    }
    // No answer, 202, or an unreadable 200: seats may be booked, so never offer a retry.
    if (!response || response.status === 202 || response.ok) {
      setStep("checking");
      return;
    }
    setBusy(false);
    setAttemptId(crypto.randomUUID());
    if (response.status === 409) {
      setAcceptedRules(false);
      await recheckPrice();
      return;
    }
    setProblem({
      message:
        answer.data?.error?.message ??
        "This booking could not be completed and nothing was booked. Please try again.",
      searchAgain: response.status === 410,
    });
  }

  return (
    <div className="details-layout">
      <div>
        {step === "edit" && (
          <form
            id="booking-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void review();
            }}
          >
            {input.travellers.map((traveller, index) => (
              <TravellerFields
                key={traveller.id}
                traveller={traveller}
                index={index}
                errors={errors}
                today={today}
                onChange={(changes) => updateTraveller(index, changes)}
              />
            ))}
            <ContactFields
              contact={input.contact}
              errors={errors}
              onChange={(changes) =>
                setInput((current) => ({ ...current, contact: { ...current.contact, ...changes } }))
              }
            />
          </form>
        )}
        {step === "review" && details && (
          <ReviewPanels
            details={details}
            refundCondition={offer.refundCondition}
            changeCondition={offer.changeCondition}
          />
        )}
        {step === "checking" && <CheckingPanel reference={attemptId.slice(0, 8).toUpperCase()} />}
      </div>
      <aside className="price-panel">
        <span className="eyebrow">YOUR JOURNEY AT A GLANCE</span>
        <h2>
          {route.from} <ArrowRight size={21} /> {route.to}
        </h2>
        <p>
          {tripLabel} · {travellerCount} {travellerCount === 1 ? "adult" : "adults"}
        </p>
        <div className="price-line">
          <span>Fare including taxes</span>
          <strong>{formatPrice(Number(total.amount), total.currency)}</strong>
        </div>
        <div className="price-total">
          <span>Journey total</span>
          <strong>{formatPrice(Number(total.amount), total.currency)}</strong>
        </div>
        {priceNotice && (
          <p className="price-notice" role="status">
            {priceNotice}
          </p>
        )}
        <div className="booking-preview-note">
          <Info size={18} />
          <p>Test booking. No real ticket is issued and no payment is taken.</p>
        </div>
        {problem && (
          <div className="booking-problem" role="alert">
            <p>{problem.message}</p>
            {problem.searchAgain && <Link href={searchHref}>Search flights again</Link>}
          </div>
        )}
        {step === "edit" && (
          <button type="submit" form="booking-form" className="button button-blue full-width" disabled={busy}>
            {busy ? "Checking the fare…" : "Review and confirm"}
          </button>
        )}
        {step === "review" && (
          <>
            <label className="fare-rules-check">
              <input
                type="checkbox"
                checked={acceptedRules}
                disabled={busy}
                onChange={(event) => setAcceptedRules(event.target.checked)}
              />
              I have read the fare rules and checked the traveller details.
            </label>
            <button
              type="button"
              className="button button-blue full-width"
              disabled={!acceptedRules || busy}
              onClick={() => void confirm()}
            >
              {busy ? "Booking…" : "Confirm booking"}
            </button>
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => {
                setStep("edit");
                setPriceNotice(undefined);
              }}
            >
              Edit details
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
