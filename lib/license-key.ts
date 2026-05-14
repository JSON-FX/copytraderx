import { type Product, productPrefix } from "./products";

/**
 * Safe alphabet for license keys: 31 uppercase alphanumerics excluding
 * ambiguous 0/O/1/I/L. 16 chars over this alphabet ≈ 79 bits of entropy.
 */
export const LICENSE_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generates a license key shaped <PREFIX>-XXXX-XXXX-XXXX-XXXX for the given product. */
export function generateLicenseKey(product: Product): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      group += pickRandomChar();
    }
    groups.push(group);
  }
  return `${productPrefix(product)}-${groups.join("-")}`;
}

function pickRandomChar(): string {
  const idx = secureRandomIndex(LICENSE_KEY_ALPHABET.length);
  return LICENSE_KEY_ALPHABET[idx];
}

function secureRandomIndex(max: number): number {
  // Rejection sampling to avoid modulo bias.
  const range = 256 - (256 % max);
  const buf = new Uint8Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < range) return buf[0] % max;
  }
}
