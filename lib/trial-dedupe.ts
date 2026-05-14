import type { SupabaseClient } from "@supabase/supabase-js";

export type TrialDedupeInput = {
  email: string;
  mt5_account: number;
  telegram_handle: string | null;
  discord_handle: string | null;
};

export type TrialDedupeMatch = {
  trial_id: number;
  created_at: string;
  status: string;
};

export type TrialDedupeResult = {
  email?: TrialDedupeMatch;
  telegram?: TrialDedupeMatch;
  discord?: TrialDedupeMatch;
  mt5_account?: TrialDedupeMatch;
};

/**
 * Look up trial_leads (with their trial_licenses) that match any of the
 * four dedupe identifiers in one query. Returns a per-field collision map.
 * Empty object = no collisions; safe to proceed with insert.
 */
export async function checkTrialDedupe(
  sb: SupabaseClient,
  input: TrialDedupeInput,
): Promise<TrialDedupeResult> {
  const orParts: string[] = [`email.eq.${input.email}`];
  if (input.telegram_handle) {
    orParts.push(`telegram_handle.ilike.${escapeIlike(input.telegram_handle)}`);
  }
  if (input.discord_handle) {
    orParts.push(`discord_handle.ilike.${escapeIlike(input.discord_handle)}`);
  }

  const { data, error } = await sb
    .from("trial_leads")
    .select(
      "id, email, telegram_handle, discord_handle, created_at, status, " +
        "trial_licenses(id, mt5_account, created_at, status)",
    )
    .or(orParts.join(","));

  if (error) throw error;

  const result: TrialDedupeResult = {};
  const rows = ((data ?? []) as unknown) as Array<{
    id: number;
    email: string;
    telegram_handle: string | null;
    discord_handle: string | null;
    created_at: string;
    status: string;
    trial_licenses:
      | {
          id: number;
          mt5_account: number;
          created_at: string;
          status: string;
        }
      | Array<{ id: number; mt5_account: number; created_at: string; status: string }>
      | null;
  }>;

  for (const row of rows) {
    if (row.email.toLowerCase() === input.email.toLowerCase() && !result.email) {
      result.email = { trial_id: row.id, created_at: row.created_at, status: row.status };
    }
    if (
      input.telegram_handle &&
      row.telegram_handle &&
      row.telegram_handle.toLowerCase() === input.telegram_handle.toLowerCase() &&
      !result.telegram
    ) {
      result.telegram = { trial_id: row.id, created_at: row.created_at, status: row.status };
    }
    if (
      input.discord_handle &&
      row.discord_handle &&
      row.discord_handle.toLowerCase() === input.discord_handle.toLowerCase() &&
      !result.discord
    ) {
      result.discord = { trial_id: row.id, created_at: row.created_at, status: row.status };
    }
    const license = Array.isArray(row.trial_licenses)
      ? row.trial_licenses[0]
      : row.trial_licenses;
    if (license && license.mt5_account === input.mt5_account && !result.mt5_account) {
      result.mt5_account = {
        trial_id: row.id,
        created_at: license.created_at,
        status: license.status,
      };
    }
  }

  // The .or() above does not cover mt5_account because that lives on
  // trial_licenses. Do a targeted second lookup to catch leads who
  // collide on MT5# but not on contact fields.
  if (!result.mt5_account) {
    const { data: licRow, error: licErr } = await sb
      .from("trial_licenses")
      .select("id, mt5_account, status, created_at, trial_lead_id")
      .eq("mt5_account", input.mt5_account)
      .maybeSingle();
    if (licErr) throw licErr;
    if (licRow) {
      result.mt5_account = {
        trial_id: (licRow as { trial_lead_id: number }).trial_lead_id,
        created_at: (licRow as { created_at: string }).created_at,
        status: (licRow as { status: string }).status,
      };
    }
  }

  return result;
}

function escapeIlike(value: string): string {
  // PostgREST .or() uses commas as separators, and SQL ILIKE treats %, _,
  // and \ as wildcards / escape — escape all four so user-supplied
  // handles match exactly, not as patterns.
  return value.replace(/[%_\\,]/g, "\\$&");
}
