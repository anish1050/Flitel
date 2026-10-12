import type { Metadata } from "next";
import { Suspense } from "react";
import { HotelComplete } from "@/components/hotel-complete";
import { HotelsUnavailable } from "@/components/hotels-unavailable";
import { hasFlightBackend } from "@/lib/flight-api";

export const metadata: Metadata = { title: "Confirming your booking" };

export default function HotelPaymentReturn() {
  if (!hasFlightBackend()) return <HotelsUnavailable />;
  return (
    <main id="main" className="details-page page-width">
      <Suspense>
        <HotelComplete />
      </Suspense>
    </main>
  );
}
