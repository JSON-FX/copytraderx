import { randomInt } from "node:crypto";
import { PRODUCTS, type Product } from "./products";
import type { LicenseTier } from "./types";

// Safe alphabet: omit 0, O, 1, I, l, o for human-typable temp passwords.
const SAFE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ" +
  "abcdefghjkmnpqrstuvwxyz" +
  "23456789" +
  "!@#$%^&*";

/**
 * Cryptographically random temp password using a confusion-resistant alphabet.
 * Default length 12 — matches spec §6.1 ("generated 12-char temp password").
 */
export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)];
  }
  return out;
}

const TIER_LABELS: Record<LicenseTier, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function tierLabel(tier: LicenseTier): string {
  return TIER_LABELS[tier];
}

const PRODUCT_LABELS: Record<Product, string> = Object.fromEntries(
  PRODUCTS.map((p) => [p.code, p.displayName]),
) as Record<Product, string>;

export function productLabel(product: Product): string {
  return PRODUCT_LABELS[product];
}
