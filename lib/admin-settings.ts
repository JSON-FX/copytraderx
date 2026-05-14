import {
  ADMIN_SUBS_PAGE_SIZE_DEFAULT,
  ADMIN_SUBS_PAGE_SIZE_OPTIONS,
  type AdminSubsPageSize,
} from "./dashboard-filters";

export const ADMIN_SUBS_PAGE_SIZE_KEY = "admin.subs.pageSize";

const OPTION_SET = new Set<number>(ADMIN_SUBS_PAGE_SIZE_OPTIONS);

function isAdminSubsPageSize(value: number): value is AdminSubsPageSize {
  return OPTION_SET.has(value);
}

export function getAdminSubsPageSize(): AdminSubsPageSize {
  if (typeof window === "undefined") return ADMIN_SUBS_PAGE_SIZE_DEFAULT;
  const raw = window.localStorage.getItem(ADMIN_SUBS_PAGE_SIZE_KEY);
  if (raw === null) return ADMIN_SUBS_PAGE_SIZE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !isAdminSubsPageSize(n)) {
    return ADMIN_SUBS_PAGE_SIZE_DEFAULT;
  }
  return n;
}

export function setAdminSubsPageSize(size: AdminSubsPageSize): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_SUBS_PAGE_SIZE_KEY, String(size));
}
