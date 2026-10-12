import { FlightLink } from "./flight-transition";

export function HotelsUnavailable() {
  return (
    <main id="main" className="empty-state page-width">
      <h1>Hotels are not available yet.</h1>
      <p>Hotel search will appear here once it is connected. Flights are available now.</p>
      <FlightLink href="/" className="button button-blue">
        Search flights
      </FlightLink>
    </main>
  );
}
