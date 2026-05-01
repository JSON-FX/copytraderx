import { z } from "zod";

export const LICENSE_KEY_PATTERN = /^IMPX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const tierEnum = z.enum(["monthly", "quarterly", "yearly"]);
const statusEnum = z.enum(["active", "revoked", "expired"]);
const renewableTierEnum = z.enum(["monthly", "quarterly", "yearly"]);
const accountTypeEnum = z.enum(["demo", "live"]);

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
    intended_account_type: accountTypeEnum,
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
    intended_account_type: accountTypeEnum.nullable().optional(),
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

export const propfirmRuleSchema = z.object({
  name: z.string().min(1).max(120),
  account_size: z.number().positive(),
  max_daily_loss: z.number().positive(),
  daily_loss_type: z.enum(["money", "percent"]),
  daily_loss_calc: z.enum(["balance", "equity"]),
  max_total_loss: z.number().positive(),
  total_loss_type: z.enum(["money", "percent"]),
  profit_target: z.number().positive(),
  target_type: z.enum(["money", "percent"]),
  min_trading_days: z.number().int().nonnegative().default(0),
  max_trading_days: z.number().int().positive().nullable(),
});
export type PropfirmRuleInput = z.infer<typeof propfirmRuleSchema>;
