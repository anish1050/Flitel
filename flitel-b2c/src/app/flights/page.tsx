import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { FlightSearchForm } from "@/components/flight-search";
import { FlightResults } from "@/components/flight-results";
import { ProgressiveFlightResults } from "@/components/progressive-flight-results";
import { FlightLink } from "@/components/flight-transition";
import {
  createDemoOffers,
  findAirport,
  parseSearchParams,
} from "@/lib/flights";
import { hasFlightBackend } from "@/lib/flight-api";
import { randomUUID } from "node:crypto";

export const metadata: Metadata = { title: "Find your flight" };

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let search;
  try {
    search = parseSearchParams(await searchParams);
  } catch {
    return (
      <main id="main" className="page-width invalid-search">
        <h1>Let’s start with your journey.</h1>
        <p>
          Your search is incomplete or the dates have passed. Pick your route
          and new travel dates below.
        </p>
        <FlightSearchForm />
      </main>
    );
  }
  const date = new Date(`${search.depart}T12:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );
  return (
    <main id="main" className="results-page">
      <div className="results-search">
        <div className="page-width">
          <FlightLink href="/" className="back-link">
            <ArrowLeft size={15} /> Back to exploring
          </FlightLink>
          <FlightSearchForm
            key={JSON.stringify(search)}
            initialSearch={search}
            compact
          />
        </div>
      </div>
      <div className="page-width">
        <div className="results-heading">
          <div>
            <span className="eyebrow">YOUR NEXT TAKEOFF</span>
            <h1>
              {findAirport(search.from)?.city} <ArrowRight aria-label="to" />{" "}
              {findAirport(search.to)?.city}
            </h1>
            <p>
              {date} <span>·</span> {search.travellers}{" "}
              {search.travellers === 1 ? "adult" : "adults"} <span>·</span>{" "}
              {search.trip === "round-trip" ? "Round trip" : "One way"}
            </p>
          </div>
          <span className="sample-badge">
            <Info size={14} />{" "}
            {hasFlightBackend()
              ? "Duffel test results"
              : "Sample flight results"}
          </span>
        </div>
        {hasFlightBackend() ? (
          <ProgressiveFlightResults key={randomUUID()} search={search} />
        ) : (
          <FlightResults
            key={JSON.stringify(search)}
            search={search}
            offers={createDemoOffers(search)}
            isSupplierSearch={false}
          />
        )}
      </div>
    </main>
  );
}
