import type { Metadata } from "next";
import { FlightTransition } from "@/components/flight-transition";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Flitel — Find your next takeoff",
    template: "%s | Flitel",
  },
  description:
    "Explore the first Flitel flight experience. Find a destination, compare sample flights and preview your journey.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <FlightTransition>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <SiteHeader />
          {children}
          <SiteFooter />
        </FlightTransition>
      </body>
    </html>
  );
}
