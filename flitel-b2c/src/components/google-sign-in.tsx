"use client";

import { useEffect, useRef } from "react";

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const scriptUrl = "https://accounts.google.com/gsi/client";
export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

function loadGoogleScript(): Promise<GoogleIdentity | undefined> {
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve) => {
    const script =
      document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`) ??
      Object.assign(document.createElement("script"), { src: scriptUrl, async: true });
    script.addEventListener("load", () => resolve(window.google));
    script.addEventListener("error", () => resolve(undefined));
    if (!script.isConnected) document.head.append(script);
  });
}

/** Renders Google's own button; renders nothing when no client ID is configured. */
export function GoogleSignIn({ onCredential }: { onCredential: (credential: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  // The callback is registered once, so it reads the latest handler through a ref.
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    if (!googleClientId) return;
    let current = true;
    void loadGoogleScript().then((google) => {
      if (!current || !google || !container.current) return;
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: ({ credential }) => latest.current(credential),
      });
      google.accounts.id.renderButton(container.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 280,
      });
    });
    return () => {
      current = false;
    };
  }, []);

  if (!googleClientId) return null;
  return <div ref={container} className="google-sign-in" />;
}
