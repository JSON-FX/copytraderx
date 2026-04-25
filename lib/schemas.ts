import { z } from "zod";

export const LICENSE_KEY_PATTERN = /^IMPX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const tierEnum = z.enum(["monthly", "quarterly", "yearly"]);
const statusEnum = z.enum(["active", "revoked", "expired"]);
const renewableTierEnum = z.enum(["monthly", "quarterly", "yearly"]);

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => v == null || z.string().email().safeParse(v).success,
    "Invalid email",
  );

const optionalNonEmpty = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const createLicenseSchema = z
  .object({
    license_key: z.string().regex(LICENSE_KEY_PATTERN, {
      message: "Must match IMPX-XXXX-XXXX-XXXX-XXXX",
    }),
    mt5_account: z
      .number()
      .int()
      .positive("Must be a positive integer"),
    tier: tierEnum,
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
  })
  .strict();

export const updateLicenseSchema = z
  .object({
    license_key: z.string().regex(LICENSE_KEY_PATTERN).optional(),
    mt5_account: z.number().int().positive().optional(),
    status: statusEnum.optional(),
    tier: tierEnum.nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
  })
  .strict()
  .refine(
    (obj) => Object.keys(obj).length > 0,
    "Update body cannot be empty",
  );

export const renewActionSchema = z
  .object({
    action: z.literal("renew"),
    tier: renewableTierEnum,
  })
  .strict();

export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;
export type UpdateLicenseInput = z.infer<typeof updateLicenseSchema>;
export type RenewActionInput = z.infer<typeof renewActionSchema>;
