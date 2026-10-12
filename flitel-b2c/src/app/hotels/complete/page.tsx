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
      <div className="details-title">
        <div>
          <span className="eyebrow">PAYMENT RECEIVED</span>
          <h1>Your hotel booking</h1>
        </div>
      </div>
      <Suspense>
        <HotelComplete />
      </Suspense>
    </main>
  );
}
