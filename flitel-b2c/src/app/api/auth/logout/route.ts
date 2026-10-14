import { sessionCookieName } from "@/lib/backend-headers";

export async function POST() {
  return Response.json(
    { data: { signedOut: true } },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    },
  );
}
