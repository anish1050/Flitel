import { FlightLink } from "./flight-transition";

export function HotelRoomGone({ hotelHref }: { hotelHref: string }) {
  return (
    <section className="itinerary-panel booking-panel" role="alert">
      <div className="itinerary-body">
        <h2>This room is no longer available.</h2>
        <p>Choose another room to continue.</p>
        <FlightLink href={hotelHref} className="button button-blue">
          Back to the hotel’s rooms
        </FlightLink>
      </div>
    </section>
  );
}
