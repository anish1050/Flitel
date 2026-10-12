"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/flights";
import { buildHotelReturnUrl } from "@/lib/hotel-checkout";
import type { Prebook } from "@/lib/hotels";

declare global {
  interface Window {
    LiteAPIPayment?: new (options: {
      publicKey: string;
      secretKey: string;
      returnUrl: string;
      targetElement: string;
      appearance: { theme: string };
      options: { business: { name: string } };
    }) => { handlePayment: () => unknown };
  }
}

const sdkUrl = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
const sdkTimeoutMs = 15_000;
// Once the form is live the customer may have been charged, so this wording never says otherwise.
const paymentErrorMessage =
  "Something went wrong with the card form. If you were charged, you will be contacted with your reference — otherwise try again.";

let sdkLoading: Promise<void> | undefined;

function loadPaymentSdk(): Promise<void> {
  if (window.LiteAPIPayment) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      sdkLoading = undefined;
      reject(new Error("The card form couldn’t load."));
    };
    const timer = setTimeout(fail, sdkTimeoutMs);
    script.src = sdkUrl;
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return sdkLoading;
}

export function CardForm({
  prebook,
  attemptId,
  onLoadFailed,
}: {
  prebook: Prebook;
  attemptId: string;
  onLoadFailed: () => void;
}) {
  const [problem, setProblem] = useState<string>();
  const loadFailed = useRef(onLoadFailed);
  useEffect(() => {
    loadFailed.current = onLoadFailed;
  });

  useEffect(() => {
    // A slow script load from a replaced attempt must not mount its stale keys into the new form.
    let cancelled = false;
    async function mount() {
      let payment: { handlePayment: () => unknown };
      try {
        await loadPaymentSdk();
        if (cancelled) return;
        payment = new window.LiteAPIPayment!({
          publicKey: "sandbox",
          secretKey: prebook.secretKey,
          returnUrl: buildHotelReturnUrl(window.location.origin, {
            attemptId,
            prebookId: prebook.prebookId,
            transactionId: prebook.transactionId,
          }),
          targetElement: "#hotel-payment",
          appearance: { theme: "flat" },
          options: { business: { name: "Flitel" } },
        });
      } catch {
        if (!cancelled) loadFailed.current();
        return;
      }
      try {
        await payment.handlePayment();
      } catch {
        if (!cancelled) setProblem(paymentErrorMessage);
      }
    }
    void mount();
    return () => {
      cancelled = true;
    };
  }, [attemptId, prebook]);

  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>Pay by card</span>
        <span>Total {formatPrice(prebook.price.amount, prebook.price.currency)}</span>
      </div>
      <div className="itinerary-body">
        <p className="price-notice">
          Test mode: use card 4242 4242 4242 4242, any CVV, any future expiry.
        </p>
        {problem && (
          <p className="booking-problem" role="alert">
            {problem}
          </p>
        )}
        <div id="hotel-payment" />
      </div>
    </section>
  );
}
