import type { Metadata } from "next";
import { ArrowLeft, Info } from "lucide-react";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { FlightLink } from "@/components/flight-transition";
import { fetchFlightOffer } from "@/lib/flight-api";
import { buildSearchQuery, findAirport, parseSearchParams } from "@/lib/flights";

export const metadata: Metadata = { title: "Traveller details" };

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
  let offer;
  try {
    offer = await fetchFlightOffer(id, search);
  } catch (error) {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>Let’s find an updated fare.</h1>
        <p>
          {error instanceof Error ? error.message : "This flight is unavailable. Please search again."}
        </p>
        <FlightLink href={`/flights?${query}`} className="button button-blue">
          Search flights again
        </FlightLink>
      </main>
    );
  }
  if (!offer?.slices || !offer.totalAmount || !offer.passengerIds) notFound();
  const outbound = offer.slices[0];
  const origin = outbound.segments[0].origin;
  const destination = outbound.segments.at(-1)!.destination;
  const tripLabel = offer.slices.length > 1 ? "Round trip" : "One way";
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
        offer={{
          id: offer.id,
          totalAmount: offer.totalAmount,
          currency: offer.currency,
          passengerIds: offer.passengerIds,
          identityDocumentsRequired: offer.identityDocumentsRequired ?? false,
          refundCondition: offer.refundCondition,
          changeCondition: offer.changeCondition,
        }}
        route={{ from: origin.iata_code, to: destination.iata_code }}
        tripLabel={tripLabel}
        searchHref={`/flights?${query}`}
      />
    </main>
  );
}
