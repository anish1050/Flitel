import type { Metadata } from "next";
import { ArrowRight, Check, Info, Mail, Plane, Users } from "lucide-react";
import { FlightItinerary } from "@/components/flight-itinerary";
import { FlightLink } from "@/components/flight-transition";
import { fetchBooking } from "@/lib/flight-api";
import { findAirport, formatPrice } from "@/lib/flights";

export const metadata: Metadata = { title: "Booking confirmed" };

export default async function BookingConfirmation({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  let booking;
  try {
    booking = await fetchBooking(orderId);
  } catch {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>We couldn’t load this booking.</h1>
        <p>Check the link, or try again in a moment.</p>
        <FlightLink href="/" className="button button-blue">
          Plan a journey
        </FlightLink>
      </main>
    );
  }
  const outbound = booking.slices[0];
  const origin = outbound.segments[0].origin;
  const destination = outbound.segments.at(-1)!.destination;
  const total = formatPrice(Number(booking.totalAmount), booking.currency);
  return (
    <main id="main" className="details-page page-width">
      <div className="details-title">
        <div>
          <span className="eyebrow">YOU’RE ALL SET</span>
          <h1>Your booking is confirmed.</h1>
          <p>
            {findAirport(origin.iata_code)?.city ?? origin.name} to{" "}
            {findAirport(destination.iata_code)?.city ?? destination.name} ·{" "}
            {booking.slices.length > 1 ? "Round trip" : "One way"}
          </p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test booking
        </span>
      </div>
      <div className="details-layout">
        <div>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <span>
                <Plane size={18} /> Your flight
              </span>
            </div>
            <div className="itinerary-body">
              <FlightItinerary slices={booking.slices} />
            </div>
          </section>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <span>
                <Users size={18} /> Travellers
              </span>
              <span>
                {booking.travellers.length} {booking.travellers.length === 1 ? "adult" : "adults"}
              </span>
            </div>
            <div className="review-list">
              {booking.travellers.map((traveller) => (
                <div className="review-row" key={traveller}>
                  <span>{traveller}</span>
                  <span>Adult</span>
                </div>
              ))}
            </div>
          </section>
          {booking.email && (
            <section className="itinerary-panel booking-panel">
              <div className="panel-heading">
                <span>
                  <Mail size={18} /> Booking updates go to
                </span>
                <span>{booking.email}</span>
              </div>
            </section>
          )}
        </div>
        <aside className="price-panel">
          <span className="eyebrow">BOOKING REFERENCE</span>
          <p className="booking-reference">{booking.bookingReference}</p>
          <span className="booking-status">
            <Check size={14} /> Confirmed
          </span>
          <h2>
            {origin.iata_code} <ArrowRight size={21} /> {destination.iata_code}
          </h2>
          <div className="price-line">
            <span>Fare including taxes</span>
            <strong>{total}</strong>
          </div>
          <div className="price-total">
            <span>Total paid</span>
            <strong>{total}</strong>
          </div>
          <div className="booking-preview-note">
            <Info size={18} />
            <p>Test booking made in Duffel test mode. No real ticket was issued and no money was charged.</p>
          </div>
          <FlightLink className="button button-blue full-width" href="/">
            Plan another journey
          </FlightLink>
        </aside>
      </div>
    </main>
  );
}
