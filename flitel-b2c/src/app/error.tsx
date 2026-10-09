"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="empty-state page-width">
      <h1>Something interrupted this journey.</h1>
      <p>Please try loading the page again.</p>
      <button className="button button-blue" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
