import { z } from "zod";
import { PRODUCTS, PRODUCT_CODES, type Product } from "./products";

// Per-product license-key regex map. Body uses the safe alphabet from
// lib/license-key.ts (excludes ambiguous 0/O/1/I/L).
const SAFE_BODY = "[A-Z2-9]{4}";
export const LICENSE_KEY_PATTERNS: Record<Product, RegExp> = Object.fromEntries(
  PRODUCTS.map((p) => [
    p.code,
    new RegExp(`^${p.prefix}-${SAFE_BODY}-${SAFE_BODY}-${SAFE_BODY}-${SAFE_BODY}$`),
  ]),
) as Record<Product, RegExp>;

/** Returns true if `key` matches the product's prefix + body shape. */
export function isValidLicenseKey(key: string, product: Product): boolean {
  return LICENSE_KEY_PATTERNS[product].test(key);
}

/**
 * Legacy alias kept for the admin license-form (which is updated to support
 * all products in Task 9). Matches the IMPX-only pattern.
 *
 * @deprecated Use `LICENSE_KEY_PATTERNS[product]` or `isValidLicenseKey`.
 */
export const LICENSE_KEY_PATTERN = LICENSE_KEY_PATTERNS["impulse"];

const productEnum = z.enum(PRODUCT_CODES as [Product, ...Product[]]);
const tierEnum = z.enum(["monthly", "quarterly", "yearly"]);
const statusEnum = z.enum(["active", "revoked", "expired"]);
const renewableTierEnum = z.enum(["monthly", "quarterly", "yearly"]);
const accountTypeEnum = z.enum(["demo", "live"]);
const subscriptionStatusEnum = z.enum([
  "pending",
  "active",
  "rejected",
  "expired",
  "revoked",
]);

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
    license_key: z.string(),
    mt5_account: z
      .number()
      .int()
      .positive("Must be a positive integer"),
    product: productEnum,
    tier: tierEnum,
    intended_account_type: accountTypeEnum,
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
    push_interval_seconds: z.number().int().min(3).max(60).default(10),
    propfirm_rule_id: z.number().int().positive().nullable().default(null),
  })
  .strict()
  .refine(
    (v) => isValidLicenseKey(v.license_key, v.product),
    {
      message: "license_key prefix must match product",
      path: ["license_key"],
    },
  );

export const updateLicenseSchema = z
  .object({
    license_key: z.string().optional(),
    mt5_account: z.number().int().positive().optional(),
    // product is read-only on a license; the API route rejects PATCH attempts
    // that include it. Schema permits it for round-tripping display data.
    product: productEnum.optional(),
    status: statusEnum.optional(),
    tier: tierEnum.nullable().optional(),
    intended_account_type: accountTypeEnum.nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    customer_email: optionalEmail,
    notes: optionalNonEmpty,
    push_interval_seconds: z.number().int().min(3).max(60).optional(),
    propfirm_rule_id: z.number().int().positive().nullable().optional(),
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

// ── Subscription request / approval schemas ──────────────────────────────────

export const createSubscriptionRequestSchema = z
  .object({
    product: productEnum,
    tier: tierEnum,
    notes: optionalNonEmpty,
  })
  .strict();

export const renewSubscriptionRequestSchema = z
  .object({
    source_subscription_id: z.number().int().positive(),
    tier: tierEnum,
    notes: optionalNonEmpty,
  })
  .strict();
// product is intentionally absent — server fetches it from source_subscription_id.

export const approveSubscriptionSchema = z
  .object({
    action: z.literal("approve"),
  })
  .strict();

export const rejectSubscriptionSchema = z
  .object({
    action: z.literal("reject"),
    rejection_reason: z.string().min(1).max(1000),
  })
  .strict();

export type CreateSubscriptionRequestInput = z.infer<typeof createSubscriptionRequestSchema>;
export type RenewSubscriptionRequestInput = z.infer<typeof renewSubscriptionRequestSchema>;
export type ApproveSubscriptionInput = z.infer<typeof approveSubscriptionSchema>;
export type RejectSubscriptionInput = z.infer<typeof rejectSubscriptionSchema>;

// Re-exported for downstream filters.
export { subscriptionStatusEnum };

// ── App-user schemas (admin Users surface) ───────────────────────────────────

const roleEnum = z.enum(["admin", "user"]);

export const createUserSchema = z
  .object({
    email: z.string().email().max(254),
    full_name: optionalNonEmpty,
    role: roleEnum,
    /**
     * Optional. When present, the create endpoint also inserts a
     * subscriptions row with status='active' for this product+tier and
     * computes expires_at from the tier.
     */
    initial_subscription: z
      .object({
        product: productEnum,
        tier: tierEnum,
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    full_name: optionalNonEmpty,
    role: roleEnum.optional(),
  })
  .strict()
  .refine(
    (obj) => Object.keys(obj).length > 0,
    "Update body cannot be empty",
  );

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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
  max_trading_days: z.number().int().positive().nullable().optional(),
});
export type PropfirmRuleInput = z.infer<typeof propfirmRuleSchema>;
