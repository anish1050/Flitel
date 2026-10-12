import { FlightLink } from "./flight-transition";

export function HotelRoomGone({ hotelHref }: { hotelHref: string }) {
  return (
    <div role="alert">
      <h1>This room is no longer available.</h1>
      <p>Choose another room to continue.</p>
      <FlightLink href={hotelHref} className="button button-blue">
        Back to the hotel’s rooms
      </FlightLink>
    </div>
  );
}
