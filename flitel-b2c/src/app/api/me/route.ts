import { callBackend, sessionCookieName } from "@/lib/backend-headers";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const result = await callBackend("/api/me", { method: "GET" });
  return Response.json(result.body, { status: result.status, headers: noStore });
}

// Deleting saved details also ends the session, so nothing is left behind in this browser.
export async function DELETE() {
  const result = await callBackend("/api/me", { method: "DELETE" });
  const headers = new Headers(noStore);
  if (result.status === 200)
    headers.append("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return Response.json(result.body, { status: result.status, headers });
}
