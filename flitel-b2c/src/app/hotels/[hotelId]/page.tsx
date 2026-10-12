import type { Metadata } from "next";
import { ArrowLeft, Info, Star } from "lucide-react";
import { redirect } from "next/navigation";
import { FlightLink } from "@/components/flight-transition";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { hasFlightBackend } from "@/lib/flight-api";
import { formatCalendarDate, formatPrice } from "@/lib/flights";
import { fetchHotelRooms } from "@/lib/hotel-api";
import {
  buildStayQuery,
  nightsBetween,
  parseStayParams,
  type Room,
  type StayInput,
} from "@/lib/hotels";

export const metadata: Metadata = { title: "Your hotel" };

const maxImages = 8;

// UTC keeps the day and time independent of the server's timezone.
function formatCancelTime(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const text = date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return `${text} UTC`;
}

function RoomRow({
  room,
  nights,
  reserveHref,
}: {
  room: Room;
  nights: number;
  reserveHref: string;
}) {
  const cancelTime = room.cancelBefore ? formatCancelTime(room.cancelBefore) : undefined;
  const cancellationLabel = !room.refundable
    ? "Non-refundable"
    : cancelTime
      ? `Free cancellation until ${cancelTime}`
      : "Free cancellation";
  const nightsLabel = `${nights} ${nights === 1 ? "night" : "nights"}`;
  return (
    <li className="room-row">
      <div>
        <h3>{room.name}</h3>
        {room.boardName && <p>{room.boardName}</p>}
        <p className={room.refundable ? "room-refundable" : undefined}>
          {cancellationLabel}
        </p>
        {room.taxesNotIncluded.length > 0 && (
          <small>
            Taxes and fees not included:{" "}
            {room.taxesNotIncluded
              .map((tax) => `${tax.description} ${formatPrice(tax.amount, tax.currency)}`)
              .join(", ")}
          </small>
        )}
      </div>
      <div className="room-price">
        <strong>{formatPrice(room.price.amount, room.price.currency)}</strong>
        <span>for {nightsLabel}</span>
        <small>
          about {formatPrice(Math.round(room.price.amount / nights), room.price.currency)} per night
        </small>
        <FlightLink href={reserveHref} className="button button-blue">
          Reserve
        </FlightLink>
      </div>
    </li>
  );
}

export default async function HotelDetails({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!hasFlightBackend())
    return <HotelsUnavailable />;

  let stay: StayInput;
  try {
    stay = parseStayParams(await searchParams, formatCalendarDate(new Date()));
  } catch {
    redirect("/hotels");
  }
  const { hotelId } = await params;
  const query = buildStayQuery(stay);
  const backHref = `/hotels?${query}`;

  let detail;
  try {
    detail = await fetchHotelRooms(hotelId, stay);
  } catch (error) {
    return (
      <main id="main" className="empty-state page-width">
        <h1>This hotel isn’t available right now.</h1>
        <p role="alert">{error instanceof Error ? error.message : "Please search again."}</p>
        <FlightLink href={backHref} className="button button-blue">
          Back to results
        </FlightLink>
      </main>
    );
  }
  const { hotel, rooms } = detail;
  const nights = nightsBetween(stay.checkin, stay.checkout);
  const gallery = hotel.images?.length ? hotel.images : hotel.photo ? [hotel.photo] : [];
  const summary = [
    hotel.stars !== undefined ? `${hotel.stars} star` : undefined,
    hotel.rating !== undefined ? `Rated ${hotel.rating}` : undefined,
    hotel.address,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main id="main" className="details-page page-width">
      <FlightLink href={backHref} className="back-link">
        <ArrowLeft size={15} /> Back to results
      </FlightLink>
      <div className="details-title">
        <div>
          <span className="eyebrow">YOUR STAY</span>
          <h1>{hotel.name}</h1>
          <p>{summary}</p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test bookings in the LiteAPI sandbox
        </span>
      </div>
      {gallery.length > 0 && (
        <div className="hotel-gallery">
          {gallery.slice(0, maxImages).map((url, index) => (
            <img key={`${index}-${url}`} src={url} alt="" loading="lazy" />
          ))}
        </div>
      )}
      {hotel.description && (
        <section className="hotel-section">
          <h2>About this hotel</h2>
          <p>{hotel.description}</p>
        </section>
      )}
      {hotel.facilities && hotel.facilities.length > 0 && (
        <section className="hotel-section">
          <h2>Facilities</h2>
          <ul className="hotel-facilities">
            {hotel.facilities.map((facility, index) => (
              <li key={`${index}-${facility}`}>
                <Star size={12} aria-hidden="true" /> {facility}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="itinerary-panel">
        <div className="panel-heading">
          <h2>
            Rooms for {nights} {nights === 1 ? "night" : "nights"}
          </h2>
          <span>
            {stay.checkin} to {stay.checkout} · {stay.adults} {stay.adults === 1 ? "adult" : "adults"}
          </span>
        </div>
        {rooms.length === 0 ? (
          <div className="empty-state">
            <h2>No rooms are available for these dates</h2>
            <FlightLink href={backHref} className="button button-blue">
              Back to results
            </FlightLink>
          </div>
        ) : (
          <ul className="room-list">
            {rooms.map((room) => (
              <RoomRow
                key={room.offerId}
                room={room}
                nights={nights}
                reserveHref={`/hotels/${encodeURIComponent(hotelId)}/book?${query}&offerId=${encodeURIComponent(room.offerId)}`}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
