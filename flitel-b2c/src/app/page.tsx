import Image from "next/image";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleDollarSign,
  Compass,
  Headphones,
  MapPin,
  Plane,
  Sparkles,
} from "lucide-react";
import { FlightSearchForm } from "@/components/flight-search";
import { FlightLink } from "@/components/flight-transition";
import { buildSearchQuery, createDefaultSearch } from "@/lib/flights";
import { hasFlightBackend } from "@/lib/flight-api";

export const dynamic = "force-dynamic";

const destinations = [
  {
    city: "Dubai",
    country: "United Arab Emirates",
    code: "DXB",
    image: "dubai.jpg",
    label: "A city with no limits",
    className: "destination-dubai",
  },
  {
    city: "Goa",
    country: "India",
    code: "GOI",
    image: "goa.jpg",
    label: "Take the slower route",
    className: "destination-goa",
  },
  {
    city: "Santorini",
    country: "Greece",
    code: "JTR",
    image: "santorini-hero.png",
    label: "Chase the golden hour",
    className: "destination-santorini",
  },
  {
    city: "Singapore",
    country: "Singapore",
    code: "SIN",
    image: "singapore.jpg",
    label: "Something around every corner",
    className: "destination-singapore",
  },
];

export default function Home() {
  const initialSearch = createDefaultSearch();
  return (
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <Image
          src="/images/santorini-hero.png"
          alt="Blue domes overlooking the Aegean Sea in Santorini at sunset"
          fill
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          className="hero-image"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="eyebrow hero-eyebrow">
            <span /> THE WORLD IS CALLING
          </span>
          <h1 id="hero-title">
            Good things
            <br />
            come to those
            <br className="mobile-break" /> who <em>fly.</em>
          </h1>
          <p>New places. New perspectives. Your next chapter starts here.</p>
          <span className="hero-location">
            <MapPin size={14} /> Oia, Santorini{" "}
            <span>36.4618° N · 25.3753° E</span>
          </span>
        </div>
        <div className="hero-index">
          <span>01</span>
          <div />
          <span>YOUR NEXT CHAPTER</span>
        </div>
      </section>

      <div className="home-search page-width">
        <div className="search-tab">
          <Plane size={17} /> Let’s find your flight
        </div>
        <FlightSearchForm initialSearch={initialSearch} />
        <p className="search-footnote">
          <Sparkles size={13} />{" "}
          {hasFlightBackend()
            ? "Explore Duffel test flights. No payments or bookings."
            : "Try the experience with sample flights. No payments or bookings."}
        </p>
      </div>

      <section
        className="trust-strip page-width"
        id="travel-made-simple"
        aria-label="Travel made simple"
      >
        <div>
          <span className="trust-icon blue">
            <Compass />
          </span>
          <span>
            <strong>A world of possibilities</strong>
            <small>Start with a place. Find your way.</small>
          </span>
        </div>
        <div>
          <span className="trust-icon peach">
            <CircleDollarSign />
          </span>
          <span>
            <strong>Every detail, upfront</strong>
            <small>Compare fares, bags and flight times.</small>
          </span>
        </div>
        <div>
          <span className="trust-icon mint">
            <BadgeCheck />
          </span>
          <span>
            <strong>Your journey, your choice</strong>
            <small>A little less planning. A little more going.</small>
          </span>
        </div>
      </section>

      <section id="destinations" className="destinations page-width">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A CHANGE OF SCENERY</span>
            <h2>Where will you go next?</h2>
            <p>A few places worth putting your out-of-office on for.</p>
          </div>
          <span className="section-caption">
            Pick a place. We’ll find the way. <ArrowUpRight size={20} />
          </span>
        </div>
        <div className="destination-grid">
          {destinations.map((destination) => (
            <FlightLink
              className={`destination-card ${destination.className}`}
              key={destination.code}
              href={`/flights?${buildSearchQuery({ ...initialSearch, to: destination.code })}`}
            >
              <Image
                src={`/images/${destination.image}`}
                alt={`${destination.city}, ${destination.country}`}
                fill
                sizes="(max-width: 600px) 80vw, (max-width: 900px) 45vw, 25vw"
              />
              <span className="destination-code">{destination.code}</span>
              <div className="destination-copy">
                <span>{destination.country}</span>
                <h3>{destination.city}</h3>
                <p>{destination.label}</p>
              </div>
              <span className="destination-arrow">
                <ArrowUpRight size={20} />
              </span>
            </FlightLink>
          ))}
        </div>
      </section>

      <section className="journey-banner page-width">
        <div>
          <span className="eyebrow">LESS SCROLLING. MORE SOARING.</span>
          <h2>
            The best part of a trip?
            <br />
            Knowing it’s on the horizon.
          </h2>
          <p>Find a flight that fits the way you want to travel.</p>
          <FlightLink className="button button-dark" href="#main">
            Find your next flight <Plane size={17} />
          </FlightLink>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span className="orbital-ring" />
          <span className="orbital-ring second" />
          <Image src="/images/plane.png" alt="" width={680} height={340} />
          <span className="boarding-caption">READY WHEN YOU ARE.</span>
        </div>
      </section>
      <div className="closing-line page-width">
        <Headphones size={18} />
        <span>
          Built around the journey, from the first search to the final landing.
        </span>
      </div>
    </main>
  );
}
