import type { Metadata } from "next";
import { ArrowLeft, Info } from "lucide-react";
import { redirect } from "next/navigation";
import { HotelRoomGone } from "@/components/hotel-room-gone";
import { HotelPayment } from "@/components/hotel-payment";
import { FlightLink } from "@/components/flight-transition";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { hasFlightBackend } from "@/lib/flight-api";
import { formatCalendarDate, formatPrice } from "@/lib/flights";
import { fetchHotelRooms } from "@/lib/hotel-api";
import {
  buildStayQuery,
  cancellationLabel,
  nightsBetween,
  parseStayParams,
  type StayInput,
} from "@/lib/hotels";

export const metadata: Metadata = { title: "Guest details and payment" };

function Gone({ hotelHref }: { hotelHref: string }) {
  return (
    <main id="main" className="empty-state page-width">
      <HotelRoomGone hotelHref={hotelHref} />
    </main>
  );
}

export default async function BookHotel({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!hasFlightBackend()) return <HotelsUnavailable />;

  const query = await searchParams;
  let stay: StayInput;
  try {
    stay = parseStayParams(query, formatCalendarDate(new Date()));
  } catch {
    redirect("/hotels");
  }
  const { hotelId } = await params;
  const stayQuery = buildStayQuery(stay);
  const hotelHref = `/hotels/${encodeURIComponent(hotelId)}?${stayQuery}`;
  const offerId = typeof query.offerId === "string" ? query.offerId : "";

  let detail;
  try {
    detail = await fetchHotelRooms(hotelId, stay);
  } catch (error) {
    return (
      <main id="main" className="empty-state page-width">
        <h1>We couldn’t load this room right now.</h1>
        <p role="alert">{error instanceof Error ? error.message : "Please try again."}</p>
        <FlightLink href={hotelHref} className="button button-blue">
          Back to the hotel’s rooms
        </FlightLink>
      </main>
    );
  }
  const room = detail.rooms.find((candidate) => candidate.offerId === offerId);
  if (!room) return <Gone hotelHref={hotelHref} />;

  const nights = nightsBetween(stay.checkin, stay.checkout);
  const nightsLabel = `${nights} ${nights === 1 ? "night" : "nights"}`;
  const price = formatPrice(room.price.amount, room.price.currency);
  return (
    <main id="main" className="details-page page-width">
      <FlightLink href={hotelHref} className="back-link">
        <ArrowLeft size={15} /> Back to the hotel
      </FlightLink>
      <div className="details-title">
        <div>
          <span className="eyebrow">ALMOST THERE</span>
          <h1>Who’s staying with us?</h1>
          <p>{detail.hotel.name}</p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test booking
        </span>
      </div>
      <div className="details-layout">
        <HotelPayment offerId={offerId} hotelHref={hotelHref} summaryPrice={room.price} />
        <aside className="price-panel">
          <span className="eyebrow">YOUR STAY</span>
          <h2>{detail.hotel.name}</h2>
          <p>{room.name}</p>
          {room.boardName && <p>{room.boardName}</p>}
          <p>
            {stay.checkin} to {stay.checkout} · {nightsLabel} · {stay.adults}{" "}
            {stay.adults === 1 ? "adult" : "adults"}
          </p>
          <div className="price-line">
            <span>Room for {nightsLabel}</span>
            <strong>{price}</strong>
          </div>
          <div className="price-total">
            <span>Total</span>
            <strong>{price}</strong>
          </div>
          <p>{cancellationLabel(room.refundable, room.cancelBefore)}</p>
          {room.taxesNotIncluded.length > 0 && (
            <small>
              Taxes and fees not included:{" "}
              {room.taxesNotIncluded
                .map((tax) => `${tax.description} ${formatPrice(tax.amount, tax.currency)}`)
                .join(", ")}
            </small>
          )}
          <div className="booking-preview-note">
            <Info size={18} />
            <p>Test booking in the LiteAPI sandbox. Pay with the test card; no real money is taken.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
