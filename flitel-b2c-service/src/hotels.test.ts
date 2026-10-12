import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLiteapiBook,
  classifyBookResponse,
  hotelBookingRequestSchema,
  normaliseBooking,
  normalisePrebook,
  normaliseRooms,
  prebookRequestSchema,
  roomsStaySchema,
  staySchema,
  summariseHotels,
} from "./hotels.js";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const rate = (changes: Record<string, unknown> = {}) => ({
  rateId: "rate_1",
  name: "Deluxe Room",
  boardName: "Room Only",
  boardType: "RO",
  retailRate: { total: [{ amount: 9000, currency: "INR" }], taxesAndFees: [] },
  cancellationPolicies: {
    cancelPolicyInfos: [
      { cancelTime: "2026-11-10T00:00:00Z", amount: 0, currency: "INR" },
    ],
    refundableTag: "RFN",
  },
  ...changes,
});
const roomType = (
  offerId: string,
  amount: number | undefined,
  rates = [rate()],
) => ({
  offerId,
  rates,
  ...(amount === undefined
    ? {}
    : { offerRetailRate: { amount, currency: "INR" } }),
});
const ratesBody = (changes: Record<string, unknown> = {}) => ({
  data: [
    { hotelId: "lp1", roomTypes: [roomType("o1", 9000), roomType("o2", 7500)] },
  ],
  hotels: [
    {
      id: "lp1",
      name: "Taj Example",
      main_photo: "https://img.example/main.jpg",
      thumbnail: "https://img.example/thumb.jpg",
      address: "1 Marine Drive",
      rating: 8.7,
      stars: 5,
      city_name: "Mumbai",
    },
  ],
  sandbox: true,
  ...changes,
});

describe("summariseHotels", () => {
  it("prices a hotel at its cheapest offer and joins the hotel data", () => {
    expect(summariseHotels(ratesBody())).toEqual([
      {
        id: "lp1",
        name: "Taj Example",
        photo: "https://img.example/main.jpg",
        address: "1 Marine Drive",
        stars: 5,
        rating: 8.7,
        price: { amount: 7500, currency: "INR" },
        refundable: true,
      },
    ]);
  });

  it("is refundable only when every rate of the cheapest offer is", () => {
    const body = ratesBody({
      data: [
        {
          hotelId: "lp1",
          roomTypes: [
            roomType("o1", 5000, [
              rate(),
              rate({
                cancellationPolicies: { cancelPolicyInfos: [], refundableTag: "NRFN" },
              }),
            ]),
            roomType("o2", 8000),
          ],
        },
      ],
    });

    expect(summariseHotels(body)[0].refundable).toBe(false);
  });

  it("sorts by price ascending, keeps the numbers LiteAPI sent, and drops unpriced hotels", () => {
    const body = ratesBody({
      data: [
        { hotelId: "a", roomTypes: [roomType("oa", 12000.5)] },
        { hotelId: "b", roomTypes: [roomType("ob", 4999.99)] },
        { hotelId: "c", roomTypes: [roomType("oc", undefined)] },
        { hotelId: "d", roomTypes: [] },
      ],
      hotels: [],
    });

    expect(summariseHotels(body).map((hotel) => [hotel.id, hotel.price.amount])).toEqual([
      ["b", 4999.99],
      ["a", 12000.5],
    ]);
  });

  it("falls back to the thumbnail and to the name Hotel when hotel data is missing", () => {
    const body = ratesBody({
      data: [
        { hotelId: "lp1", roomTypes: [roomType("o1", 100)] },
        { hotelId: "zz", roomTypes: [roomType("o2", 200)] },
      ],
      hotels: [
        { id: "lp1", name: "Thumb Only", thumbnail: "https://img.example/t.jpg" },
      ],
    });

    const [first, second] = summariseHotels(body);
    expect(first).toMatchObject({ name: "Thumb Only", photo: "https://img.example/t.jpg" });
    expect(second).toMatchObject({ id: "zz", name: "Hotel" });
    expect(second.photo).toBeUndefined();
  });

  it("returns an empty list for an empty data array", () => {
    expect(summariseHotels({ data: [], sandbox: true })).toEqual([]);
  });

  it("fails closed with LITEAPI_INVALID_RESPONSE when the shape is wrong", async () => {
    expect.assertions(2);
    try {
      summariseHotels({ data: "nope" });
    } catch (error) {
      const response = (error as { getResponse(): Response }).getResponse();
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("LITEAPI_INVALID_RESPONSE");
    }
  });

  it("fails closed when a priced room type has no offerId", () => {
    const body = ratesBody({
      data: [{ hotelId: "lp1", roomTypes: [{ offerRetailRate: { amount: 1, currency: "INR" } }] }],
    });

    expect(() => summariseHotels(body)).toThrow();
  });
});

describe("normaliseRooms", () => {
  it("makes one room per room type, cheapest first", () => {
    const { rooms, hotel } = normaliseRooms(ratesBody(), "lp1");

    expect(rooms.map((room) => room.offerId)).toEqual(["o2", "o1"]);
    expect(rooms[0]).toEqual({
      offerId: "o2",
      name: "Deluxe Room",
      boardName: "Room Only",
      refundable: true,
      cancelBefore: "2026-11-10T00:00:00Z",
      price: { amount: 7500, currency: "INR" },
      taxesNotIncluded: [],
    });
    expect(hotel).toEqual({
      id: "lp1",
      name: "Taj Example",
      photo: "https://img.example/main.jpg",
      address: "1 Marine Drive",
      stars: 5,
      rating: 8.7,
    });
  });

  it("is not refundable when any rate is not, and gives no cancellation deadline", () => {
    const nonRefundable = rate({
      cancellationPolicies: {
        cancelPolicyInfos: [{ cancelTime: "2026-11-10T00:00:00Z" }],
        refundableTag: "NRFN",
      },
    });
    const body = ratesBody({
      data: [{ hotelId: "lp1", roomTypes: [roomType("o1", 100, [nonRefundable])] }],
    });

    const [room] = normaliseRooms(body, "lp1").rooms;
    expect(room.refundable).toBe(false);
    expect(room.cancelBefore).toBeUndefined();
  });

  it("lists only taxes and fees that are not included in the price", () => {
    const withTaxes = rate({
      retailRate: {
        total: [{ amount: 100, currency: "INR" }],
        taxesAndFees: [
          { included: true, description: "GST", amount: 12, currency: "INR" },
          { included: false, description: "City tax", amount: 250, currency: "INR" },
        ],
      },
    });
    const body = ratesBody({
      data: [{ hotelId: "lp1", roomTypes: [roomType("o1", 100, [withTaxes])] }],
    });

    expect(normaliseRooms(body, "lp1").rooms[0].taxesNotIncluded).toEqual([
      { description: "City tax", amount: 250, currency: "INR" },
    ]);
  });

  it("drops room types without a price", () => {
    const body = ratesBody({
      data: [
        { hotelId: "lp1", roomTypes: [roomType("o1", undefined), roomType("o2", 50)] },
      ],
    });

    expect(normaliseRooms(body, "lp1").rooms.map((room) => room.offerId)).toEqual(["o2"]);
  });

  it("returns no rooms, with whatever hotel data exists, when the hotel has no rates", () => {
    const { rooms, hotel } = normaliseRooms(ratesBody({ data: [] }), "lp1");

    expect(rooms).toEqual([]);
    expect(hotel).toMatchObject({ id: "lp1", name: "Taj Example" });
  });

  it("enriches the hotel from the details response", () => {
    const details = {
      data: {
        id: "lp1",
        name: "Taj Example Palace",
        main_photo: "https://img.example/details.jpg",
        address: "Apollo Bunder",
        starRating: 5,
        rating: 9.1,
        hotelDescription: "<p>Old <b>text</b></p>",
        normalizedDescription: "<p>A seaside <b>landmark</b>.</p><br/>Rooftop pool.",
        hotelImages: Array.from({ length: 10 }, (_, index) => ({
          url: `https://img.example/${index}.jpg`,
          defaultImage: index === 0,
        })),
        hotelFacilities: Array.from({ length: 15 }, (_, index) => `Facility ${index}`),
      },
    };

    const { hotel } = normaliseRooms(ratesBody(), "lp1", details);

    expect(hotel.name).toBe("Taj Example Palace");
    expect(hotel.photo).toBe("https://img.example/details.jpg");
    expect(hotel.description).toBe("A seaside landmark. Rooftop pool.");
    expect(hotel.images).toHaveLength(8);
    expect(hotel.facilities).toHaveLength(12);
    expect(hotel.facilities?.[0]).toBe("Facility 0");
  });

  it("caps the description at 1200 characters", () => {
    const details = { data: { hotelDescription: "x".repeat(5000) } };

    expect(normaliseRooms(ratesBody(), "lp1", details).hotel.description).toHaveLength(1200);
  });

  it("ignores details that do not fit the shape", () => {
    const { hotel } = normaliseRooms(ratesBody(), "lp1", { data: "garbage" });

    expect(hotel).toMatchObject({ id: "lp1", name: "Taj Example" });
    expect(hotel.description).toBeUndefined();
  });

  it("fails closed when the rates body has the wrong shape", () => {
    expect(() => normaliseRooms({ nope: true }, "lp1")).toThrow();
  });
});

describe("stay schemas", () => {
  const stay = (changes: Record<string, unknown> = {}) => ({
    countryCode: "IN",
    cityName: "Mumbai",
    checkin: "2026-11-01",
    checkout: "2026-11-04",
    adults: 2,
    currency: "INR",
    guestNationality: "IN",
    ...changes,
  });

  it("accepts a valid stay", () => {
    expect(staySchema.safeParse(stay()).success).toBe(true);
  });

  it("accepts check-in today", () => {
    expect(staySchema.safeParse(stay({ checkin: "2026-10-12", checkout: "2026-10-13" })).success).toBe(true);
  });

  it.each([
    ["a past check-in", { checkin: "2026-10-11" }],
    ["checkout equal to checkin", { checkout: "2026-11-01" }],
    ["checkout before checkin", { checkout: "2026-10-30" }],
    ["more than 30 nights", { checkout: "2026-12-02" }],
    ["zero adults", { adults: 0 }],
    ["ten adults", { adults: 10 }],
    ["a fractional adult count", { adults: 1.5 }],
    ["a lowercase country code", { countryCode: "in" }],
    ["a three-letter country code", { countryCode: "IND" }],
    ["an empty city", { cityName: "" }],
    ["a very long city", { cityName: "x".repeat(81) }],
    ["a bad currency", { currency: "RUPEE" }],
    ["a bad nationality", { guestNationality: "india" }],
    ["a non-date checkin", { checkin: "tomorrow" }],
  ])("rejects %s", (_name, changes) => {
    expect(staySchema.safeParse(stay(changes)).success).toBe(false);
  });

  it("accepts exactly 30 nights", () => {
    expect(staySchema.safeParse(stay({ checkout: "2026-12-01" })).success).toBe(true);
  });

  it("rooms stay needs no destination but applies the same rules", () => {
    const { countryCode: _c, cityName: _n, ...withoutPlace } = stay();

    expect(roomsStaySchema.safeParse(withoutPlace).success).toBe(true);
    expect(roomsStaySchema.safeParse({ ...withoutPlace, adults: 0 }).success).toBe(false);
    expect(
      roomsStaySchema.safeParse({ ...withoutPlace, checkin: "2026-10-01" }).success,
    ).toBe(false);
  });
});

const prebookBody = (changes: Record<string, unknown> = {}) => ({
  data: {
    prebookId: "pb_123",
    hotelId: "lp1",
    checkin: "2026-11-01",
    checkout: "2026-11-04",
    currency: "INR",
    price: 27000,
    priceDifferencePercent: 0,
    cancellationChanged: false,
    boardChanged: false,
    transactionId: "tr_456",
    secretKey: "secret_789",
    roomTypes: [{ rates: [{ cancellationPolicies: { refundableTag: "RFN" } }] }],
    ...changes,
  },
});

describe("prebookRequestSchema", () => {
  it("accepts an offer id and rejects odd characters or lengths", () => {
    expect(prebookRequestSchema.safeParse({ offerId: "abc_DEF-12=34/+." }).success).toBe(true);
    expect(prebookRequestSchema.safeParse({ offerId: "short" }).success).toBe(false);
    expect(prebookRequestSchema.safeParse({ offerId: "has space in it" }).success).toBe(false);
    expect(prebookRequestSchema.safeParse({ offerId: "x".repeat(4001) }).success).toBe(false);
  });
});

describe("normalisePrebook", () => {
  it("keeps only what the page needs and derives refundable", () => {
    expect(normalisePrebook(prebookBody())).toEqual({
      prebookId: "pb_123",
      transactionId: "tr_456",
      secretKey: "secret_789",
      hotelId: "lp1",
      checkin: "2026-11-01",
      checkout: "2026-11-04",
      price: { amount: 27000, currency: "INR" },
      priceDifferencePercent: 0,
      cancellationChanged: false,
      boardChanged: false,
      refundable: true,
    });
  });

  it("is not refundable when any rate is non-refundable or there are none", () => {
    const mixed = prebookBody({
      roomTypes: [
        { rates: [{ cancellationPolicies: { refundableTag: "RFN" } }] },
        { rates: [{ cancellationPolicies: { refundableTag: "NRFN" } }] },
      ],
    });
    expect(normalisePrebook(mixed).refundable).toBe(false);
    expect(normalisePrebook(prebookBody({ roomTypes: undefined })).refundable).toBe(false);
  });

  it("passes the change flags through", () => {
    const changed = normalisePrebook(
      prebookBody({ priceDifferencePercent: 4.5, cancellationChanged: true, boardChanged: true }),
    );
    expect(changed).toMatchObject({
      priceDifferencePercent: 4.5,
      cancellationChanged: true,
      boardChanged: true,
    });
  });

  it("throws on an incomplete body", () => {
    for (const missing of ["prebookId", "transactionId", "secretKey", "price", "currency"]) {
      expect(() => normalisePrebook(prebookBody({ [missing]: undefined }))).toThrow();
    }
    expect(() => normalisePrebook(null)).toThrow();
    expect(() => normalisePrebook({ data: {} })).toThrow();
  });

  it("throws on ids the book call would reject, before the card form", () => {
    for (const changes of [
      { transactionId: "tr.456" },
      { transactionId: "t".repeat(201) },
      { transactionId: "abc" },
      { prebookId: "pb 123" },
      { prebookId: "p".repeat(101) },
    ]) {
      expect(() => normalisePrebook(prebookBody(changes))).toThrow();
    }
  });
});

const holder = {
  firstName: "Priya",
  lastName: "Sharma",
  email: "priya@example.com",
  phone: "+919876543210",
};
const bookingRequest = (changes: Record<string, unknown> = {}) => ({
  attemptId: "7d1f1c0e-2c1f-4c4e-9f33-0f6a2c0b5a11",
  prebookId: "pb_123",
  transactionId: "tr_456",
  expectedTotal: 27000,
  expectedCurrency: "INR",
  holder,
  ...changes,
});

describe("hotelBookingRequestSchema", () => {
  it("accepts a complete request and trims names", () => {
    const parsed = hotelBookingRequestSchema.parse(
      bookingRequest({ holder: { ...holder, firstName: "  Priya " } }),
    );
    expect(parsed.holder.firstName).toBe("Priya");
  });

  it("rejects each invalid field", () => {
    for (const changes of [
      { attemptId: "1" },
      { prebookId: "a b" },
      { transactionId: "x" },
      { expectedTotal: 0 },
      { expectedTotal: "27000" },
      { expectedCurrency: "inr" },
      { holder: { ...holder, firstName: "" } },
      { holder: { ...holder, lastName: "Sharma3" } },
      { holder: { ...holder, email: "nope" } },
      { holder: { ...holder, phone: "9876543210" } },
    ]) {
      expect(hotelBookingRequestSchema.safeParse(bookingRequest(changes)).success).toBe(false);
    }
  });
});

describe("buildLiteapiBook", () => {
  it("builds the LiteAPI book body with the attempt as clientReference", () => {
    const request = hotelBookingRequestSchema.parse(bookingRequest());
    expect(buildLiteapiBook(request)).toEqual({
      prebookId: "pb_123",
      clientReference: "7d1f1c0e-2c1f-4c4e-9f33-0f6a2c0b5a11",
      holder,
      guests: [
        {
          occupancyNumber: 1,
          firstName: "Priya",
          lastName: "Sharma",
          email: "priya@example.com",
        },
      ],
      payment: { method: "TRANSACTION_ID", transactionId: "tr_456" },
    });
  });
});

describe("classifyBookResponse", () => {
  const reply = (status: number, body: unknown) => ({ status, body });
  const error = (code: number) => ({ error: { code, description: "x", message: "x" } });
  const confirmed = { data: { bookingId: "bk_1", status: "CONFIRMED" }, sandbox: true };

  it("confirms only a 200 CONFIRMED with a booking id", () => {
    expect(classifyBookResponse(reply(200, confirmed))).toEqual({
      kind: "confirmed",
      bookingId: "bk_1",
    });
    expect(
      classifyBookResponse(reply(200, { data: { bookingId: "bk_1", status: "CONFIRMED" } })),
    ).toEqual({ kind: "confirmed", bookingId: "bk_1" });
  });

  it("treats a 200 that is not a clear confirmation as unknown", () => {
    for (const body of [
      { data: { bookingId: "bk_1", status: "PENDING" } },
      { data: { bookingId: "", status: "CONFIRMED" } },
      { data: { status: "CONFIRMED" } },
      { data: { bookingId: 12, status: "CONFIRMED" } },
      null,
      "not json",
    ]) {
      expect(classifyBookResponse(reply(200, body))).toEqual({ kind: "unknown" });
    }
  });

  it("never confirms a response from live mode", () => {
    expect(classifyBookResponse(reply(200, { ...confirmed, sandbox: false }))).toEqual({
      kind: "unknown",
    });
  });

  it("rejects only on a 400 with an invalid-request code", () => {
    for (const code of [4000, 4002, 4003, 4010]) {
      expect(classifyBookResponse(reply(400, error(code)))).toEqual({ kind: "rejected" });
    }
    expect(classifyBookResponse(reply(400, { error: { code: "4003" } }))).toEqual({
      kind: "rejected",
    });
  });

  it("reports an unavailable room on 410 or codes 4012 and 2013", () => {
    expect(classifyBookResponse(reply(410, error(4012)))).toEqual({ kind: "room-unavailable" });
    expect(classifyBookResponse(reply(410, null))).toEqual({ kind: "room-unavailable" });
    expect(classifyBookResponse(reply(400, error(2013)))).toEqual({ kind: "room-unavailable" });
    expect(classifyBookResponse(reply(400, error(4012)))).toEqual({ kind: "room-unavailable" });
  });

  it("reports an authorisation failure on 401 and 403", () => {
    expect(classifyBookResponse(reply(401, null))).toEqual({ kind: "not-authorised" });
    expect(classifyBookResponse(reply(403, error(4000)))).toEqual({ kind: "not-authorised" });
  });

  it("falls through to unknown for everything unproven", () => {
    expect(classifyBookResponse("unreachable")).toEqual({ kind: "unknown" });
    for (const [status, body] of [
      [500, null],
      [502, "<html>"],
      [503, error(5000)],
      [500, error(4012)],
      [400, error(2014)],
      [400, error(4005)],
      [400, error(5000)],
      [400, null],
      [404, null],
      [429, null],
      [201, confirmed],
      [200, error(2013)],
      [201, error(4012)],
      [502, error(2013)],
      [404, error(4012)],
      [409, error(2013)],
      [429, error(4012)],
      [302, error(2013)],
    ] as const) {
      expect(classifyBookResponse(reply(status, body))).toEqual({ kind: "unknown" });
    }
  });
});

describe("normaliseBooking", () => {
  const stored = {
    data: {
      bookingId: "bk_1",
      status: "CONFIRMED",
      clientReference: "7d1f1c0e-2c1f-4c4e-9f33-0f6a2c0b5a11",
      hotelConfirmationCode: "HC-9",
      hotel: { hotelId: "lp1", name: "Taj Example" },
      checkin: "2026-11-01",
      checkout: "2026-11-04",
      holder,
      price: 27000,
      currency: "INR",
      cancellationPolicies: {
        refundableTag: "RFN",
        cancelPolicyInfos: [
          { cancelTime: "2026-10-30T00:00:00Z", amount: 0, currency: "INR", timezone: "UTC" },
        ],
      },
      bookedRooms: [{ roomType: { name: "Deluxe" } }],
      createdAt: "2026-10-12T09:00:00Z",
    },
  };

  it("returns the confirmation fields without phone or client reference", () => {
    const booking = normaliseBooking(stored);
    expect(booking).toEqual({
      bookingId: "bk_1",
      status: "CONFIRMED",
      hotel: { id: "lp1", name: "Taj Example" },
      checkin: "2026-11-01",
      checkout: "2026-11-04",
      holder: { firstName: "Priya", lastName: "Sharma", email: "priya@example.com" },
      price: 27000,
      currency: "INR",
      cancellation: {
        refundableTag: "RFN",
        cancelPolicyInfos: [{ cancelTime: "2026-10-30T00:00:00Z", amount: 0, currency: "INR" }],
      },
      hotelConfirmationCode: "HC-9",
    });
    expect(JSON.stringify(booking)).not.toMatch(/9876543210|7d1f1c0e/);
  });

  it("tolerates missing cancellation terms and confirmation code", () => {
    const { cancellationPolicies: _c, hotelConfirmationCode: _h, ...rest } = stored.data;
    const booking = normaliseBooking({ data: rest });
    expect(booking.cancellation).toEqual({ cancelPolicyInfos: [] });
    expect(booking.hotelConfirmationCode).toBeUndefined();
  });

  it("throws when the booking id or price is missing", () => {
    expect(() => normaliseBooking({ data: { ...stored.data, bookingId: undefined } })).toThrow();
    expect(() => normaliseBooking({ data: { ...stored.data, price: undefined } })).toThrow();
    expect(() => normaliseBooking(null)).toThrow();
  });
});
