import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type PnlDisplay = "percent" | "dollar";

export interface UserPreferences {
  user_id: string;
  pnl_display: PnlDisplay;
  created_at: string;
  updated_at: string;
}

export function resolvePnlDisplay(row: Pick<UserPreferences, "pnl_display"> | null): PnlDisplay {
  if (!row) return "percent";
  return row.pnl_display === "dollar" ? "dollar" : "percent";
}

export async function getPnlDisplay(userId: string): Promise<PnlDisplay> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("user_preferences")
    .select("pnl_display")
    .eq("user_id", userId)
    .maybeSingle();
  return resolvePnlDisplay(data as Pick<UserPreferences, "pnl_display"> | null);
}

export async function setPnlDisplay(userId: string, value: PnlDisplay): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("user_preferences")
    .upsert({ user_id: userId, pnl_display: value }, { onConflict: "user_id" });
  if (error) throw error;
}
