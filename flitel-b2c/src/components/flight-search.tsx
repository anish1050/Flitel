"use client";

import { useId, useState, type FormEvent } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  UsersRound,
} from "lucide-react";
import { useFlightNavigation } from "@/components/flight-transition";
import {
  airports,
  buildSearchQuery,
  createDefaultSearch,
  searchSchema,
  type FlightSearch,
} from "@/lib/flights";

export function FlightSearchForm({
  initialSearch,
  compact = false,
}: {
  initialSearch?: FlightSearch;
  compact?: boolean;
}) {
  const [search, setSearch] = useState<FlightSearch>(
    () => initialSearch ?? createDefaultSearch(),
  );
  const [error, setError] = useState("");
  const formId = useId();
  const { navigateTo, isNavigating } = useFlightNavigation();
  const today = new Date();
  const minimumDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function updateSearch(changes: Partial<FlightSearch>) {
    setSearch((current) => ({ ...current, ...changes }));
    setError("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNavigating) return;

    const result = searchSchema.safeParse({
      ...search,
      returnDate: search.trip === "round-trip" ? search.returnDate : undefined,
    });

    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setError("");
    navigateTo(`/flights?${buildSearchQuery(result.data)}`);
  }

  return (
    <form
      className={`flight-search${compact ? " flight-search--compact" : ""}`}
      aria-label="Search flights"
      aria-busy={isNavigating}
      aria-describedby={error ? `${formId}-error` : undefined}
      onSubmit={submitSearch}
      noValidate
    >
      <div className="search-options">
        <fieldset className="trip-options">
          <legend className="sr-only">Trip type</legend>
          <label className="trip-option">
            <input
              type="radio"
              name={`${formId}-trip`}
              value="one-way"
              checked={search.trip === "one-way"}
              onChange={() => updateSearch({ trip: "one-way" })}
            />
            <span>One way</span>
          </label>
          <label className="trip-option">
            <input
              type="radio"
              name={`${formId}-trip`}
              value="round-trip"
              checked={search.trip === "round-trip"}
              onChange={() =>
                updateSearch({
                  trip: "round-trip",
                  returnDate:
                    search.returnDate && search.returnDate >= search.depart
                      ? search.returnDate
                      : search.depart,
                })
              }
            />
            <span>Round trip</span>
          </label>
        </fieldset>
        <div className="search-preferences">
          <label className="preference-field">
            <UsersRound size={16} aria-hidden="true" />
            <span className="sr-only">Adults</span>
            <select
              name="travellers"
              value={search.travellers}
              onChange={(event) =>
                updateSearch({ travellers: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                <option key={count} value={count}>
                  {count} {count === 1 ? "adult" : "adults"}
                </option>
              ))}
            </select>
          </label>
          <label className="preference-field">
            <span className="sr-only">Cabin class</span>
            <select
              name="cabin"
              value={search.cabin}
              onChange={(event) =>
                updateSearch({
                  cabin: event.target.value as FlightSearch["cabin"],
                })
              }
            >
              <option value="economy">Economy</option>
              <option value="business">Business</option>
            </select>
          </label>
        </div>
      </div>

      <div className="search-grid" data-trip={search.trip}>
        <label className="search-field">
          <PlaneTakeoff className="field-icon" size={21} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">From</span>
            <select
              name="from"
              value={search.from}
              onChange={(event) => updateSearch({ from: event.target.value })}
              required
            >
              {airports.map((airport) => (
                <option key={airport.code} value={airport.code}>
                  {airport.city} ({airport.code})
                </option>
              ))}
            </select>
          </span>
        </label>
        <button
          type="button"
          className="swap-airports"
          aria-label="Swap departure and destination"
          onClick={() => updateSearch({ from: search.to, to: search.from })}
        >
          <ArrowLeftRight size={17} aria-hidden="true" />
        </button>
        <label className="search-field">
          <PlaneLanding className="field-icon" size={21} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">To</span>
            <select
              name="to"
              value={search.to}
              onChange={(event) => updateSearch({ to: event.target.value })}
              required
            >
              {airports.map((airport) => (
                <option key={airport.code} value={airport.code}>
                  {airport.city} ({airport.code})
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="search-field">
          <CalendarDays className="field-icon" size={20} aria-hidden="true" />
          <span className="field-content">
            <span className="field-label">Departure</span>
            <input
              type="date"
              name="depart"
              value={search.depart}
              min={minimumDate}
              required
              onChange={(event) =>
                updateSearch({
                  depart: event.target.value,
                  returnDate:
                    search.returnDate && search.returnDate < event.target.value
                      ? event.target.value
                      : search.returnDate,
                })
              }
            />
          </span>
        </label>
        {search.trip === "round-trip" && (
          <label className="search-field">
            <CalendarDays className="field-icon" size={20} aria-hidden="true" />
            <span className="field-content">
              <span className="field-label">Return</span>
              <input
                type="date"
                name="returnDate"
                value={search.returnDate ?? ""}
                min={search.depart || minimumDate}
                onChange={(event) =>
                  updateSearch({ returnDate: event.target.value })
                }
                required
              />
            </span>
          </label>
        )}
        <button className="search-submit" type="submit" disabled={isNavigating}>
          <Search size={20} aria-hidden="true" />
          <span>{isNavigating ? "Searching…" : "Search flights"}</span>
        </button>
      </div>
      {error && (
        <p id={`${formId}-error`} className="search-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
