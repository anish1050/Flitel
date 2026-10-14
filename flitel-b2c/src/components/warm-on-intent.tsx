"use client";

import { useRef } from "react";
import type { ReactNode } from "react";

/**
 * Asks the server to fetch a hotel's rooms the moment someone shows intent (hover, focus, touch),
 * so the click that follows finds them already loaded. One request per card, and it goes through
 * the same per-visitor rate limit as any other call.
 */
export function WarmOnIntent({
  url,
  className,
  children,
}: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  const warmed = useRef(false);
  const warm = () => {
    if (warmed.current) return;
    warmed.current = true;
    void fetch(url, { cache: "no-store" }).catch(() => undefined);
  };
  return (
    <li className={className} onPointerEnter={warm} onFocus={warm} onTouchStart={warm}>
      {children}
    </li>
  );
}
