import { Info, Mail, Plane, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { fareConditionText } from "@/components/flight-itinerary";
import type { FareCondition } from "@/lib/duffel-offers";
import type { BookingDetails, TravellerInput } from "@/lib/booking";

const titleLabels: Record<string, string> = { mr: "Mr", ms: "Ms", mrs: "Mrs", miss: "Miss" };

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="booking-field">
      <span className="field-label">{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function TravellerFields({
  traveller,
  index,
  errors,
  today,
  onChange,
}: {
  traveller: TravellerInput;
  index: number;
  errors: Record<string, string>;
  today: string;
  onChange: (changes: Partial<TravellerInput>) => void;
}) {
  const error = (field: string) => errors[`travellers.${index}.${field}`];
  const passport = traveller.passport;
  const updatePassport = (changes: Partial<NonNullable<TravellerInput["passport"]>>) =>
    onChange({ passport: { ...passport!, ...changes } });
  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>
          <Plane size={18} /> Traveller {index + 1} · Adult
        </span>
        <span>As shown on the passport</span>
      </div>
      <div className="booking-fields">
        <Field label="Title" error={error("title")}>
          <select value={traveller.title} aria-invalid={Boolean(error("title"))} onChange={(event) => onChange({ title: event.target.value })}>
            <option value="">Choose</option>
            {Object.entries(titleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Gender" error={error("gender")}>
          <select value={traveller.gender} aria-invalid={Boolean(error("gender"))} onChange={(event) => onChange({ gender: event.target.value })}>
            <option value="">Choose</option>
            <option value="f">Female</option>
            <option value="m">Male</option>
          </select>
        </Field>
        <Field label="First name" error={error("givenName")}>
          <input value={traveller.givenName} autoComplete={index === 0 ? "given-name" : "off"} aria-invalid={Boolean(error("givenName"))} onChange={(event) => onChange({ givenName: event.target.value })} />
        </Field>
        <Field label="Last name" error={error("familyName")}>
          <input value={traveller.familyName} autoComplete={index === 0 ? "family-name" : "off"} aria-invalid={Boolean(error("familyName"))} onChange={(event) => onChange({ familyName: event.target.value })} />
        </Field>
        <Field label="Date of birth" error={error("bornOn")}>
          <input type="date" max={today} value={traveller.bornOn} aria-invalid={Boolean(error("bornOn"))} onChange={(event) => onChange({ bornOn: event.target.value })} />
        </Field>
        {passport && (
          <>
            <Field label="Passport number" error={error("passport.number")}>
              <input value={passport.number} autoComplete="off" aria-invalid={Boolean(error("passport.number"))} onChange={(event) => updatePassport({ number: event.target.value.toUpperCase().replace(/\s/g, "") })} />
            </Field>
            <Field label="Issuing country (2 letters)" error={error("passport.issuingCountry")}>
              <input value={passport.issuingCountry} maxLength={2} aria-invalid={Boolean(error("passport.issuingCountry"))} onChange={(event) => updatePassport({ issuingCountry: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Passport expiry" error={error("passport.expiresOn")}>
              <input type="date" min={today} value={passport.expiresOn} aria-invalid={Boolean(error("passport.expiresOn"))} onChange={(event) => updatePassport({ expiresOn: event.target.value })} />
            </Field>
          </>
        )}
      </div>
    </section>
  );
}

export function ContactFields({
  contact,
  errors,
  onChange,
}: {
  contact: { email: string; phone: string };
  errors: Record<string, string>;
  onChange: (changes: Partial<{ email: string; phone: string }>) => void;
}) {
  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>
          <Mail size={18} /> Contact details
        </span>
        <span>For booking updates</span>
      </div>
      <div className="booking-fields">
        <Field label="Email" error={errors["contact.email"]}>
          <input type="email" autoComplete="email" value={contact.email} aria-invalid={Boolean(errors["contact.email"])} onChange={(event) => onChange({ email: event.target.value })} />
        </Field>
        <Field label="Phone with country code" error={errors["contact.phone"]}>
          <input type="tel" autoComplete="tel" placeholder="+919876543210" value={contact.phone} aria-invalid={Boolean(errors["contact.phone"])} onChange={(event) => onChange({ phone: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

export function ReviewPanels({
  details,
  refundCondition,
  changeCondition,
}: {
  details: BookingDetails;
  refundCondition: FareCondition;
  changeCondition: FareCondition;
}) {
  return (
    <>
      <section className="itinerary-panel booking-panel">
        <div className="panel-heading">
          <span>
            <Plane size={18} /> Travellers
          </span>
          <span>{details.travellers.length} {details.travellers.length === 1 ? "adult" : "adults"}</span>
        </div>
        <div className="review-list">
          {details.travellers.map((traveller) => (
            <div className="review-row" key={traveller.id}>
              <span>
                {titleLabels[traveller.title]} {traveller.givenName} {traveller.familyName}
              </span>
              <span>
                Born {traveller.bornOn}
                {traveller.passport && ` · Passport ending ${traveller.passport.number.slice(-3)}`}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="itinerary-panel booking-panel">
        <div className="panel-heading">
          <span>
            <Mail size={18} /> Booking updates go to
          </span>
          <span>{details.contact.email} · {details.contact.phone}</span>
        </div>
      </section>
      <section className="fare-panel">
        <h2>Fare rules</h2>
        <div>
          <ShieldCheck size={21} />
          <span>
            <strong>Refunds before departure</strong>
            <p>{fareConditionText(refundCondition, "Refund")}</p>
          </span>
        </div>
        <div>
          <ShieldCheck size={21} />
          <span>
            <strong>Changes before departure</strong>
            <p>{fareConditionText(changeCondition, "Change")}</p>
          </span>
        </div>
      </section>
    </>
  );
}

export function CheckingPanel({ reference }: { reference: string }) {
  return (
    <section className="itinerary-panel booking-panel" role="status">
      <div className="panel-heading">
        <span>
          <Info size={18} /> We’re checking your booking
        </span>
      </div>
      <div className="itinerary-body booking-checking">
        <p>
          The airline took longer than usual to answer, so we can’t yet confirm whether your seats
          were booked. Please don’t book this trip again. Quote reference{" "}
          <strong>{reference}</strong> if you contact us.
        </p>
      </div>
    </section>
  );
}
