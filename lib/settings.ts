const KEY = "ctx.pollingIntervalMs";
const DEFAULT_MS = 3000;

export const POLLING_KEY = KEY;

export const POLLING_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "1 second", value: 1000 },
  { label: "3 seconds", value: 3000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
] as const;

export function getPollingInterval(): number {
  if (typeof window === "undefined") return DEFAULT_MS;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MS;
  return n;
}

export function setPollingInterval(ms: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(ms));
}

const JOURNAL_KEY = "ctx.journalPollingIntervalMs";
const JOURNAL_DEFAULT_MS = 10_000;

export const JOURNAL_POLLING_KEY = JOURNAL_KEY;

export const JOURNAL_POLLING_OPTIONS = [
  { label: "3 seconds", value: 3000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10_000 },
  { label: "30 seconds", value: 30_000 },
  { label: "60 seconds", value: 60_000 },
] as const;

export function getJournalPollingInterval(): number {
  if (typeof window === "undefined") return JOURNAL_DEFAULT_MS;
  const raw = window.localStorage.getItem(JOURNAL_KEY);
  if (raw === null) return JOURNAL_DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return JOURNAL_DEFAULT_MS;
  return n;
}

export function setJournalPollingInterval(ms: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(JOURNAL_KEY, String(ms));
}
