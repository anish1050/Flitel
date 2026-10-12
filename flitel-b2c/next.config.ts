import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hotel photos come from LiteAPI's image host; listing it lets the app resize them instead of sending 3000px originals.
  images: { remotePatterns: [{ protocol: "https", hostname: "static.cupid.travel" }] },
};

export default nextConfig;
