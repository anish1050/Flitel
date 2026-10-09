import type { Metadata } from "next";
import { ArrowLeft, Info } from "lucide-react";
import { BookingForm } from "@/components/booking-form";
import { FlightLink } from "@/components/flight-transition";
import { toBookableOffer } from "@/lib/booking";
import { fetchFlightOffer, hasFlightBackend, refreshSupplierOffer } from "@/lib/flight-api";
import { buildSearchQuery, findAirport, parseSearchParams, type FlightOffer, type FlightSearch } from "@/lib/flights";

export const metadata: Metadata = { title: "Traveller details" };

async function loadBookableOffer(id: string, search: FlightSearch) {
  const loaded = await fetchFlightOffer(id, search).catch(() => undefined);
  const loadedBookable = loaded && toBookableOffer(loaded);
  if (loaded && loadedBookable) return { offer: loaded, bookable: loadedBookable, refreshed: false };
  if (!hasFlightBackend()) return undefined;
  const offer: FlightOffer | undefined = await refreshSupplierOffer(id, search).catch(() => undefined);
  const bookable = offer && toBookableOffer(offer);
  return offer && bookable ? { offer, bookable, refreshed: true } : undefined;
}

export default async function BookFlight({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let search;
  try {
    search = parseSearchParams(await searchParams);
  } catch {
    return (
      <main id="main" className="empty-state page-width">
        <h1>This search needs an update.</h1>
        <p>Choose your route and travel dates again.</p>
        <FlightLink href="/" className="button button-blue">
          Start a new search
        </FlightLink>
      </main>
    );
  }
  const { id } = await params;
  const query = buildSearchQuery(search);
  const found = await loadBookableOffer(id, search);
  if (!found) {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>This flight is no longer available.</h1>
        <p>Search again to see current fares for your route.</p>
        <FlightLink href={`/flights?${query}`} className="button button-blue">
          Search flights again
        </FlightLink>
      </main>
    );
  }
  const { offer, bookable, refreshed } = found;
  // toBookableOffer already proved the slices exist.
  const outbound = offer.slices![0];
  const origin = outbound.segments[0].origin;
  const destination = outbound.segments.at(-1)!.destination;
  const tripLabel = offer.slices!.length > 1 ? "Round trip" : "One way";
  return (
    <main id="main" className="details-page page-width">
      <FlightLink href={`/flights/${encodeURIComponent(offer.id)}?${query}`} className="back-link">
        <ArrowLeft size={15} /> Back to flight details
      </FlightLink>
      <div className="details-title">
        <div>
          <span className="eyebrow">ALMOST THERE</span>
          <h1>Who’s flying with us?</h1>
          <p>
            {findAirport(origin.iata_code)?.city ?? origin.name} to{" "}
            {findAirport(destination.iata_code)?.city ?? destination.name} · {tripLabel}
          </p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test booking
        </span>
      </div>
      <BookingForm
        offer={bookable}
        search={search}
        initialNotice={refreshed ? "This fare was refreshed. Please check the new total." : undefined}
        route={{ from: origin.iata_code, to: destination.iata_code }}
        tripLabel={tripLabel}
        searchHref={`/flights?${query}`}
      />
    </main>
  );
}
