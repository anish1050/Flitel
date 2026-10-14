import type { Metadata } from "next";
import Image from "next/image";
import {
  BadgeCheck,
  CircleDollarSign,
  Compass,
  FileText,
  Hotel,
  LockKeyhole,
  MailCheck,
  Plane,
  Search,
  ShieldCheck,
} from "lucide-react";
import { FlightLink } from "@/components/flight-transition";

export const metadata: Metadata = {
  title: "Why TripKnot",
  description:
    "Flights and stays in one place, with the total shown before you pay and no password to remember.",
};

const reasons = [
  {
    icon: Compass,
    tone: "blue",
    title: "One place for the whole trip",
    text: "Search flights and hotels side by side, in one checkout, with the same details reused.",
  },
  {
    icon: CircleDollarSign,
    tone: "peach",
    title: "The total, before you commit",
    text: "Fares and room prices include taxes. We re-check the price right before you book and tell you if it moved.",
  },
  {
    icon: MailCheck,
    tone: "mint",
    title: "No password to remember",
    text: "Confirm your email with a 6-digit code or Google. That is the whole sign-up.",
  },
  {
    icon: FileText,
    tone: "blue",
    title: "Rules in plain words",
    text: "Refund and change conditions are shown on the review step, before you confirm anything.",
  },
  {
    icon: LockKeyhole,
    tone: "peach",
    title: "Card details stay with the processor",
    text: "Hotel card details are typed into our payment partner's secure form. They never touch TripKnot's servers.",
  },
  {
    icon: ShieldCheck,
    tone: "mint",
    title: "Your details are yours",
    text: "We only save your name and mobile if you tick the box, and you can delete them from the same screen.",
  },
] as const;

const steps = [
  { icon: Search, title: "Search", text: "Pick a route or a city and your dates. Results show the price for the whole stay or trip." },
  { icon: BadgeCheck, title: "Choose", text: "Compare fares and rooms, read the rules, and pick the one that fits." },
  { icon: MailCheck, title: "Confirm", text: "Verify your email, review the details once more, and book without leaving TripKnot." },
] as const;

const faqs = [
  {
    question: "Is TripKnot an airline or a hotel?",
    answer:
      "No. TripKnot is a booking platform. Flights and rooms come from airline and hotel distribution partners, and the airline or hotel provides the service itself.",
  },
  {
    question: "Are real bookings being made right now?",
    answer:
      "Not yet. TripKnot is running in test mode: flights and hotels come from test environments, so no real tickets or rooms are booked and no real money moves. This page will change when that does.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No password and no sign-up form. At checkout you confirm your email with a 6-digit code, or continue with Google, and that is it.",
  },
  {
    question: "When do I enter my card?",
    answer:
      "At the very end, after you have reviewed the details. For hotels the card is typed into a secure form from our payment partner, so the card number is never handled by TripKnot.",
  },
  {
    question: "Is the price I see the price I pay?",
    answer:
      "Prices include taxes. Because fares and rooms change, we check the price again right before booking. If it changed, we show the new total and ask you to confirm it.",
  },
  {
    question: "Can I cancel or change a booking?",
    answer:
      "It depends on the fare or room. The refund and change conditions are shown on the review step, before you confirm, and they are the ones that apply.",
  },
  {
    question: "What if I paid but did not see a confirmation?",
    answer:
      "Keep the booking reference shown on screen. If the outcome is not clear we show a checking state and never book the same payment twice, so retrying or reloading is safe.",
  },
  {
    question: "What do you do with my details?",
    answer:
      "Your email is used to send your code and booking updates. Your name and mobile are saved only if you choose to, and you can delete them at any time from the checkout screen.",
  },
] as const;

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function WhyTripKnotPage() {
  return (
    <main id="main">
      <section className="hero hero-stay" aria-labelledby="why-title">
        <Image
          src="/images/santorini-hero.png"
          alt=""
          fill
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          className="hero-image"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="eyebrow hero-eyebrow">
            <span /> WHY TRIPKNOT
          </span>
          <h1 id="why-title">Travel, tied together.</h1>
          <p>Flights and stays in one place, with the total shown before you pay.</p>
        </div>
      </section>

      <section className="why-section page-width" aria-labelledby="why-reasons">
        <div className="section-heading">
          <div>
            <span className="eyebrow">WHAT YOU GET</span>
            <h2 id="why-reasons">Less to figure out, more to look forward to.</h2>
          </div>
        </div>
        <div className="why-grid">
          {reasons.map(({ icon: Icon, tone, title, text }) => (
            <article className="why-card" key={title}>
              <span className={`trust-icon ${tone}`}>
                <Icon />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="why-section page-width" aria-labelledby="why-steps">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HOW IT WORKS</span>
            <h2 id="why-steps">Three steps from idea to booked.</h2>
          </div>
        </div>
        <ol className="why-steps">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <li key={title}>
              <span className="why-step-number">{index + 1}</span>
              <Icon size={22} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="why-section page-width" id="faq" aria-labelledby="why-faq">
        <div className="section-heading">
          <div>
            <span className="eyebrow">QUESTIONS</span>
            <h2 id="why-faq">Good to know before you book.</h2>
          </div>
        </div>
        <div className="faq-list">
          {faqs.map(({ question, answer }) => (
            <details className="faq-item" key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="journey-banner page-width why-cta">
        <div>
          <span className="eyebrow">READY WHEN YOU ARE.</span>
          <h2>Where to first?</h2>
          <p>Start with a flight or a place to stay. Everything else follows.</p>
          <div className="why-cta-buttons">
            <FlightLink className="button button-dark" href="/">
              Find a flight <Plane size={17} />
            </FlightLink>
            <FlightLink className="button button-blue" href="/hotels">
              Find a stay <Hotel size={17} />
            </FlightLink>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        // The data is a constant defined above, never user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </main>
  );
}
