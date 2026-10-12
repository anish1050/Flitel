import { Compass, Globe2, Sparkles } from "lucide-react";
import { FlightLink } from "./flight-transition";
import { hasFlightBackend } from "@/lib/flight-api";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <FlightLink className="brand" href="/" aria-label="TripKnot home">
          <Compass size={29} strokeWidth={2.5} />
          <span>
            tripknot<span className="brand-dot">.</span>
          </span>
        </FlightLink>
        <nav aria-label="Main navigation">
          <FlightLink className="nav-link" href="/">
            Flights
          </FlightLink>
          <FlightLink className="nav-link" href="/hotels">
            Hotels
          </FlightLink>
          <FlightLink className="nav-link" href="/#travel-made-simple">
            Why TripKnot
          </FlightLink>
        </nav>
        <div className="header-actions">
          <span className="currency">
            <Globe2 size={16} /> EN
            {!hasFlightBackend() && (
              <>
                <span className="divider">|</span> INR
              </>
            )}
          </span>
          <span className="demo-tag">
            <Sparkles size={13} />{" "}
            {hasFlightBackend() ? "Test flights" : "Flight preview"}
          </span>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <FlightLink className="brand" href="/">
          <Compass size={24} />
          <span>tripknot.</span>
        </FlightLink>
        <p>A little closer to somewhere new.</p>
      </div>
      <p className="demo-disclaimer">
        {hasFlightBackend()
          ? "Duffel test mode. Fares and schedules may be unrealistic."
          : "An early look at TripKnot. All fares and schedules are examples."}
        <br />
        {hasFlightBackend()
          ? "Test bookings run in test mode for flights and hotels. No real tickets or rooms are booked."
          : "No payments or bookings are available in this preview."}
      </p>
      <a
        className="photo-credits"
        href="/images/SOURCES.md"
        target="_blank"
        rel="noreferrer"
      >
        Photo credits
      </a>
    </footer>
  );
}
