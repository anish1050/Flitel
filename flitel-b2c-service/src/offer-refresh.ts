import { z } from "zod";
import type { FlightOffer } from "./flights.js";

const readableSlices = z
  .array(
    z.looseObject({
      segments: z
        .array(
          z.looseObject({
            marketing_carrier: z.looseObject({ iata_code: z.string() }),
            marketing_carrier_flight_number: z.string(),
            departing_at: z.string().min(16),
          }),
        )
        .min(1),
      fare_brand_name: z.string().nullish(),
    }),
  )
  .min(1);

function readSlices(offer: FlightOffer) {
  const result = readableSlices.safeParse(offer.slices);
  return result.success ? result.data : undefined;
}

export function flightKey(offer: FlightOffer): string | undefined {
  return readSlices(offer)
    ?.map((slice) =>
      slice.segments
        .map(
          (segment) =>
            `${segment.marketing_carrier.iata_code}${segment.marketing_carrier_flight_number}@${segment.departing_at.slice(0, 16)}`,
        )
        .join("|"),
    )
    .join(" / ");
}

function fareBrand(offer: FlightOffer): string | null {
  const names = readSlices(offer)?.flatMap((slice) => slice.fare_brand_name ?? []);
  return names?.length ? names.join(" / ") : null;
}

export function findSameFlight(
  original: FlightOffer,
  candidates: FlightOffer[],
): FlightOffer | undefined {
  const key = flightKey(original);
  if (!key) return undefined;
  const sameFlight = candidates.filter(
    (candidate) =>
      candidate.id !== original.id &&
      candidate.total_currency === original.total_currency &&
      flightKey(candidate) === key,
  );
  const originalBrand = fareBrand(original);
  const sameBrand = sameFlight.filter((candidate) => fareBrand(candidate) === originalBrand);
  const pool = sameBrand.length ? sameBrand : sameFlight;
  // Numeric comparison only chooses between fares; the charged amount stays the supplier's string.
  return pool.reduce<FlightOffer | undefined>(
    (cheapest, candidate) =>
      !cheapest || Number(candidate.total_amount) < Number(cheapest.total_amount)
        ? candidate
        : cheapest,
    undefined,
  );
}
