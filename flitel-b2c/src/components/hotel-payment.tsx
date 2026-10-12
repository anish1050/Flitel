"use client";

import { Info, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Field } from "@/components/booking-panels";
import { browserStorage, fieldErrors } from "@/lib/booking";
import { formatPrice } from "@/lib/flights";
import {
  clearHotelAttempt,
  guestSchema,
  savePendingHotelAttempt,
  type GuestInput,
} from "@/lib/hotel-booking";
import { buildHotelReturnUrl, describePrebookChanges } from "@/lib/hotel-checkout";
import { prebookSchema, type Prebook } from "@/lib/hotels";

declare global {
  interface Window {
    LiteAPIPayment?: new (options: {
      publicKey: string;
      secretKey: string;
      returnUrl: string;
      targetElement: string;
      appearance: { theme: string };
      options: { business: { name: string } };
    }) => { handlePayment: () => unknown };
  }
}

const sdkUrl = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
const retryMessage =
  "We couldn’t reserve this room right now. You have not been charged. Please try again.";
const cardFormMessage =
  "The card form couldn’t load. You have not been charged. Please try again.";
const prebookAnswerSchema = z.object({ data: prebookSchema });
const emptyGuest: GuestInput = { firstName: "", lastName: "", email: "", phone: "" };

let sdkLoading: Promise<void> | undefined;

function loadPaymentSdk(): Promise<void> {
  if (window.LiteAPIPayment) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = sdkUrl;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      sdkLoading = undefined;
      reject(new Error(cardFormMessage));
    };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

type Step =
  | { name: "guest" }
  | { name: "terms"; prebook: Prebook; changes: string[] }
  | { name: "pay"; prebook: Prebook; attemptId: string };

function CardForm({
  prebook,
  attemptId,
  onFailed,
}: {
  prebook: Prebook;
  attemptId: string;
  onFailed: () => void;
}) {
  // Strict Mode runs effects twice; the card form must mount once per attempt.
  const mountedFor = useRef<string>(undefined);
  useEffect(() => {
    if (mountedFor.current === attemptId) return;
    mountedFor.current = attemptId;
    loadPaymentSdk()
      .then(() => {
        const payment = new window.LiteAPIPayment!({
          publicKey: "sandbox",
          secretKey: prebook.secretKey,
          returnUrl: buildHotelReturnUrl(window.location.origin, {
            attemptId,
            prebookId: prebook.prebookId,
            transactionId: prebook.transactionId,
          }),
          targetElement: "#hotel-payment",
          appearance: { theme: "flat" },
          options: { business: { name: "Flitel" } },
        });
        return payment.handlePayment();
      })
      .catch(onFailed);
  }, [attemptId, prebook, onFailed]);

  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>Pay by card</span>
        <span>Total {formatPrice(prebook.price.amount, prebook.price.currency)}</span>
      </div>
      <div className="itinerary-body">
        <p className="price-notice">
          Test mode: use card 4242 4242 4242 4242, any CVV, any future expiry.
        </p>
        <div id="hotel-payment" />
      </div>
    </section>
  );
}

function GuestForm({
  guest,
  errors,
  problem,
  busy,
  onChange,
  onSubmit,
}: {
  guest: GuestInput;
  errors: Record<string, string>;
  problem?: string;
  busy: boolean;
  onChange: (changes: Partial<GuestInput>) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      id="hotel-guest-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <section className="itinerary-panel booking-panel">
        <div className="panel-heading">
          <span>
            <UserRound size={18} /> Lead guest
          </span>
          <span>Booking updates go to this email</span>
        </div>
        <div className="booking-fields">
          <Field label="First name" error={errors.firstName}>
            <input value={guest.firstName} autoComplete="given-name" aria-invalid={Boolean(errors.firstName)} onChange={(event) => onChange({ firstName: event.target.value })} />
          </Field>
          <Field label="Last name" error={errors.lastName}>
            <input value={guest.lastName} autoComplete="family-name" aria-invalid={Boolean(errors.lastName)} onChange={(event) => onChange({ lastName: event.target.value })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <input type="email" value={guest.email} autoComplete="email" aria-invalid={Boolean(errors.email)} onChange={(event) => onChange({ email: event.target.value })} />
          </Field>
          <Field label="Phone with country code" error={errors.phone}>
            <input type="tel" value={guest.phone} autoComplete="tel" placeholder="+919876543210" aria-invalid={Boolean(errors.phone)} onChange={(event) => onChange({ phone: event.target.value })} />
          </Field>
        </div>
      </section>
      {problem && (
        <p className="booking-problem" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="button button-blue" disabled={busy}>
        {busy ? "Reserving the room…" : "Continue to payment"}
      </button>
    </form>
  );
}

function TermsNotice({
  prebook,
  changes,
  onAccept,
  onEdit,
}: {
  prebook: Prebook;
  changes: string[];
  onAccept: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>
          <Info size={18} /> Please check the updated terms
        </span>
      </div>
      <div className="itinerary-body">
        <ul className="price-notice" role="status">
          {changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
          <li>New total: {formatPrice(prebook.price.amount, prebook.price.currency)}</li>
        </ul>
        <button type="button" className="button button-blue" onClick={onAccept}>
          Accept and continue
        </button>
        <button type="button" className="link-button" onClick={onEdit}>
          Edit details
        </button>
      </div>
    </section>
  );
}

export function HotelPayment({
  offerId,
  hotelHref,
  summaryPrice,
}: {
  offerId: string;
  hotelHref: string;
  summaryPrice: { amount: number; currency: string };
}) {
  const [guest, setGuest] = useState(emptyGuest);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>({ name: "guest" });
  const [problem, setProblem] = useState<string>();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const holder = useRef(emptyGuest);

  async function requestPrebook(): Promise<Prebook | undefined> {
    const response = await fetch("/api/hotels/prebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId }),
      cache: "no-store",
    }).catch(() => undefined);
    const body: unknown = await response?.json().catch(() => null);
    if (response?.status === 404 || response?.status === 410) {
      setGone(true);
      return undefined;
    }
    const parsed = prebookAnswerSchema.safeParse(body);
    if (response?.status !== 200 || !parsed.success) {
      setProblem(retryMessage);
      return undefined;
    }
    return parsed.data.data;
  }

  // The pending attempt is saved before the card form mounts, so the redirect can never outrun it.
  function startPayment(prebook: Prebook) {
    const attemptId = crypto.randomUUID();
    savePendingHotelAttempt(browserStorage(), {
      attemptId,
      prebookId: prebook.prebookId,
      transactionId: prebook.transactionId,
      expectedTotal: prebook.price.amount,
      expectedCurrency: prebook.price.currency,
      holder: holder.current,
    });
    setStep({ name: "pay", prebook, attemptId });
  }

  async function continueToPayment() {
    const parsed = guestSchema.safeParse(guest);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('#hotel-guest-form [aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setErrors({});
    setProblem(undefined);
    setBusy(true);
    const prebook = await requestPrebook();
    setBusy(false);
    if (!prebook) return;
    holder.current = parsed.data;
    const changes = describePrebookChanges(prebook, summaryPrice);
    if (changes.length > 0) setStep({ name: "terms", prebook, changes });
    else startPayment(prebook);
  }

  // Leaving the card form drops its attempt; the next Continue creates a new prebook and attempt.
  function backToGuest(message?: string) {
    if (step.name === "pay") clearHotelAttempt(browserStorage(), step.attemptId);
    holder.current = emptyGuest;
    setProblem(message);
    setStep({ name: "guest" });
  }

  if (gone) {
    return (
      <section className="itinerary-panel booking-panel" role="alert">
        <div className="itinerary-body">
          <h2>This room is no longer available.</h2>
          <p>Choose another room to continue.</p>
          <Link href={hotelHref} className="button button-blue">
            Back to the hotel’s rooms
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div>
      {step.name === "guest" && (
        <GuestForm
          guest={guest}
          errors={errors}
          problem={problem}
          busy={busy}
          onChange={(changes) => setGuest((current) => ({ ...current, ...changes }))}
          onSubmit={() => void continueToPayment()}
        />
      )}
      {step.name === "terms" && (
        <TermsNotice
          prebook={step.prebook}
          changes={step.changes}
          onAccept={() => startPayment(step.prebook)}
          onEdit={() => backToGuest()}
        />
      )}
      {step.name === "pay" && (
        <>
          <CardForm
            prebook={step.prebook}
            attemptId={step.attemptId}
            onFailed={() => backToGuest(cardFormMessage)}
          />
          <button type="button" className="link-button" onClick={() => backToGuest()}>
            Edit details
          </button>
        </>
      )}
    </div>
  );
}
