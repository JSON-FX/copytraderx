import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseConfig } from "@/lib/environment";

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;

  const { url, serviceRoleKey } = getAdminSupabaseConfig();

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}
