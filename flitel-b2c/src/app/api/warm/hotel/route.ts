import { formatCalendarDate } from "@/lib/flights";
import { fetchHotelRooms } from "@/lib/hotel-api";
import { parseStayParams } from "@/lib/hotels";

// Fills the API's short-lived room cache ahead of a click. It never returns data, and a failure is silent.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hotelId = searchParams.get("hotelId") ?? "";
  try {
    const stay = parseStayParams(Object.fromEntries(searchParams), formatCalendarDate(new Date()));
    await fetchHotelRooms(hotelId, stay);
  } catch {
    // Warming is best effort.
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
