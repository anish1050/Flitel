import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Info,
  Plane,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import { notFound } from "next/navigation";
import { FlightLink } from "@/components/flight-transition";
import { AirlineMark, FlightTimeline } from "@/components/flight-results";
import {
  FlightItinerary,
  fareConditionText,
} from "@/components/flight-itinerary";
import { fetchFlightOffer } from "@/lib/flight-api";
import {
  buildSearchQuery,
  findAirport,
  formatPrice,
  parseSearchParams,
} from "@/lib/flights";

export const metadata: Metadata = { title: "Your flight details" };

export default async function FlightDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let search;
  try {
    search = parseSearchParams(await searchParams);
  } catch {
    return (
      <main id="main" className="empty-state page-width">
        <h1>This search needs an update.</h1>
        <p>Choose your route and travel dates again.</p>
        <FlightLink href="/" className="button button-blue">
          Start a new search
        </FlightLink>
      </main>
    );
  }
  const { id } = await params;
  let offer;
  try {
    offer = await fetchFlightOffer(id, search);
  } catch (error) {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>Let’s find an updated fare.</h1>
        <p>
          {error instanceof Error
            ? error.message
            : "This flight is unavailable. Please search again."}
        </p>
        <FlightLink
          href={`/flights?${buildSearchQuery(search)}`}
          className="button button-blue"
        >
          Search flights again
        </FlightLink>
      </main>
    );
  }
  if (!offer) notFound();
  const outbound = offer.slices?.[0];
  const originCode = outbound?.segments[0].origin.iata_code ?? search.from;
  const destinationCode =
    outbound?.segments.at(-1)!.destination.iata_code ?? search.to;
  const origin = findAirport(originCode) ?? {
    code: originCode,
    city: originCode,
    name: outbound!.segments[0].origin.name,
  };
  const destination = findAirport(destinationCode) ?? {
    code: destinationCode,
    city: destinationCode,
    name: outbound!.segments.at(-1)!.destination.name,
  };
  const passengerCount = offer.passengerIds?.length ?? search.travellers;
  const isRoundTrip = offer.slices
    ? offer.slices.length > 1
    : search.trip === "round-trip";
  const query = buildSearchQuery(search);
  const date = new Date(`${search.depart}T12:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "short", day: "numeric", month: "long", year: "numeric" },
  );
  return (
    <main id="main" className="details-page page-width">
      <FlightLink href={`/flights?${query}`} className="back-link">
        <ArrowLeft size={15} /> Back to flights
      </FlightLink>
      <div className="details-title">
        <div>
          <span className="eyebrow">LOOK FORWARD TO THE JOURNEY</span>
          <h1>Your flight, in a little more detail.</h1>
          <p>
            {origin.city} to {destination.city} ·{" "}
            {isRoundTrip ? "Round trip" : "One way"}
          </p>
        </div>
        <span className="sample-badge">
          <Info size={14} />{" "}
          {offer.slices ? "Test itinerary" : "Sample itinerary"}
        </span>
      </div>
      <div className="details-layout">
        <div>
          {offer.slices ? (
            <section className="itinerary-panel">
              <div className="panel-heading">
                <span>
                  <Plane size={18} /> Your complete itinerary
                </span>
              </div>
              <div className="itinerary-body">
                <FlightItinerary
                  slices={offer.slices}
                  passengerIds={offer.passengerIds}
                  detailed
                />
              </div>
            </section>
          ) : (
            <section className="itinerary-panel">
              <div className="panel-heading">
                <span>
                  <Plane size={18} /> Outbound flight
                </span>
                <span>
                  <CalendarDays size={15} /> {date}
                </span>
              </div>
              <div className="itinerary-body">
                <div className="airline-identity">
                  <AirlineMark offer={offer} />
                  <span>
                    <strong>{offer.airline}</strong>
                    <small>
                      {offer.flightNumber} ·{" "}
                      {search.cabin === "economy" ? "Economy" : "Business"}
                    </small>
                  </span>
                </div>
                <FlightTimeline offer={offer} search={search} />
                <div className="airport-names">
                  <span>{origin.name}</span>
                  <span>{destination.name}</span>
                </div>
                <div className="itinerary-perks">
                  <span>
                    <BriefcaseBusiness size={17} /> {offer.baggage}
                  </span>
                  <span>
                    <Utensils size={17} /> Check meal options with airline
                  </span>
                </div>
              </div>
            </section>
          )}
          {!offer.slices && search.trip === "round-trip" && (
            <section className="return-panel">
              <Plane size={21} />
              <div>
                <h2>Return journey included in this sample fare</h2>
                <p>
                  {destination.city} <ArrowRight size={14} /> {origin.city} ·{" "}
                  {new Date(`${search.returnDate}T12:00:00`).toLocaleDateString(
                    "en-GB",
                    { day: "numeric", month: "long" },
                  )}
                </p>
                <small>
                  Return-flight times will be selected when live inventory is
                  connected.
                </small>
              </div>
            </section>
          )}
          <section className="fare-panel">
            <h2>A few things to know</h2>
            <div>
              <ShieldCheck size={21} />
              <span>
                <strong>
                  {offer.slices
                    ? "Refunds before departure"
                    : offer.refundable
                      ? "Refundable sample fare"
                      : "Non-refundable sample fare"}
                </strong>
                <p>
                  {offer.slices
                    ? fareConditionText(offer.refundCondition, "Refund")
                    : offer.refundable
                      ? "This example includes a refundable fare. Actual fees and deadlines will come from the airline."
                      : "This example fare does not include a refund. Always review the airline’s final conditions before booking."}
                </p>
              </span>
            </div>
            <div>
              <BriefcaseBusiness size={21} />
              <span>
                <strong>Your baggage allowance</strong>
                <p>
                  {offer.slices
                    ? "Check each flight and traveller above. An unspecified allowance does not mean a bag is included; weight and size rules must be checked with the airline."
                    : `${offer.baggage}. Final cabin and checked-bag limits will be verified with the supplier.`}
                </p>
              </span>
            </div>
            <div>
              <Check size={21} />
              <span>
                <strong>
                  {offer.slices
                    ? "Changes before departure"
                    : "Details before decisions"}
                </strong>
                <p>
                  {offer.slices
                    ? fareConditionText(offer.changeCondition, "Change")
                    : "A live search will recheck availability and the final total before you make a payment."}
                </p>
              </span>
            </div>
          </section>
        </div>
        <aside className="price-panel">
          <span className="eyebrow">YOUR JOURNEY AT A GLANCE</span>
          <h2>
            {origin.code} <ArrowRight size={21} /> {destination.code}
          </h2>
          <p>
            {isRoundTrip ? "Round trip" : "One way"} · {passengerCount}{" "}
            {passengerCount === 1 ? "adult" : "adults"}
          </p>
          <div className="price-line">
            <span>
              {offer.priceScope === "journey"
                ? "Fare including taxes"
                : "Sample fare per adult"}
            </span>
            <strong>{formatPrice(offer.price, offer.currency)}</strong>
          </div>
          <div className="price-line">
            <span>
              Adults {offer.priceScope === "journey" ? "included" : ""}
            </span>
            <strong>
              {offer.priceScope === "adult" ? "× " : ""}
              {passengerCount}
            </strong>
          </div>
          <div className="price-total">
            <span>
              {offer.priceScope === "journey"
                ? "Test journey total"
                : "Example total"}
            </span>
            <strong>
              {formatPrice(
                offer.priceScope === "journey"
                  ? offer.price
                  : offer.price * search.travellers,
                offer.currency,
              )}
            </strong>
          </div>
          {offer.expiresAt && (
            <p className="offer-expiry">
              Offer expires{" "}
              {new Date(offer.expiresAt).toLocaleString("en-GB", {
                timeZone: "UTC",
              })}{" "}
              UTC. Prices may change; optional extras are excluded.
            </p>
          )}
          {offer.slices ? (
            <FlightLink
              className="button button-blue full-width"
              href={`/flights/${encodeURIComponent(offer.id)}/book?${query}`}
            >
              Book this flight
            </FlightLink>
          ) : (
            <div className="booking-preview-note">
              <Info size={18} />
              <p>This is a preview. No seats are reserved and no payment will be taken.</p>
            </div>
          )}
          <FlightLink
            className={offer.slices ? "change-search" : "button button-blue full-width"}
            href={`/flights?${query}`}
          >
            Compare other flights
          </FlightLink>
          <FlightLink className="change-search" href="/">
            Plan a different journey
          </FlightLink>
        </aside>
      </div>
    </main>
  );
}
