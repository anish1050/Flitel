"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  Plane,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { FlightLink } from "./flight-transition";
import { FlightItinerary } from "./flight-itinerary";
import {
  buildSearchQuery,
  findAirport,
  formatDuration,
  formatPrice,
  type FlightOffer,
  type FlightSearch,
} from "@/lib/flights";

export function AirlineMark({ offer }: { offer: FlightOffer }) {
  return (
    <span
      className={`airline-mark airline-${offer.airlineCode.toLowerCase()}`}
      aria-hidden="true"
    >
      {offer.airlineCode}
    </span>
  );
}

export function FlightTimeline({
  offer,
  search,
}: {
  offer: FlightOffer;
  search: FlightSearch;
}) {
  return (
    <div className="flight-timeline">
      <div>
        <strong>{offer.departure}</strong>
        <span>{search.from}</span>
      </div>
      <div className="flight-route">
        <span>{formatDuration(offer.durationMinutes)}</span>
        <div className="flight-route-line">
          <i />
          <Plane size={16} />
          <i />
        </div>
        <small>{offer.stops === 0 ? "Non-stop" : `${offer.stops} stop`}</small>
      </div>
      <div>
        <strong>
          {offer.arrival}
          {offer.arrivalDayOffset > 0 && <sup>+{offer.arrivalDayOffset}</sup>}
        </strong>
        <span>{search.to}</span>
      </div>
    </div>
  );
}

export function FlightResults({
  search,
  offers,
  isSupplierSearch,
}: {
  search: FlightSearch;
  offers: FlightOffer[];
  isSupplierSearch: boolean;
}) {
  const [sort, setSort] = useState("recommended");
  const [hasNonstopOnly, setHasNonstopOnly] = useState(false);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [hasFiltersOpen, setHasFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const filterToggle = useRef<HTMLButtonElement>(null);
  const firstFilter = useRef<HTMLInputElement>(null);
  const filtered = offers.filter(
    (offer) =>
      (!hasNonstopOnly || offer.stops === 0) &&
      (!selectedAirlines.length || selectedAirlines.includes(offer.airline)),
  );
  const hasSameCurrency =
    new Set(offers.map((offer) => offer.currency)).size <= 1;
  const visible = [...filtered].sort((first, second) =>
    sort === "cheapest" && hasSameCurrency
      ? first.price - second.price
      : sort === "fastest"
        ? (first.durationMinutes ?? Infinity) -
          (second.durationMinutes ?? Infinity)
        : 0,
  );
  const cheapest =
    offers.length && hasSameCurrency
      ? Math.min(...offers.map((offer) => offer.price))
      : null;
  const durations = offers.flatMap((offer) =>
    offer.durationMinutes === null ? [] : [offer.durationMinutes],
  );
  const fastest = durations.length ? Math.min(...durations) : null;
  const airlines = [
    ...new Map(offers.map((offer) => [offer.airline, offer])).values(),
  ];

  function clearFilters() {
    setHasNonstopOnly(false);
    setSelectedAirlines([]);
  }

  useEffect(() => {
    if (hasFiltersOpen) firstFilter.current?.focus();
  }, [hasFiltersOpen]);

  function closeFilters() {
    setHasFiltersOpen(false);
    filterToggle.current?.focus();
  }

  return (
    <div className="results-layout">
      <aside
        id="flight-filters"
        className={`filters ${hasFiltersOpen ? "filters-open" : ""}`}
        aria-label="Flight filters"
        onKeyDown={(event) => {
          if (event.key === "Escape" && hasFiltersOpen) closeFilters();
        }}
      >
        <div className="filters-heading">
          <h2>Filter flights</h2>
          <button className="text-button" onClick={clearFilters}>
            Reset
          </button>
          <button
            className="filter-close icon-button"
            onClick={closeFilters}
            aria-label="Close filters"
          >
            <X size={18} />
          </button>
        </div>
        <fieldset>
          <legend>Stops</legend>
          <label className="check-label">
            <input
              ref={firstFilter}
              type="checkbox"
              checked={hasNonstopOnly}
              onChange={(event) => setHasNonstopOnly(event.target.checked)}
            />{" "}
            Non-stop only
          </label>
        </fieldset>
        <fieldset>
          <legend>Airlines</legend>
          {airlines.map((offer) => (
            <label className="check-label" key={offer.id}>
              <input
                type="checkbox"
                checked={selectedAirlines.includes(offer.airline)}
                onChange={(event) =>
                  setSelectedAirlines(
                    event.target.checked
                      ? [...selectedAirlines, offer.airline]
                      : selectedAirlines.filter(
                          (airline) => airline !== offer.airline,
                        ),
                  )
                }
              />
              <span>{offer.airline}</span>
            </label>
          ))}
        </fieldset>
        <div className="filter-note">
          <Sparkles size={20} />
          <strong>A little preview of takeoff.</strong>
          <p>
            {isSupplierSearch
              ? "Duffel test flights let you explore the journey. No seats can be booked or paid for here."
              : "These are sample flights, so you can explore the experience before live fares arrive."}
          </p>
        </div>
      </aside>
      <section
        className="results-list"
        aria-label={
          isSupplierSearch ? "Duffel test flights" : "Available sample flights"
        }
      >
        <div className="results-topline">
          <p aria-live="polite">
            <strong>
              {visible.length} {visible.length === 1 ? "flight" : "flights"}
            </strong>{" "}
            for your next chapter
          </p>
          <button
            ref={filterToggle}
            className="mobile-filters button"
            aria-expanded={hasFiltersOpen}
            aria-controls="flight-filters"
            onClick={() =>
              hasFiltersOpen ? closeFilters() : setHasFiltersOpen(true)
            }
          >
            <SlidersHorizontal size={16} /> Filters <ChevronDown size={14} />
          </button>
          <span>
            {isSupplierSearch
              ? `Total for all ${search.travellers} ${search.travellers === 1 ? "adult" : "adults"} · taxes included`
              : "Prices in INR · per adult"}
          </span>
        </div>
        <div className="sort-tabs" aria-label="Sort flights">
          <button
            className={sort === "recommended" ? "active" : ""}
            aria-pressed={sort === "recommended"}
            onClick={() => setSort("recommended")}
          >
            <Sparkles size={17} />
            <span>
              Recommended<small>A comfortable balance</small>
            </span>
          </button>
          <button
            className={sort === "cheapest" ? "active" : ""}
            aria-pressed={sort === "cheapest"}
            disabled={!hasSameCurrency}
            onClick={() => setSort("cheapest")}
          >
            <span className="rupee-icon">↓</span>
            <span>
              Cheapest
              <small>
                {cheapest === null
                  ? hasSameCurrency
                    ? "No fares yet"
                    : "Currencies differ"
                  : `From ${formatPrice(cheapest, offers[0].currency)}`}
              </small>
            </span>
          </button>
          <button
            className={sort === "fastest" ? "active" : ""}
            aria-pressed={sort === "fastest"}
            onClick={() => setSort("fastest")}
          >
            <Clock3 size={17} />
            <span>
              Fastest
              <small>
                {fastest === null
                  ? "Duration unavailable"
                  : `From ${formatDuration(fastest)}`}
              </small>
            </span>
          </button>
        </div>
        {visible.length === 0 && (
          <div className="empty-state">
            <Plane size={34} />
            <h2>
              {offers.length
                ? "No flights match those filters"
                : "No flights returned for this search"}
            </h2>
            <p>
              {offers.length
                ? "Try another airline or include flights with a stop."
                : "Try different dates or airports in the search above."}
            </p>
            {offers.length > 0 && (
              <button className="button button-blue" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}
        {visible.slice(0, visibleCount).map((offer, index) => (
          <article className="flight-card" key={offer.id}>
            {index === 0 && sort === "recommended" && (
              <div className="recommended-label">
                <Sparkles size={12} /> A GREAT WAY TO GO
              </div>
            )}
            <div className="flight-card-main">
              <div className="airline-identity">
                <AirlineMark offer={offer} />
                <span>
                  <strong>{offer.airline}</strong>
                  <small>
                    {offer.slices
                      ? "Offer airline"
                      : `${offer.flightNumber} · ${search.cabin === "economy" ? "Economy" : "Business"}`}
                  </small>
                </span>
              </div>
              {offer.slices ? (
                <FlightItinerary slices={offer.slices} />
              ) : (
                <FlightTimeline offer={offer} search={search} />
              )}
              <div className="flight-price">
                <strong>{formatPrice(offer.price, offer.currency)}</strong>
                <small>
                  {offer.priceScope === "journey"
                    ? `total · ${offer.passengerIds?.length} ${offer.passengerIds?.length === 1 ? "adult" : "adults"}`
                    : `${search.trip === "round-trip" ? "round trip" : "one way"} / adult`}
                </small>
              </div>
            </div>
            <div className="flight-card-bottom">
              <span>
                <BriefcaseBusiness size={14} /> {offer.baggage}
              </span>
              <span
                className={offer.refundable ? "refundable" : "fare-condition"}
              >
                {offer.refundable && <Check size={14} />}
                {offer.refundable === null
                  ? "Refund terms not supplied"
                  : offer.refundable
                    ? "Refund allowed · fees may apply"
                    : "Non-refundable"}
              </span>
              <FlightLink
                className="button button-blue"
                href={`/flights/${offer.id}?${buildSearchQuery(search)}`}
              >
                View flight <ArrowRight size={15} />
              </FlightLink>
            </div>
          </article>
        ))}
        {visibleCount < visible.length && (
          <button
            className="button button-blue load-more-flights"
            onClick={() => setVisibleCount((count) => count + 20)}
          >
            Show more flights ({visible.length - visibleCount} remaining)
          </button>
        )}
        <p className="results-disclaimer">
          {isSupplierSearch
            ? "Duffel test inventory. Schedules and prices may be unrealistic. Prices cover the complete itinerary and all adults; optional extras are excluded. No payments or bookings."
            : `Illustrative fares and schedules for ${findAirport(search.from)?.city} to ${findAirport(search.to)?.city}. Availability is not connected to an airline.`}
        </p>
      </section>
    </div>
  );
}
