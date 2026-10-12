import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ArrowRight, ArrowUpRight, Headphones, Hotel, Info, Star } from "lucide-react";
import { HotelSearchForm } from "@/components/hotel-search-form";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { RemotePhoto } from "@/components/remote-photo";
import { WarmOnIntent } from "@/components/warm-on-intent";
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

// Destinations are looked up in the shared table, so a card can never point at a place the search does not know.
const showcase = [
  { id: "goa", country: "India", tagline: "Wake up to the waves" },
  { id: "dubai", country: "United Arab Emirates", tagline: "Rooms with a skyline" },
  { id: "singapore", country: "Singapore", tagline: "Stay in the middle of it" },
  { id: "paris", country: "France", tagline: "Where the city sleeps late" },
] as const;

function DestinationShowcase({ stay }: { stay: StayInput }) {
  return (
    <section id="destinations" className="destinations page-width">
      <div className="section-heading">
        <div>
          <span className="eyebrow">A CHANGE OF SCENERY</span>
          <h2>Where will you stay next?</h2>
          <p>A few places worth booking the room for.</p>
        </div>
        <span className="section-caption">
          Pick a place. We’ll find the room. <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="destination-grid">
        {showcase.map((place) => {
          const destination = findDestination(place.id);
          if (!destination) return null;
          return (
            <FlightLink
              className="destination-card"
              key={place.id}
              href={`/hotels?${buildStayQuery({ ...stay, destination: place.id })}`}
            >
              <Image
                src={destination.heroImage}
                alt={`${destination.label}, ${place.country}`}
                fill
                sizes="(max-width: 600px) 80vw, (max-width: 900px) 45vw, 25vw"
              />
              <span className="destination-code">{destination.countryCode}</span>
              <div className="destination-copy">
                <span>{place.country}</span>
                <h3>{destination.label}</h3>
                <p>{place.tagline}</p>
              </div>
              <span className="destination-arrow">
                <ArrowUpRight size={20} />
              </span>
            </FlightLink>
          );
        })}
      </div>
    </section>
  );
}

function HotelCard({ hotel, stay }: { hotel: HotelSummary; stay: StayInput }) {
  const nights = nightsBetween(stay.checkin, stay.checkout);
  return (
    <WarmOnIntent
      className="hotel-card"
      url={`/api/warm/hotel?hotelId=${encodeURIComponent(hotel.id)}&${buildStayQuery(stay)}`}
    >
      <FlightLink
        href={`/hotels/${encodeURIComponent(hotel.id)}?${buildStayQuery(stay)}`}
        className="hotel-card-link"
      >
        <span className="hotel-card-photo">
          {hotel.photo ? (
            <RemotePhoto
              className="hotel-photo"
              src={hotel.photo}
              sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 380px"
            />
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
    </WarmOnIntent>
  );
}

// Same footprint as the real grid, so nothing jumps when the hotels arrive.
function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Finding hotels">
      <div className="hotel-results-head">
        <div>
          <span className="eyebrow">FINDING HOTELS FOR YOUR DATES</span>
          <h2>Checking rooms and prices…</h2>
        </div>
      </div>
      <ul className="hotel-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <li className="hotel-card hotel-card-skeleton" key={index}>
            <span className="skeleton-photo" />
            <span className="skeleton-line" />
            <span className="skeleton-line short" />
          </li>
        ))}
      </ul>
    </div>
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
        {stay && (
          <Suspense key={buildStayQuery(stay)} fallback={<ResultsSkeleton />}>
            <Results stay={stay} />
          </Suspense>
        )}
      </div>

      <DestinationShowcase stay={shownStay} />

      <section className="journey-banner page-width">
        <div>
          <span className="eyebrow">STAY A LITTLE LONGER.</span>
          <h2>
            The best part of a trip?
            <br />
            Somewhere good to land.
          </h2>
          <p>Find a room that fits the way you want to rest.</p>
          <FlightLink className="button button-dark" href="#main">
            Find your stay <Hotel size={17} />
          </FlightLink>
        </div>
        <div className="banner-art banner-art-photo" aria-hidden="true">
          <Image src="/images/santorini-hero.png" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" />
        </div>
      </section>
      <div className="closing-line page-width">
        <Headphones size={18} />
        <span>Built around the journey, from the first search to the final check-out.</span>
      </div>
    </main>
  );
}
