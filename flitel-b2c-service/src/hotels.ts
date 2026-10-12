import { z } from "zod";
import { raiseApiError } from "./duffel.js";
import { assertSandbox, liteapiErrorCode } from "./liteapi.js";
import type { LiteapiResult } from "./liteapi.js";

const maxNights = 30;
const stayFields = {
  checkin: z.iso.date("Choose a valid check-in date."),
  checkout: z.iso.date("Choose a valid check-out date."),
  adults: z.number().int().min(1).max(9),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  guestNationality: z
    .string()
    .regex(/^[A-Z]{2}$/, "Use a two-letter nationality code."),
};

function checkStayDates(
  stay: { checkin: string; checkout: string },
  context: z.core.$RefinementCtx<{ checkin: string; checkout: string }>,
) {
  if (stay.checkin < new Date().toISOString().slice(0, 10)) {
    context.addIssue({
      code: "custom",
      path: ["checkin"],
      message: "Check-in must be today or later.",
    });
  }
  if (stay.checkout <= stay.checkin) {
    context.addIssue({
      code: "custom",
      path: ["checkout"],
      message: "Check-out must be after check-in.",
    });
    return;
  }
  const nights = (Date.parse(stay.checkout) - Date.parse(stay.checkin)) / 86_400_000;
  if (nights > maxNights) {
    context.addIssue({
      code: "custom",
      path: ["checkout"],
      message: `Stays are limited to ${maxNights} nights.`,
    });
  }
}

export const staySchema = z
  .object({
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/, "Use a two-letter country code."),
    cityName: z.string().min(1, "Enter a city.").max(80, "City name is too long."),
    ...stayFields,
  })
  .superRefine(checkStayDates);
export const roomsStaySchema = z.object(stayFields).superRefine(checkStayDates);

export type Stay = z.infer<typeof staySchema>;

export type Price = { amount: number; currency: string };
export type HotelSummary = {
  id: string;
  name: string;
  photo?: string;
  address?: string;
  stars?: number;
  rating?: number;
  price: Price;
  refundable: boolean;
};
export type Room = {
  offerId: string;
  name: string;
  boardName?: string;
  refundable: boolean;
  cancelBefore?: string;
  price: Price;
  taxesNotIncluded: { description: string; amount: number; currency: string }[];
};
export type HotelDetail = {
  id: string;
  name: string;
  photo?: string;
  address?: string;
  stars?: number;
  rating?: number;
  description?: string;
  images?: string[];
  facilities?: string[];
};

// Display-only fields fall back to undefined; the fields a price or an offer id depends on stay strict.
const optionalString = z.string().optional().catch(undefined);
const optionalNumber = z.number().optional().catch(undefined);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const money = z.looseObject({ amount: z.number(), currency: currencyCode });
const rateSchema = z.looseObject({
  name: optionalString,
  boardName: optionalString,
  retailRate: z
    .looseObject({
      taxesAndFees: z
        .array(
          z.looseObject({
            included: z.boolean().optional(),
            description: optionalString,
            amount: z.number(),
            currency: currencyCode,
          }),
        )
        .nullish(),
    })
    .nullish(),
  cancellationPolicies: z
    .looseObject({
      refundableTag: optionalString,
      cancelPolicyInfos: z
        .array(z.looseObject({ cancelTime: optionalString, timezone: optionalString }))
        .nullish(),
    })
    .nullish(),
});
const roomTypeSchema = z.looseObject({
  offerId: z.string().min(1),
  offerRetailRate: money.nullish(),
  rates: z.array(rateSchema).nullish(),
});
const hotelInfoSchema = z.looseObject({
  id: z.string(),
  name: optionalString,
  main_photo: optionalString,
  thumbnail: optionalString,
  address: optionalString,
  stars: optionalNumber,
  rating: optionalNumber,
});
const ratesResponseSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      hotelId: z.string(),
      roomTypes: z.array(roomTypeSchema).nullish(),
    }),
  ),
  hotels: z.array(hotelInfoSchema).nullish(),
});
const hotelDetailsSchema = z.looseObject({
  data: z.looseObject({
    name: optionalString,
    main_photo: optionalString,
    address: optionalString,
    starRating: optionalNumber,
    rating: optionalNumber,
    hotelDescription: optionalString,
    normalizedDescription: optionalString,
    hotelImages: z
      .array(z.looseObject({ url: optionalString }))
      .optional()
      .catch(undefined),
    hotelFacilities: z.array(z.string()).optional().catch(undefined),
  }),
});

type RoomType = z.infer<typeof roomTypeSchema>;
type HotelInfo = z.infer<typeof hotelInfoSchema>;

function parseRates(raw: unknown) {
  const parsed = ratesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    raiseApiError(
      502,
      "LITEAPI_INVALID_RESPONSE",
      "The hotel supplier returned an invalid response. Please try again.",
    );
  }
  return parsed.data;
}

type PricedRoomType = RoomType & { offerRetailRate: Price };
const isPriced = (roomType: RoomType): roomType is PricedRoomType =>
  Boolean(roomType.offerRetailRate);
const toPrice = ({ amount, currency }: Price): Price => ({ amount, currency });

function allRatesRefundable(roomType: RoomType): boolean {
  const rates = roomType.rates ?? [];
  return (
    rates.length > 0 &&
    rates.every((rate) => rate.cancellationPolicies?.refundableTag === "RFN")
  );
}

export function summariseHotels(raw: unknown): HotelSummary[] {
  const { data, hotels } = parseRates(raw);
  const hotelInfo = new Map<string, HotelInfo>(
    (hotels ?? []).map((hotel) => [hotel.id, hotel]),
  );

  return data
    .flatMap((entry) => {
      const cheapest = (entry.roomTypes ?? [])
        .filter(isPriced)
        .reduce<PricedRoomType | undefined>(
          (best, roomType) =>
            !best || roomType.offerRetailRate.amount < best.offerRetailRate.amount
              ? roomType
              : best,
          undefined,
        );
      if (!cheapest) return [];
      const info = hotelInfo.get(entry.hotelId);
      return [
        {
          id: entry.hotelId,
          name: info?.name || "Hotel",
          photo: info?.main_photo || info?.thumbnail,
          address: info?.address,
          stars: info?.stars,
          rating: info?.rating,
          price: toPrice(cheapest.offerRetailRate),
          refundable: allRatesRefundable(cheapest),
        },
      ];
    })
    .sort((a, b) => a.price.amount - b.price.amount);
}

const CANCEL_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i;
const UTC_ZONE = /^(GMT|UTC)(\+0{1,2}:?0{2})?$/i;

// LiteAPI sends zone-less local times next to a separate `timezone` field.
// Only zones we can prove are UTC are converted; anything else is unknown, never guessed.
export function cancelTimeToUtcIso(cancelTime?: string, timezone?: string): string | undefined {
  const match = cancelTime?.trim().match(CANCEL_TIME);
  if (!match) return undefined;
  const [, day, time, designator] = match;
  if (!designator && timezone && !UTC_ZONE.test(timezone.trim())) return undefined;
  const parsed = new Date(`${day}T${time}${designator ?? "Z"}`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().replace(".000Z", "Z");
}

function firstCancelTimeUtc(rate?: z.infer<typeof rateSchema>): string | undefined {
  const info = rate?.cancellationPolicies?.cancelPolicyInfos?.[0];
  return cancelTimeToUtcIso(info?.cancelTime, info?.timezone);
}

function toRoom(roomType: PricedRoomType): Room {
  const rates = roomType.rates ?? [];
  const refundable = allRatesRefundable(roomType);
  return {
    offerId: roomType.offerId,
    name: rates[0]?.name || "Room",
    boardName: rates[0]?.boardName,
    refundable,
    cancelBefore: refundable ? firstCancelTimeUtc(rates[0]) : undefined,
    price: toPrice(roomType.offerRetailRate),
    taxesNotIncluded: rates
      .flatMap((rate) => rate.retailRate?.taxesAndFees ?? [])
      .filter((tax) => tax.included === false)
      .map((tax) => ({
        description: tax.description || "Taxes and fees",
        amount: tax.amount,
        currency: tax.currency,
      })),
  };
}

function plainText(html: string): string {
  return html
    .replace(/<(?:br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseRooms(
  raw: unknown,
  hotelId: string,
  details?: unknown,
): { hotel: HotelDetail; rooms: Room[] } {
  const { data, hotels } = parseRates(raw);
  const info = hotels?.find((hotel) => hotel.id === hotelId);
  const extra = hotelDetailsSchema.safeParse(details).data?.data;
  const description = plainText(
    extra?.normalizedDescription ?? extra?.hotelDescription ?? "",
  ).slice(0, 1200);
  const images = (extra?.hotelImages ?? []).flatMap((image) =>
    image.url ? [image.url] : [],
  );

  const rooms = (data.find((entry) => entry.hotelId === hotelId)?.roomTypes ?? [])
    .filter(isPriced)
    .map(toRoom)
    .sort((a, b) => a.price.amount - b.price.amount);

  return {
    hotel: {
      id: hotelId,
      name: extra?.name || info?.name || "Hotel",
      photo: extra?.main_photo || info?.main_photo || info?.thumbnail,
      address: extra?.address || info?.address,
      stars: extra?.starRating ?? info?.stars,
      rating: extra?.rating ?? info?.rating,
      description: description || undefined,
      images: images.length ? images.slice(0, 8) : undefined,
      facilities: extra?.hotelFacilities?.length
        ? extra.hotelFacilities.slice(0, 12)
        : undefined,
    },
    rooms,
  };
}

const guestName = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z' -]{0,49}$/, "Use English letters for the guest name.");

export const prebookRequestSchema = z.object({
  offerId: z.string().regex(/^[A-Za-z0-9_=+/.-]{8,4000}$/),
});

// Shared so a prebook the book call would reject is refused before the customer reaches the card form.
const prebookIdPattern = /^[A-Za-z0-9_-]{4,100}$/;
const transactionIdPattern = /^[A-Za-z0-9_-]{4,200}$/;

export const hotelBookingRequestSchema = z.object({
  attemptId: z.uuid(),
  prebookId: z.string().regex(prebookIdPattern),
  transactionId: z.string().regex(transactionIdPattern),
  expectedTotal: z.number().positive(),
  expectedCurrency: z.string().regex(/^[A-Z]{3}$/),
  holder: z.object({
    firstName: guestName,
    lastName: guestName,
    email: z.email().max(254),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  }),
});
export type HotelBookingRequest = z.infer<typeof hotelBookingRequestSchema>;

export type Prebook = {
  prebookId: string;
  transactionId: string;
  secretKey: string;
  hotelId: string;
  checkin: string;
  checkout: string;
  price: Price;
  priceDifferencePercent: number;
  cancellationChanged: boolean;
  boardChanged: boolean;
  refundable: boolean;
};

// Every field here is shown to the customer or sent to the card form, so none is defaulted.
const prebookSchema = z.looseObject({
  data: z.looseObject({
    prebookId: z.string().regex(prebookIdPattern),
    transactionId: z.string().regex(transactionIdPattern),
    secretKey: z.string().min(1),
    hotelId: z.string().min(1),
    checkin: z.string().min(1),
    checkout: z.string().min(1),
    price: z.number(),
    currency: currencyCode,
    priceDifferencePercent: z.number(),
    cancellationChanged: z.boolean(),
    boardChanged: z.boolean(),
    roomTypes: z
      .array(
        z.looseObject({
          rates: z
            .array(
              z.looseObject({
                cancellationPolicies: z
                  .looseObject({ refundableTag: optionalString })
                  .nullish(),
              }),
            )
            .nullish(),
        }),
      )
      .nullish(),
  }),
});

export function normalisePrebook(raw: unknown): Prebook {
  const { data } = prebookSchema.parse(raw);
  const rates = (data.roomTypes ?? []).flatMap((roomType) => roomType.rates ?? []);
  return {
    prebookId: data.prebookId,
    transactionId: data.transactionId,
    secretKey: data.secretKey,
    hotelId: data.hotelId,
    checkin: data.checkin,
    checkout: data.checkout,
    price: { amount: data.price, currency: data.currency },
    priceDifferencePercent: data.priceDifferencePercent,
    cancellationChanged: data.cancellationChanged,
    boardChanged: data.boardChanged,
    refundable:
      rates.length > 0 &&
      rates.every((rate) => rate.cancellationPolicies?.refundableTag === "RFN"),
  };
}

export function buildLiteapiBook({
  attemptId,
  prebookId,
  transactionId,
  holder,
}: HotelBookingRequest) {
  return {
    prebookId,
    // LiteAPI rejects a repeated clientReference as a duplicate, so a lost record still cannot book twice.
    clientReference: attemptId,
    holder,
    guests: [
      {
        occupancyNumber: 1,
        firstName: holder.firstName,
        lastName: holder.lastName,
        email: holder.email,
      },
    ],
    payment: { method: "TRANSACTION_ID", transactionId },
  };
}

export type BookOutcome =
  | { kind: "confirmed"; bookingId: string }
  | { kind: "rejected" }
  | { kind: "room-unavailable" }
  | { kind: "not-authorised" }
  | { kind: "unknown" };

const invalidRequestCodes = new Set([4000, 4002, 4003, 4010]);
const roomGoneCodes = new Set([4012, 2013]);

function isLiveResponse(body: unknown): boolean {
  try {
    assertSandbox(body);
    return false;
  } catch {
    return true;
  }
}

export function classifyBookResponse(result: LiteapiResult | "unreachable"): BookOutcome {
  if (result === "unreachable") return { kind: "unknown" };
  const { status, body } = result;

  if (status === 200 && !isLiveResponse(body)) {
    const data = (body as { data?: { status?: unknown; bookingId?: unknown } } | null)?.data;
    if (data?.status === "CONFIRMED" && typeof data.bookingId === "string" && data.bookingId) {
      return { kind: "confirmed", bookingId: data.bookingId };
    }
  }
  if (status === 401 || status === 403) return { kind: "not-authorised" };

  const code = liteapiErrorCode(body);
  // Only these exact statuses count: a 2xx or 5xx that merely carries the code is not proof.
  if (status === 410 || (status === 400 && code !== undefined && roomGoneCodes.has(code))) {
    return { kind: "room-unavailable" };
  }
  if (status === 400 && code !== undefined && invalidRequestCodes.has(code)) {
    return { kind: "rejected" };
  }
  // The card is charged before the book call, so an unproven outcome must never be reported as failed.
  return { kind: "unknown" };
}

export const attemptReferencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A booking id alone must not reveal guest details: only the attempt that created it may read it back.
export function bookingBelongsToAttempt(raw: unknown, attemptId: string): boolean {
  const reference = (raw as { data?: { clientReference?: unknown } } | null)?.data
    ?.clientReference;
  return typeof reference === "string" && reference.toLowerCase() === attemptId.toLowerCase();
}

export type HotelBooking = {
  bookingId: string;
  status: string;
  hotel: { id: string; name: string };
  checkin: string;
  checkout: string;
  holder: { firstName: string; lastName: string; email: string };
  price: number;
  currency: string;
  cancellation: {
    refundableTag?: string;
    cancelPolicyInfos: { cancelTime?: string; amount?: number; currency?: string }[];
  };
  hotelConfirmationCode?: string;
};

const storedBookingSchema = z.looseObject({
  data: z.looseObject({
    bookingId: z.string().min(1),
    status: z.string().min(1),
    hotelConfirmationCode: optionalString,
    hotel: z.looseObject({ hotelId: z.string().min(1), name: optionalString }),
    checkin: z.string().min(1),
    checkout: z.string().min(1),
    holder: z.looseObject({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
    }),
    price: z.number(),
    currency: currencyCode,
    cancellationPolicies: z
      .looseObject({
        refundableTag: optionalString,
        cancelPolicyInfos: z
          .array(
            z.looseObject({
              cancelTime: optionalString,
              timezone: optionalString,
              amount: optionalNumber,
              currency: currencyCode.optional().catch(undefined),
            }),
          )
          .nullish(),
      })
      .nullish(),
  }),
});

export function normaliseBooking(raw: unknown): HotelBooking {
  const { data } = storedBookingSchema.parse(raw);
  const policies = data.cancellationPolicies;
  return {
    bookingId: data.bookingId,
    status: data.status,
    hotel: { id: data.hotel.hotelId, name: data.hotel.name || "Hotel" },
    checkin: data.checkin,
    checkout: data.checkout,
    holder: {
      firstName: data.holder.firstName,
      lastName: data.holder.lastName,
      email: data.holder.email,
    },
    price: data.price,
    currency: data.currency,
    cancellation: {
      refundableTag: policies?.refundableTag,
      cancelPolicyInfos: (policies?.cancelPolicyInfos ?? []).map((info) => ({
        cancelTime: cancelTimeToUtcIso(info.cancelTime, info.timezone),
        amount: info.amount,
        currency: info.currency,
      })),
    },
    hotelConfirmationCode: data.hotelConfirmationCode,
  };
}
