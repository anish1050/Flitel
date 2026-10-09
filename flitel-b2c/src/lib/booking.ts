import { z } from "zod";

export type TravellerInput = {
  id: string;
  title: string;
  givenName: string;
  familyName: string;
  bornOn: string;
  gender: string;
  passport?: { number: string; issuingCountry: string; expiresOn: string };
};
export type BookingInput = {
  travellers: TravellerInput[];
  contact: { email: string; phone: string };
};

export function createBookingInput(
  passengerIds: string[],
  documentsRequired: boolean,
): BookingInput {
  return {
    travellers: passengerIds.map((id) => ({
      id,
      title: "",
      givenName: "",
      familyName: "",
      bornOn: "",
      gender: "",
      ...(documentsRequired && {
        passport: { number: "", issuingCountry: "", expiresOn: "" },
      }),
    })),
    contact: { email: "", phone: "" },
  };
}

export function isAdultOn(bornOn: string, day: string): boolean {
  const [year, month, date] = bornOn.split("-").map(Number);
  const [thisYear, thisMonth, thisDate] = day.split("-").map(Number);
  const birthdayPassed =
    thisMonth > month || (thisMonth === month && thisDate >= date);
  return thisYear - year - (birthdayPassed ? 0 : 1) >= 18;
}

const nameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z' -]{0,49}$/, "Use English letters as shown on the passport.");
const dateSchema = z.iso.date("Enter a valid date.");

export function createBookingSchema(
  documentsRequired: boolean,
  today = new Date().toISOString().slice(0, 10),
) {
  const passport = z.object({
    number: z.string().regex(/^[A-Z0-9]{5,20}$/, "Enter the passport number without spaces."),
    issuingCountry: z
      .string()
      .regex(/^[A-Z]{2}$/, "Use the two-letter country code, for example IN."),
    expiresOn: dateSchema.refine((date) => date > today, "The passport must not have expired."),
  });
  return z.object({
    travellers: z
      .array(
        z.object({
          id: z.string(),
          title: z.enum(["mr", "ms", "mrs", "miss"], "Choose a title."),
          givenName: nameSchema,
          familyName: nameSchema,
          bornOn: dateSchema.refine(
            (date) => isAdultOn(date, today),
            "Adult travellers must be 18 or older.",
          ),
          gender: z.enum(["m", "f"], "Choose a gender."),
          passport: documentsRequired ? passport : z.undefined().optional(),
        }),
      )
      .min(1)
      .max(9),
    contact: z.object({
      email: z.email("Enter a valid email address.").max(254),
      phone: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{6,14}$/, "Use the international format, for example +919876543210."),
    }),
  });
}
export type BookingDetails = z.infer<ReturnType<typeof createBookingSchema>>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}
