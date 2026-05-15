"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { setPnlDisplay, type PnlDisplay } from "@/lib/preferences/server";

export async function updatePnlDisplay(value: PnlDisplay): Promise<{ ok: true } | { error: string }> {
  if (value !== "percent" && value !== "dollar") {
    return { error: "invalid_value" };
  }
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { error: "unauthorized" };
  try {
    await setPnlDisplay(user.id, value);
  } catch {
    return { error: "write_failed" };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/licenses", "layout");
  return { ok: true };
}
