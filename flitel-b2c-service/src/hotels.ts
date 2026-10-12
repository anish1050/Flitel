import { z } from "zod";
import { raiseApiError } from "./duffel.js";

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
const money = z.looseObject({ amount: z.number(), currency: z.string() });
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
            currency: z.string(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  cancellationPolicies: z
    .looseObject({
      refundableTag: optionalString,
      cancelPolicyInfos: z
        .array(z.looseObject({ cancelTime: optionalString }))
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

function toRoom(roomType: PricedRoomType): Room {
  const rates = roomType.rates ?? [];
  const refundable = allRatesRefundable(roomType);
  return {
    offerId: roomType.offerId,
    name: rates[0]?.name || "Room",
    boardName: rates[0]?.boardName,
    refundable,
    cancelBefore: refundable
      ? rates[0]?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime
      : undefined,
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
