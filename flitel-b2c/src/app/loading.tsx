import { Plane } from "lucide-react";

export default function Loading() {
  return (
    <main id="main" className="loading-page" role="status">
      <Plane size={32} />
      <p>Getting your journey ready…</p>
    </main>
  );
}
