import { Search } from "lucide-react";
import { hotelDestinations, type StayInput } from "@/lib/hotels";

// A plain GET form so the search works without JavaScript.
export function HotelSearchForm({ stay, today }: { stay: StayInput; today: string }) {
  return (
    <form className="hotel-search" action="/hotels" method="get" aria-label="Search hotels">
      <label className="booking-field">
        <span className="field-label">Destination</span>
        <select name="destination" defaultValue={stay.destination} required>
          {hotelDestinations.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.label}
            </option>
          ))}
        </select>
      </label>
      <label className="booking-field">
        <span className="field-label">Check-in</span>
        <input type="date" name="checkin" defaultValue={stay.checkin} min={today} required />
      </label>
      <label className="booking-field">
        <span className="field-label">Check-out</span>
        <input type="date" name="checkout" defaultValue={stay.checkout} min={today} required />
      </label>
      <label className="booking-field">
        <span className="field-label">Adults</span>
        <select name="adults" defaultValue={String(stay.adults)} required>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      <button className="button button-blue" type="submit">
        <Search size={16} aria-hidden="true" /> Search hotels
      </button>
    </form>
  );
}
