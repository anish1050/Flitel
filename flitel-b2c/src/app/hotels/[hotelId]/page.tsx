import type { Metadata } from "next";
import { ArrowLeft, Info, Star } from "lucide-react";
import { redirect } from "next/navigation";
import { FlightLink } from "@/components/flight-transition";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { RemotePhoto } from "@/components/remote-photo";
import { StayEditor } from "@/components/stay-editor";
import { hasFlightBackend } from "@/lib/flight-api";
import { formatCalendarDate, formatPrice } from "@/lib/flights";
import { fetchHotelRooms } from "@/lib/hotel-api";
import {
  buildReserveQuery,
  buildStayQuery,
  cancellationLabel,
  nightsBetween,
  parseStayParams,
  type HotelDetail,
  type Room,
  type StayInput,
} from "@/lib/hotels";

export const metadata: Metadata = { title: "Your hotel" };

// Mirrors maxRooms in flitel-b2c-service/src/hotels.ts.
const backendRoomCap = 12;
const facilityCardCount = 3;

function HotelHero({ hotel, photo }: { hotel: HotelDetail; photo?: string }) {
  return (
    <header className={photo ? "hotel-hero" : "hotel-hero hotel-hero-plain"}>
      {photo && <RemotePhoto src={photo} sizes="(max-width: 1200px) 100vw, 1200px" eager />}
      <div className="hotel-hero-shade" />
      <div className="hotel-hero-badges">
        {hotel.stars !== undefined && (
          <span>
            <Star size={11} aria-hidden="true" /> {hotel.stars} star
          </span>
        )}
        {hotel.rating ? <span>Rated {hotel.rating}</span> : null}
      </div>
      <div className="hotel-hero-text">
        <span className="eyebrow">YOUR STAY</span>
        <h1>{hotel.name}</h1>
        {hotel.address && <p>{hotel.address}</p>}
      </div>
    </header>
  );
}

// LiteAPI photos are unlabelled, so the first few facilities borrow the next gallery photos.
function HotelFacilities({ hotel, photos }: { hotel: HotelDetail; photos: string[] }) {
  const facilities = hotel.facilities ?? [];
  const featured = facilities.slice(0, facilityCardCount);
  const remaining = facilities.slice(facilityCardCount);
  if (!hotel.description && featured.length === 0) return null;
  return (
    <section className="hotel-intro" aria-labelledby="hotel-facilities-heading">
      <div className="hotel-intro-lead">
        <div>
          <span className="eyebrow">PREMIUM FACILITIES</span>
          <h2 id="hotel-facilities-heading">Everything you need for the stay</h2>
        </div>
        {hotel.description && <p>{hotel.description}</p>}
      </div>
      {featured.length > 0 && (
        <ul className="hotel-facility-cards">
          {featured.map((facility, index) => (
            <li key={`${index}-${facility}`}>
              {photos[index] ? (
                <RemotePhoto src={photos[index]} sizes="(max-width: 700px) 45vw, 300px" />
              ) : (
                <div className="hotel-facility-photo-empty" aria-hidden="true" />
              )}
              <strong>{facility}</strong>
            </li>
          ))}
        </ul>
      )}
      {remaining.length > 0 && (
        <ul className="hotel-amenities">
          {remaining.map((facility, index) => (
            <li key={`${index}-${facility}`}>
              <span className="hotel-amenity-icon" aria-hidden="true">
                <Star size={16} />
              </span>
              {facility}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// LiteAPI supplies hotel photos but none per room, so rooms reuse the hotel gallery in rotation.
function RoomCard({
  room,
  photo,
  nights,
  reserveHref,
}: {
  room: Room;
  photo?: string;
  nights: number;
  reserveHref: string;
}) {
  const nightsLabel = `${nights} ${nights === 1 ? "night" : "nights"}`;
  return (
    <li className="room-card">
      {photo ? (
        <RemotePhoto src={photo} sizes="(max-width: 700px) 90vw, 380px" />
      ) : (
        <div className="room-card-photo-empty" aria-hidden="true" />
      )}
      <div className="room-card-body">
        <h3>{room.name}</h3>
        {room.boardName && <p>{room.boardName}</p>}
        <p className={room.refundable ? "room-refundable" : undefined}>
          {cancellationLabel(room.refundable, room.cancelBefore)}
        </p>
        {room.taxesNotIncluded.length > 0 && (
          <small>
            Taxes and fees not included:{" "}
            {room.taxesNotIncluded
              .map((tax) => `${tax.description} ${formatPrice(tax.amount, tax.currency)}`)
              .join(", ")}
          </small>
        )}
        <div className="room-card-price">
          <div>
            <strong>{formatPrice(room.price.amount, room.price.currency)}</strong>
            <small>
              for {nightsLabel} · about{" "}
              {formatPrice(Math.round(room.price.amount / nights), room.price.currency)} per night
            </small>
          </div>
          <FlightLink href={reserveHref} className="button button-blue">
            Reserve
          </FlightLink>
        </div>
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
  const [heroPhoto, ...morePhotos] = gallery;
  const roomPhotos = morePhotos.length ? morePhotos : gallery;

  return (
    <main id="main" className="details-page page-width">
      <div className="hotel-topbar">
        <FlightLink href={backHref} className="back-link">
          <ArrowLeft size={15} /> Back to results
        </FlightLink>
        <span className="sample-badge">
          <Info size={14} /> Test bookings in the LiteAPI sandbox
        </span>
      </div>
      <HotelHero hotel={hotel} photo={heroPhoto} />
      <HotelFacilities hotel={hotel} photos={morePhotos} />

      <section className="itinerary-panel" aria-labelledby="hotel-rooms-heading">
        <div className="panel-heading">
          <h2 id="hotel-rooms-heading">
            Rooms for {nights} {nights === 1 ? "night" : "nights"}
          </h2>
          <span>
            {stay.checkin} to {stay.checkout} · {stay.adults} {stay.adults === 1 ? "adult" : "adults"}
          </span>
        </div>
        <StayEditor
          action={`/hotels/${encodeURIComponent(hotelId)}`}
          stay={stay}
          today={formatCalendarDate(new Date())}
        />
        {rooms.length === 0 ? (
          <div className="empty-state">
            <h2>No rooms are available for these dates</h2>
            <FlightLink href={backHref} className="button button-blue">
              Back to results
            </FlightLink>
          </div>
        ) : (
          <>
            {rooms.length === backendRoomCap && (
              <p className="room-cap-note">Showing the best {rooms.length} room options</p>
            )}
            <ul className="room-cards">
              {rooms.map((room, index) => (
                <RoomCard
                  key={room.offerId}
                  room={room}
                  photo={roomPhotos.length ? roomPhotos[index % roomPhotos.length] : undefined}
                  nights={nights}
                  reserveHref={`/hotels/${encodeURIComponent(hotelId)}/book?${buildReserveQuery(stay, room)}`}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
