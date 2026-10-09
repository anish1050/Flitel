"use client";

import Image from "next/image";
import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { isNewPage } from "@/lib/navigation";

const FlightNavigation = createContext({
  navigateTo: (_href: string) => {},
  isNavigating: false,
});

export function FlightTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [flightKey, setFlightKey] = useState<number | null>(null);
  const nextFlight = useRef(0);
  const previousUrl = useRef("");

  const animateFlight = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setFlightKey(++nextFlight.current);
  }, []);

  const navigateTo = useCallback(
    (href: string) => {
      if (
        (!href.startsWith("/") && !href.startsWith("#")) ||
        href.startsWith("//")
      )
        return;
      const destination = new URL(href, window.location.origin);
      if (
        destination.href === window.location.href &&
        destination.pathname === "/flights"
      ) {
        router.refresh();
        return;
      }
      if (isNewPage(window.location.href, destination.href)) animateFlight();
      previousUrl.current = destination.href;
      router.push(href);
    },
    [animateFlight, router],
  );

  useEffect(() => {
    previousUrl.current = window.location.href;
    function animateHistoryChange() {
      if (isNewPage(previousUrl.current, window.location.href)) animateFlight();
      previousUrl.current = window.location.href;
    }
    window.addEventListener("popstate", animateHistoryChange);
    return () => window.removeEventListener("popstate", animateHistoryChange);
  }, [animateFlight]);

  useEffect(() => {
    if (flightKey === null) return;
    // Clear the overlay even if the browser interrupts the CSS animation.
    const timeout = window.setTimeout(() => setFlightKey(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [flightKey]);

  return (
    <FlightNavigation.Provider
      value={{ navigateTo, isNavigating: flightKey !== null }}
    >
      {children}
      {flightKey !== null && (
        <div
          key={flightKey}
          className="flight-transition"
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setFlightKey(null);
          }}
        >
          <div className="transition-sky" />
          <div className="transition-trail" />
          <Image
            className="transition-plane"
            src="/images/plane.png"
            alt=""
            width={1774}
            height={887}
            loading="eager"
          />
          <span className="transition-label">Your next chapter awaits.</span>
        </div>
      )}
    </FlightNavigation.Provider>
  );
}

export function useFlightNavigation() {
  return useContext(FlightNavigation);
}

export function FlightLink({
  href,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & {
  href: string;
}) {
  const { navigateTo } = useFlightNavigation();
  const navigate: LinkProps["onNavigate"] = (event) => {
    event.preventDefault();
    navigateTo(href);
  };
  return (
    <Link href={href} prefetch={false} onNavigate={navigate} {...props}>
      {children}
    </Link>
  );
}
