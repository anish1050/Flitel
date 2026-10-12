"use client";

import { CalendarDays, Users } from "lucide-react";
import { useState } from "react";
import type { StayInput } from "@/lib/hotels";

// UTC so the browser's timezone cannot move a calendar date.
function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Change dates or guests for the hotel being viewed. A plain GET, so the page reloads with new rooms and prices. */
export function StayEditor({
  action,
  stay,
  today,
}: {
  action: string;
  stay: StayInput;
  today: string;
}) {
  const [checkin, setCheckin] = useState(stay.checkin);
  const [checkout, setCheckout] = useState(stay.checkout);

  function changeCheckin(next: string) {
    setCheckin(next);
    // Check-out has to stay at least a night after check-in.
    if (next && checkout <= next) setCheckout(addDays(next, 1));
  }

  return (
    <form className="stay-editor" action={action} method="get" aria-label="Change your dates">
      <input type="hidden" name="destination" value={stay.destination} />
      <label className="stay-editor-field">
        <CalendarDays size={18} aria-hidden="true" />
        <span>
          <span className="field-label">Check-in</span>
          <input
            type="date"
            name="checkin"
            value={checkin}
            min={today}
            required
            onChange={(event) => changeCheckin(event.target.value)}
          />
        </span>
      </label>
      <label className="stay-editor-field">
        <CalendarDays size={18} aria-hidden="true" />
        <span>
          <span className="field-label">Check-out</span>
          <input
            type="date"
            name="checkout"
            value={checkout}
            min={checkin ? addDays(checkin, 1) : today}
            required
            onChange={(event) => setCheckout(event.target.value)}
          />
        </span>
      </label>
      <label className="stay-editor-field">
        <Users size={18} aria-hidden="true" />
        <span>
          <span className="field-label">Adults</span>
          <select name="adults" defaultValue={String(stay.adults)}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? "adult" : "adults"}
              </option>
            ))}
          </select>
        </span>
      </label>
      <button type="submit" className="button button-blue">
        Update stay
      </button>
    </form>
  );
}
