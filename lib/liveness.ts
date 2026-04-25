import type { License, LivenessState } from "./types";
import { isExpired } from "./expiry";

// One EA revalidate cycle (12h) plus 1h grace.
export const ONLINE_WINDOW_MS = 13 * 60 * 60 * 1000;

// Matches the EA's offline cache window — past this we know the EA is no
// longer running, since even cached tokens expire.
export const STALE_WINDOW_MS = 72 * 60 * 60 * 1000;

export function deriveLiveness(license: License, now: Date): LivenessState {
  if (license.status === "revoked") return "revoked";
  if (license.status === "expired") return "expired";
  if (isExpired(license.expires_at)) return "expired";
  if (license.activated_at === null) return "not_activated";
  if (license.last_validated_at === null) return "offline";

  const age = now.getTime() - new Date(license.last_validated_at).getTime();
  if (age < ONLINE_WINDOW_MS) return "online";
  if (age < STALE_WINDOW_MS) return "stale";
  return "offline";
}
