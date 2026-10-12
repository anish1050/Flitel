// Shown the instant a hotel is chosen, while its rooms are fetched.
export default function Loading() {
  return (
    <main id="main" className="details-page page-width" aria-busy="true" aria-label="Loading the hotel">
      <div className="hotel-skeleton-hero" />
      <div className="hotel-skeleton-rooms">
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
        <ul className="hotel-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <li className="hotel-card hotel-card-skeleton" key={index}>
              <span className="skeleton-photo" />
              <span className="skeleton-line" />
              <span className="skeleton-line short" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
