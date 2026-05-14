export type Product =
  | "impulse"
  | "ctx-core"
  | "ctx-live"
  | "ctx-prop-passer"
  | "ctx-prop-funded";

export type ProductDef = {
  code: Product;
  displayName: string;
  prefix: string;
};

export const PRODUCTS: readonly ProductDef[] = [
  { code: "impulse",          displayName: "Impulse",          prefix: "IMPX" },
  { code: "ctx-core",         displayName: "CTX Core",         prefix: "CTXC" },
  { code: "ctx-live",         displayName: "CTX Live",         prefix: "CTXL" },
  { code: "ctx-prop-passer",  displayName: "CTX Prop Passer",  prefix: "CTXP" },
  { code: "ctx-prop-funded",  displayName: "CTX Prop Funded",  prefix: "CTXF" },
] as const;

export const PRODUCT_CODES: readonly Product[] = PRODUCTS.map((p) => p.code);

export function productPrefix(code: Product): string {
  const def = PRODUCTS.find((p) => p.code === code);
  if (!def) throw new Error(`Unknown product code: ${code}`);
  return def.prefix;
}

export function productByPrefix(prefix: string): Product | null {
  const def = PRODUCTS.find((p) => p.prefix === prefix);
  return def ? def.code : null;
}

export function isProductCode(value: unknown): value is Product {
  return typeof value === "string" && PRODUCT_CODES.includes(value as Product);
}

export function productDisplayName(code: Product): string {
  const def = PRODUCTS.find((p) => p.code === code);
  if (!def) throw new Error(`Unknown product code: ${code}`);
  return def.displayName;
}
