import type { Metadata } from "next";
import { Check, Info, Mail } from "lucide-react";
import { FlightLink } from "@/components/flight-transition";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { hasFlightBackend } from "@/lib/flight-api";
import { formatPrice } from "@/lib/flights";
import { fetchHotelBooking } from "@/lib/hotel-api";
import { cancellationLabel, nightsBetween } from "@/lib/hotels";

export const metadata: Metadata = { title: "Hotel booking" };

export default async function HotelBookingConfirmation({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!hasFlightBackend()) return <HotelsUnavailable />;
  const { bookingId } = await params;
  const { ref } = await searchParams;
  let booking;
  try {
    booking = await fetchHotelBooking(bookingId, typeof ref === "string" ? ref : "");
  } catch {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>We couldn’t load this booking.</h1>
        <p>Check the link, or try again in a moment.</p>
        <FlightLink href="/hotels" className="button button-blue">
          Search hotels
        </FlightLink>
      </main>
    );
  }
  const confirmed = booking.status === "CONFIRMED";
  const nights = nightsBetween(booking.checkin, booking.checkout);
  const total = formatPrice(booking.price, booking.currency);
  const { refundableTag, cancelPolicyInfos } = booking.cancellation;
  const cancellation = cancellationLabel(refundableTag === "RFN", cancelPolicyInfos[0]?.cancelTime);
  const heading = confirmed
    ? "Your hotel booking is confirmed."
    : `This booking is ${booking.status.toLowerCase()}.`;
  return (
    <main id="main" className="details-page page-width">
      <div className="details-title">
        <div>
          <span className="eyebrow">{confirmed ? "YOU’RE ALL SET" : "BOOKING STATUS"}</span>
          <h1>{heading}</h1>
          <p>{booking.hotel.name}</p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test booking
        </span>
      </div>
      <div className="details-layout">
        <div>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <h2>Your stay</h2>
            </div>
            <div className="review-list">
              <div className="review-row">
                <span>Hotel</span>
                <span>{booking.hotel.name}</span>
              </div>
              <div className="review-row">
                <span>Check-in</span>
                <span>{booking.checkin}</span>
              </div>
              <div className="review-row">
                <span>Check-out</span>
                <span>{booking.checkout}</span>
              </div>
              <div className="review-row">
                <span>Nights</span>
                <span>{nights}</span>
              </div>
              <div className="review-row">
                <span>Guest</span>
                <span>
                  {booking.holder.firstName} {booking.holder.lastName}
                </span>
              </div>
            </div>
          </section>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <span>
                <Mail size={18} /> Booking updates go to
              </span>
              <span>{booking.holder.email}</span>
            </div>
          </section>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <h2>Cancellation terms</h2>
            </div>
            <div className="itinerary-body">
              <p>{cancellation}</p>
            </div>
          </section>
        </div>
        <aside className="price-panel">
          <span className="eyebrow">BOOKING REFERENCE</span>
          <p className="booking-reference">{booking.bookingId}</p>
          {booking.hotelConfirmationCode && (
            <p>Hotel confirmation code: {booking.hotelConfirmationCode}</p>
          )}
          {confirmed && (
            <span className="booking-status">
              <Check size={14} /> Confirmed
            </span>
          )}
          <div className="price-total">
            <span>Total paid</span>
            <strong>{total}</strong>
          </div>
          <div className="booking-preview-note">
            <Info size={18} />
            <p>Test booking made in the LiteAPI sandbox. No real room was reserved and no money was taken.</p>
          </div>
          <FlightLink className="button button-blue full-width" href="/hotels">
            Search more hotels
          </FlightLink>
        </aside>
      </div>
    </main>
  );
}
