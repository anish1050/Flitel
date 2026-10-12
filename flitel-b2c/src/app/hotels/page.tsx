import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, Hotel, Info, Star } from "lucide-react";
import { HotelSearchForm } from "@/components/hotel-search-form";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { FlightLink } from "@/components/flight-transition";
import { hasFlightBackend } from "@/lib/flight-api";
import { formatCalendarDate, formatPrice } from "@/lib/flights";
import { searchHotels } from "@/lib/hotel-api";
import {
  buildStayQuery,
  defaultStay,
  findDestination,
  formatStayDates,
  nightsBetween,
  parseStayParams,
  type HotelSummary,
  type StayInput,
} from "@/lib/hotels";

export const metadata: Metadata = { title: "Find your hotel" };

type Params = Record<string, string | string[] | undefined>;

const stayKeys = ["destination", "checkin", "checkout", "adults"];

function HotelCard({ hotel, stay }: { hotel: HotelSummary; stay: StayInput }) {
  const nights = nightsBetween(stay.checkin, stay.checkout);
  return (
    <li className="hotel-card">
      <FlightLink
        href={`/hotels/${encodeURIComponent(hotel.id)}?${buildStayQuery(stay)}`}
        className="hotel-card-link"
      >
        <span className="hotel-card-photo">
          {hotel.photo ? (
            <img className="hotel-photo" src={hotel.photo} alt="" loading="lazy" />
          ) : (
            <span className="hotel-photo hotel-photo-empty" aria-hidden="true">
              <Hotel size={30} />
            </span>
          )}
          <span className="hotel-card-shade" />
          {Boolean(hotel.stars || hotel.rating) && (
            <span className="hotel-card-stars">
              <Star size={11} aria-hidden="true" />
              {[hotel.stars ? `${hotel.stars} star` : "", hotel.rating ? `${hotel.rating}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <strong className="hotel-card-name">{hotel.name}</strong>
        </span>
        <span className="hotel-card-body">
          {hotel.address && <small>{hotel.address}</small>}
          {hotel.refundable && <span className="hotel-tag">Free cancellation</span>}
          <span className="hotel-card-footer">
            <span className="hotel-price">
              from <strong>{formatPrice(hotel.price.amount, hotel.price.currency)}</strong> for{" "}
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
            <span className="hotel-card-view">
              View <ArrowRight size={14} aria-hidden="true" />
            </span>
          </span>
        </span>
      </FlightLink>
    </li>
  );
}

async function Results({ stay }: { stay: StayInput }) {
  let hotels: HotelSummary[];
  try {
    hotels = await searchHotels(stay);
  } catch (error) {
    return (
      <div className="booking-problem" role="alert">
        {error instanceof Error ? error.message : "Hotel search is unavailable right now."}
        <br />
        <FlightLink href={`/hotels?${buildStayQuery(stay)}`}>Try again</FlightLink>
      </div>
    );
  }
  if (hotels.length === 0)
    return (
      <div className="empty-state">
        <h2>No hotels found for these dates</h2>
        <p>Try different dates or another destination.</p>
      </div>
    );

  const nights = nightsBetween(stay.checkin, stay.checkout);
  const city = findDestination(stay.destination)?.label ?? "";
  return (
    <>
      <div className="hotel-results-head">
        <div>
          <span className="eyebrow">
            {city.toUpperCase()} · {formatStayDates(stay.checkin, stay.checkout).toUpperCase()} ·{" "}
            {nights} {nights === 1 ? "NIGHT" : "NIGHTS"}
          </span>
          <h2>
            {hotels.length} {hotels.length === 1 ? "hotel" : "hotels"} for your dates
          </h2>
        </div>
        <small>Cheapest first</small>
      </div>
      <ul className="hotel-grid" aria-label="Hotels">
        {hotels.map((hotel) => (
          <HotelCard key={hotel.id} hotel={hotel} stay={stay} />
        ))}
      </ul>
    </>
  );
}

export default async function HotelsPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!hasFlightBackend())
    return <HotelsUnavailable />;

  const params = await searchParams;
  const today = formatCalendarDate(new Date());
  const hasQuery = stayKeys.some((key) => params[key] !== undefined);
  let stay: StayInput | undefined;
  let problem = "";
  if (hasQuery) {
    try {
      stay = parseStayParams(params, today);
    } catch (error) {
      problem = error instanceof Error ? error.message : "Check the stay details and try again.";
    }
  }

  const shownStay = stay ?? defaultStay();
  const destination = findDestination(shownStay.destination);

  return (
    <main id="main">
      <section className="hero hero-stay" aria-labelledby="hotels-title">
        {destination && (
          <Image
            src={destination.heroImage}
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            className="hero-image"
          />
        )}
        <div className="hero-shade" />
        <span className="sample-badge hero-badge">
          <Info size={14} /> Test bookings in the LiteAPI sandbox
        </span>
        <div className="hero-content">
          <span className="eyebrow hero-eyebrow">
            <span /> STAY SOMEWHERE NEW
          </span>
          <h1 id="hotels-title">Stay in {destination?.label ?? "a new city"}.</h1>
          <p>Choose your dates and we’ll find the rooms. Real hotels, real prices.</p>
        </div>
      </section>

      <div className="home-search page-width">
        <div className="search-tab">
          <Hotel size={17} aria-hidden="true" /> Let’s find your stay
        </div>
        <HotelSearchForm stay={shownStay} today={today} />
      </div>

      <div className="hotel-results page-width">
        {problem && (
          <p className="booking-problem" role="alert">
            {problem}
          </p>
        )}
        {stay && <Results stay={stay} />}
      </div>
    </main>
  );
}
