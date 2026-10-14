import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { hotelDestinations, type StayInput } from "@/lib/hotels";

// A plain GET form so the search works without JavaScript. It reuses the flight search bar's classes.
export function HotelSearchForm({ stay, today }: { stay: StayInput; today: string }) {
  return (
    <form className="flight-search" action="/hotels" method="get" aria-label="Search hotels">
      <div className="search-grid">
        <label className="search-field">
          <MapPin className="field-icon" size={21} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">Destination</span>
            <select name="destination" defaultValue={stay.destination} required>
              {hotelDestinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="search-field">
          <CalendarDays className="field-icon" size={20} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">Check-in</span>
            <input type="date" name="checkin" defaultValue={stay.checkin} min={today} required />
          </span>
        </label>
        <label className="search-field">
          <CalendarDays className="field-icon" size={20} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">Check-out</span>
            <input type="date" name="checkout" defaultValue={stay.checkout} min={today} required />
          </span>
        </label>
        <label className="search-field">
          <Users className="field-icon" size={21} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">Adults</span>
            <select name="adults" defaultValue={String(stay.adults)} required>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                <option key={count} value={count}>
                  {count} {count === 1 ? "adult" : "adults"}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button className="search-submit" type="submit">
          <Search size={17} aria-hidden="true" /> Search hotels
        </button>
      </div>
    </form>
  );
}
