"use client";

import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { FlightResults } from "./flight-results";
import { readFlightOffers } from "@/lib/flight-stream";
import type { FlightOffer, FlightSearch } from "@/lib/flights";

export function ProgressiveFlightResults({ search }: { search: FlightSearch }) {
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function searchFlights() {
      try {
        const response = await fetch("/api/flights/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
          body: JSON.stringify(search),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw new Error("Search unavailable");
        await readFlightOffers(response.body, setOffers, controller.signal);
      } catch {
        if (!controller.signal.aborted) setHasFailed(true);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }
    void searchFlights();
    return () => controller.abort();
  }, [search]);

  return (
    <>
      {isSearching && (
        <div className="search-progress" role="status">
          <Plane size={20} />
          <span>
            {offers.length
              ? "Checking more flights… You can explore the results below."
              : "Checking flights for your journey…"}
          </span>
        </div>
      )}
      {hasFailed && (
        <div className="search-progress search-progress-error" role="alert">
          <span>
            {offers.length
              ? "Some results are available, but this search is incomplete. Search again to check all flights."
              : "We couldn’t load your flights. Please try the search again."}
          </span>
        </div>
      )}
      {(offers.length > 0 || (!isSearching && !hasFailed)) && (
        <FlightResults search={search} offers={offers} isSupplierSearch />
      )}
    </>
  );
}
