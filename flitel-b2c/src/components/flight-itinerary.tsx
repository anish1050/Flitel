import { Plane } from "lucide-react";
import {
  durationInMinutes,
  sliceStops,
  type DuffelSlice,
  type FareCondition,
} from "@/lib/duffel-offers";
import { formatDuration, formatPrice } from "@/lib/flights";

function localDate(timestamp: string): string {
  return new Date(`${timestamp.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );
}

export function fareConditionText(
  condition: FareCondition,
  action: string,
): string {
  if (!condition) return `${action} conditions not supplied by the airline.`;
  if (!condition.allowed) return `${action} before departure is not allowed.`;
  if (condition.penalty_amount && condition.penalty_currency) {
    return `${action} before departure is allowed. Airline penalty: ${formatPrice(Number(condition.penalty_amount), condition.penalty_currency)}. Other fare conditions may apply.`;
  }
  return `${action} before departure is allowed; the airline has not supplied the penalty amount.`;
}

export function FlightItinerary({
  slices,
  detailed = false,
  passengerIds = [],
}: {
  slices: DuffelSlice[];
  detailed?: boolean;
  passengerIds?: string[];
}) {
  return (
    <div
      className={`supplier-itinerary ${detailed ? "supplier-itinerary-detailed" : ""}`}
    >
      {slices.map((slice, index) => {
        const first = slice.segments[0];
        const last = slice.segments.at(-1)!;
        const stops = sliceStops(slice);
        return (
          <section
            className="supplier-slice"
            key={slice.id}
            aria-label={index === 0 ? "Outbound flight" : "Return flight"}
          >
            <div className="supplier-slice-heading">
              <strong>{index === 0 ? "Outbound" : "Return"}</strong>
              <span>
                {localDate(first.departing_at)} ·{" "}
                {formatDuration(durationInMinutes(slice.duration))}
              </span>
            </div>
            <div className="flight-timeline">
              <div>
                <strong>{first.departing_at.slice(11, 16)}</strong>
                <span>{first.origin.iata_code}</span>
              </div>
              <div className="flight-route">
                <div className="flight-route-line">
                  <i />
                  <Plane size={16} />
                  <i />
                </div>
                <small>
                  {stops === 0
                    ? "Non-stop"
                    : `${stops} ${stops === 1 ? "stop" : "stops"}`}
                </small>
              </div>
              <div>
                <strong>{last.arriving_at.slice(11, 16)}</strong>
                <span>{last.destination.iata_code}</span>
              </div>
            </div>
            <p className="supplier-local-times">
              Arrival {localDate(last.arriving_at)} · All times local to each
              airport
            </p>
            {detailed &&
              slice.segments.map((segment, segmentIndex) => (
                <div className="supplier-segment" key={segment.id}>
                  <strong>
                    {segment.marketing_carrier.name} ·{" "}
                    {segment.marketing_carrier.iata_code}{" "}
                    {segment.marketing_carrier_flight_number}
                  </strong>
                  {segment.operating_carrier &&
                    segment.operating_carrier.name !==
                      segment.marketing_carrier.name && (
                      <p>Operated by {segment.operating_carrier.name}</p>
                    )}
                  <p>
                    {segment.origin.name} ({segment.origin.iata_code}) →{" "}
                    {segment.destination.name} ({segment.destination.iata_code})
                  </p>
                  <p>
                    {localDate(segment.departing_at)}{" "}
                    {segment.departing_at.slice(11, 16)} →{" "}
                    {localDate(segment.arriving_at)}{" "}
                    {segment.arriving_at.slice(11, 16)}
                  </p>
                  {segment.stops.length > 0 && (
                    <p>
                      Stops during this flight:{" "}
                      {segment.stops
                        .map((stop) => stop.airport.iata_code)
                        .join(", ")}
                    </p>
                  )}
                  {segment.passengers.length === 0 && (
                    <p>Baggage and cabin details not supplied.</p>
                  )}
                  {segment.passengers.map((passenger) => (
                    <p key={passenger.passenger_id}>
                      {passengerIds.includes(passenger.passenger_id)
                        ? `Adult ${passengerIds.indexOf(passenger.passenger_id) + 1}`
                        : "Adult"}{" "}
                      ·{" "}
                      {passenger.cabin_class?.replaceAll("_", " ") ??
                        "Cabin not supplied"}{" "}
                      ·{" "}
                      {passenger.baggages?.length
                        ? passenger.baggages
                            .map(
                              (bag) =>
                                `${bag.quantity} ${bag.type} ${bag.quantity === 1 ? "bag" : "bags"}`,
                            )
                            .join(", ")
                        : "Baggage allowance not supplied"}
                    </p>
                  ))}
                  {segmentIndex < slice.segments.length - 1 && (
                    <p className="connection-note">
                      Connection at {segment.destination.name} (
                      {segment.destination.iata_code})
                    </p>
                  )}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
