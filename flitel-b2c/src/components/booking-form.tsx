"use client";

import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  CheckingPanel,
  ContactFields,
  ReviewPanels,
  TravellerFields,
} from "@/components/booking-panels";
import {
  bookableOfferSchema,
  createBookingInput,
  createBookingSchema,
  fieldErrors,
  browserStorage,
  clearPendingAttempt,
  isNothingBooked,
  readPendingAttempt,
  remapTravellers,
  savePendingAttempt,
  type BookableOffer,
  type BookingDetails,
  type BookingInput,
} from "@/lib/booking";
import { formatPrice, type FlightSearch } from "@/lib/flights";

const latestPriceSchema = z.object({
  data: z.object({ totalAmount: z.string(), currency: z.string() }),
});
const flightGone = "This flight is no longer available. Please search again.";
const refreshedOfferSchema = z.object({ data: bookableOfferSchema });
const emptyPassport = { number: "", issuingCountry: "", expiresOn: "" };
const bookingAnswerSchema = z.object({
  data: z.object({ orderId: z.string() }).optional(),
  error: z.object({ code: z.string().optional(), message: z.string() }).optional(),
});

export function BookingForm({
  offer: initialOffer,
  search,
  initialNotice,
  route,
  tripLabel,
  searchHref,
}: {
  offer: BookableOffer;
  search: FlightSearch;
  initialNotice?: string;
  route: { from: string; to: string };
  tripLabel: string;
  searchHref: string;
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("en-CA");
  const [offer, setOffer] = useState(initialOffer);
  const schema = createBookingSchema(offer.identityDocumentsRequired, today);
  const [input, setInput] = useState<BookingInput>(() =>
    createBookingInput(offer.passengerIds, offer.identityDocumentsRequired),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Server render has no sessionStorage, so a reload mid-booking starts in "checking" only after hydration.
  const [step, setStep] = useState<"edit" | "review" | "checking">("edit");
  const [details, setDetails] = useState<BookingDetails>();
  const [total, setTotal] = useState({ amount: offer.totalAmount, currency: offer.currency });
  const [priceNotice, setPriceNotice] = useState(initialNotice);
  const [problem, setProblem] = useState<{ message: string; searchAgain: boolean }>();
  const [busy, setBusy] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const submitting = useRef(false);
  // True once a Confirm has swapped in a fresh fare, so a second rejection is final.
  const confirmRefreshedFare = useRef(false);
  const rulesCheckbox = useRef<HTMLInputElement>(null);
  const travellerCount = offer.passengerIds.length;

  useEffect(() => {
    const pending = readPendingAttempt(browserStorage(), offer.id);
    if (!pending) return;
    setAttemptId(pending);
    setStep("checking");
  }, [offer.id]);

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

  /** Swaps in the same flight's current offer. Returns it when the form can go on with it. */
  async function refreshFare(): Promise<BookableOffer | undefined> {
    const response = await fetch(`/api/flights/offers/${encodeURIComponent(offer.id)}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(search),
      cache: "no-store",
    }).catch(() => undefined);
    const next = refreshedOfferSchema.safeParse(await response?.json().catch(() => null)).data?.data;
    const travellers = next && remapTravellers(input.travellers, next.passengerIds);
    const reviewed = next && details && remapTravellers(details.travellers, next.passengerIds);
    if (!next || !travellers || (details && !reviewed)) {
      setProblem({ message: flightGone, searchAgain: true });
      return undefined;
    }
    clearPendingAttempt(browserStorage(), offer.id);
    const needsPassports = next.identityDocumentsRequired && !offer.identityDocumentsRequired;
    setOffer(next);
    setTotal({ amount: next.totalAmount, currency: next.currency });
    setInput({
      ...input,
      travellers: needsPassports
        ? travellers.map((traveller) => ({ ...traveller, passport: emptyPassport }))
        : travellers,
    });
    if (details && reviewed) setDetails({ ...details, travellers: reviewed });
    setAcceptedRules(false);
    setAttemptId(crypto.randomUUID());
    setProblem(undefined);
    setPriceNotice(refreshNotice(total, next, needsPassports));
    if (needsPassports) setStep("edit");
    return needsPassports ? undefined : next;
  }

  async function review() {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('#booking-form [aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setErrors({});
    setProblem(undefined);
    setBusy(true);
    confirmRefreshedFare.current = false;
    const current = (await recheckPrice()) ? offer : await refreshFare();
    setBusy(false);
    if (!current) return;
    const travellers = remapTravellers(parsed.data.travellers, current.passengerIds);
    setDetails({ ...parsed.data, travellers: travellers ?? parsed.data.travellers });
    setAttemptId(crypto.randomUUID());
    setAcceptedRules(false);
    setStep("review");
    requestAnimationFrame(() => rulesCheckbox.current?.focus());
  }

  async function confirm() {
    if (!details || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setProblem(undefined);
    savePendingAttempt(browserStorage(), offer.id, attemptId);
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
    // Only a code proving no order exists allows a retry; anything else may hide a created order.
    const errorCode = answer.data?.error?.code;
    if (!response || !isNothingBooked(errorCode)) {
      setStep("checking");
      return;
    }
    clearPendingAttempt(browserStorage(), offer.id);
    const refreshing = errorCode === "OFFER_UNAVAILABLE" && !confirmRefreshedFare.current;
    if (refreshing) {
      confirmRefreshedFare.current = true;
      await refreshFare();
    }
    submitting.current = false;
    setBusy(false);
    setAttemptId(crypto.randomUUID());
    if (refreshing) return;
    if (errorCode === "PRICE_CHANGED") {
      setAcceptedRules(false);
      await recheckPrice();
      return;
    }
    const unavailable = errorCode === "OFFER_UNAVAILABLE";
    setProblem({
      message: unavailable
        ? flightGone
        : (answer.data?.error?.message ??
          "This booking could not be completed and nothing was booked. Please try again."),
      searchAgain: unavailable,
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
                ref={rulesCheckbox}
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

function refreshNotice(
  old: { amount: string; currency: string },
  next: BookableOffer,
  needsPassports: boolean,
): string {
  const samePrice = old.amount === next.totalAmount && old.currency === next.currency;
  const price = (amount: string, currency: string) => formatPrice(Number(amount), currency);
  const change = samePrice
    ? "This fare was refreshed at the same price."
    : `This fare was refreshed: ${price(old.amount, old.currency)} → ${price(next.totalAmount, next.currency)}. Please check the new total.`;
  return needsPassports ? `${change} Passport details are now required for this fare.` : change;
}
