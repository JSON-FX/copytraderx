import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
config({ path: ".env.local", override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const now = new Date().toISOString();
  const { data: rows, error } = await sb
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "active")
    .lte("expires_at", now)
    .select("id");
  if (error) {
    console.error("Update failed:", error.message);
    process.exit(1);
  }
  console.log(`Expired ${rows?.length ?? 0} subscription(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
