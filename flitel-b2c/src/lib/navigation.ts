export function isNewPage(currentUrl: string, nextUrl: string): boolean {
  const current = new URL(currentUrl);
  const next = new URL(nextUrl, currentUrl);
  return current.pathname + current.search !== next.pathname + next.search;
}

const hotelPathPattern = /^\/(hotels|hotel-bookings)(\/|$)/;

// The plane belongs to flight journeys; hotel pages get no transition until they have their own.
export function shouldAnimateFlight(currentUrl: string, nextUrl: string): boolean {
  const next = new URL(nextUrl, currentUrl);
  const isHotelJourney =
    hotelPathPattern.test(new URL(currentUrl).pathname) || hotelPathPattern.test(next.pathname);
  return !isHotelJourney && isNewPage(currentUrl, nextUrl);
}
