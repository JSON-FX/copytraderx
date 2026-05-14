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
  const expiredIds = (rows ?? []).map((r) => r.id);
  console.log(`Expired ${expiredIds.length} subscription(s).`);

  if (expiredIds.length > 0) {
    // Plan 6: auto-reject pending extensions whose source just expired.
    // Idempotent via status='pending' clause — safe if the revoke handler
    // also fires on any of these.
    const { data: rejected, error: extErr } = await sb
      .from("subscription_extensions")
      .update({
        status: "rejected",
        rejection_code: "source_expired_before_approval",
        rejection_message:
          "Your subscription expired before we could approve your extension. Submit a fresh renewal from your dashboard.",
      })
      .in("subscription_id", expiredIds)
      .eq("status", "pending")
      .select("id");
    if (extErr) {
      console.error("Auto-reject extensions failed:", extErr.message);
    } else {
      console.log(`Auto-rejected ${rejected?.length ?? 0} pending extension(s).`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
