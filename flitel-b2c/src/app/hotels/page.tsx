import type { Metadata } from "next";
import { Hotel, Info, Star } from "lucide-react";
import { HotelSearchForm } from "@/components/hotel-search-form";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { FlightLink } from "@/components/flight-transition";
import { hasFlightBackend } from "@/lib/flight-api";
import { formatCalendarDate, formatPrice } from "@/lib/flights";
import { searchHotels } from "@/lib/hotel-api";
import {
  buildStayQuery,
  defaultStay,
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
        {hotel.photo ? (
          <img className="hotel-photo" src={hotel.photo} alt="" loading="lazy" />
        ) : (
          <span className="hotel-photo hotel-photo-empty" aria-hidden="true">
            <Hotel size={30} />
          </span>
        )}
        <span className="hotel-card-body">
          <strong>{hotel.name}</strong>
          <span className="hotel-meta">
            {hotel.stars !== undefined && (
              <span>
                <Star size={13} aria-hidden="true" /> {hotel.stars} star
              </span>
            )}
            {hotel.rating !== undefined && <span>Rated {hotel.rating}</span>}
          </span>
          {hotel.address && <small>{hotel.address}</small>}
          {hotel.refundable && <span className="hotel-tag">Free cancellation</span>}
          <span className="hotel-price">
            from <strong>{formatPrice(hotel.price.amount, hotel.price.currency)}</strong> for{" "}
            {nights} {nights === 1 ? "night" : "nights"}
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
  return (
    <ul className="hotel-grid" aria-label="Hotels">
      {hotels.map((hotel) => (
        <HotelCard key={hotel.id} hotel={hotel} stay={stay} />
      ))}
    </ul>
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

  return (
    <main id="main" className="details-page page-width">
      <div className="details-title">
        <div>
          <span className="eyebrow">STAY SOMEWHERE NEW</span>
          <h1>Find your hotel.</h1>
          <p>Choose a destination and your dates.</p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test bookings in the LiteAPI sandbox
        </span>
      </div>
      <HotelSearchForm stay={stay ?? defaultStay()} today={today} />
      {problem && (
        <p className="booking-problem" role="alert">
          {problem}
        </p>
      )}
      {stay && <Results stay={stay} />}
    </main>
  );
}
