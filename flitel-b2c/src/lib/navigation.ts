export function isNewPage(currentUrl: string, nextUrl: string): boolean {
  const current = new URL(currentUrl);
  const next = new URL(nextUrl, currentUrl);
  return current.pathname + current.search !== next.pathname + next.search;
}
