"use client";

import { Info, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { Field } from "@/components/booking-panels";
import { CardForm } from "@/components/hotel-card-form";
import { HotelRoomGone } from "@/components/hotel-room-gone";
import { browserStorage, fieldErrors } from "@/lib/booking";
import { formatPrice } from "@/lib/flights";
import {
  clearHotelAttempt,
  guestSchema,
  readPendingHotelAttempt,
  savePendingHotelAttempt,
  type GuestInput,
} from "@/lib/hotel-booking";
import { describePrebookChanges } from "@/lib/hotel-checkout";
import { prebookSchema, type Prebook } from "@/lib/hotels";

const retryMessage =
  "We couldn’t reserve this room right now. You have not been charged. Please try again.";
const cardFormMessage =
  "The card form couldn’t load. You have not been charged. Please try again.";
const storageBlockedMessage =
  "We can’t take payment in this browser (storage is blocked). Please use another browser.";
const prebookAnswerSchema = z.object({ data: prebookSchema });
const emptyGuest: GuestInput = { firstName: "", lastName: "", email: "", phone: "" };

type Step =
  | { name: "guest" }
  | { name: "terms"; prebook: Prebook; changes: string[] }
  | { name: "pay"; prebook: Prebook; attemptId: string };

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
  busy,
  onAccept,
  onEdit,
}: {
  prebook: Prebook;
  changes: string[];
  busy: boolean;
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
        <button type="button" className="button button-blue" disabled={busy} onClick={onAccept}>
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

  // The pending attempt is saved and read back before the card form mounts, so the redirect can never outrun it.
  function startPayment(prebook: Prebook) {
    const storage = browserStorage();
    const attemptId = crypto.randomUUID();
    savePendingHotelAttempt(storage, {
      attemptId,
      prebookId: prebook.prebookId,
      transactionId: prebook.transactionId,
      expectedTotal: prebook.price.amount,
      expectedCurrency: prebook.price.currency,
      holder: holder.current,
    });
    if (!readPendingHotelAttempt(storage, attemptId)) {
      clearHotelAttempt(storage, attemptId);
      setBusy(false);
      setProblem(storageBlockedMessage);
      setStep({ name: "guest" });
      return;
    }
    setBusy(false);
    setStep({ name: "pay", prebook, attemptId });
  }

  async function continueToPayment() {
    if (busy) return;
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
    if (!prebook) {
      setBusy(false);
      return;
    }
    holder.current = parsed.data;
    const changes = describePrebookChanges(prebook, summaryPrice);
    if (changes.length === 0) {
      startPayment(prebook);
      return;
    }
    setBusy(false);
    setStep({ name: "terms", prebook, changes });
  }

  // A mounted card form's attempt may already be paid, so only the return page clears it.
  // The next Continue creates a new prebook, attempt id and storage key.
  function backToGuest(message?: string) {
    holder.current = emptyGuest;
    setBusy(false);
    setProblem(message);
    setStep({ name: "guest" });
  }

  if (gone) return <HotelRoomGone hotelHref={hotelHref} />;

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
          busy={busy}
          onAccept={() => {
            if (busy) return;
            setBusy(true);
            startPayment(step.prebook);
          }}
          onEdit={() => backToGuest()}
        />
      )}
      {step.name === "pay" && (
        <>
          <CardForm
            prebook={step.prebook}
            attemptId={step.attemptId}
            onLoadFailed={() => {
              // The form never loaded, so nothing was charged and the attempt can go.
              clearHotelAttempt(browserStorage(), step.attemptId);
              backToGuest(cardFormMessage);
            }}
          />
          <button type="button" className="link-button" onClick={() => backToGuest()}>
            Edit details
          </button>
        </>
      )}
    </div>
  );
}
