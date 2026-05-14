import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";

export type JournalAccessResult =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 404 };

export async function ensureJournalAccess(mt5_account: number): Promise<JournalAccessResult> {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { allowed: false, status: 401 };

  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  if (role === "admin") return { allowed: true };
  if (role !== "user") return { allowed: false, status: 403 };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("id")
    .eq("user_id", user.id)
    .eq("mt5_account", mt5_account)
    .limit(1);

  if (error) return { allowed: false, status: 403 };
  if (!data || data.length === 0) return { allowed: false, status: 404 };
  return { allowed: true };
}
