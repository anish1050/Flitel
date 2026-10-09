import { Plane } from "lucide-react";
import { FlightLink } from "@/components/flight-transition";

export default function NotFound() {
  return (
    <main id="main" className="empty-state page-width">
      <Plane size={36} />
      <h1>This flight has flown.</h1>
      <p>Let’s find your way back to a new journey.</p>
      <FlightLink className="button button-blue" href="/">
        Back to flight search
      </FlightLink>
    </main>
  );
}
