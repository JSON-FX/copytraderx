import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canRevoke } from "@/lib/subscription-state";
import { sendSubscriptionRevokedEmail, rejectionCopyFor } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr)
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guard = canRevoke({ status: sub.status });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({ status: "revoked" })
    .eq("id", id)
    .select()
    .single();
  if (updErr)
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );

  // Plan 6: auto-reject any pending extensions on this source. Idempotent via
  // WHERE status='pending' clause — safe even if the cron expiry sweep also
  // fires on the same source. Don't fail the revoke if this step fails.
  const { error: extRejectErr } = await sb
    .from("subscription_extensions")
    .update({
      status: "rejected",
      rejection_code: "source_revoked_before_approval",
      rejection_message: rejectionCopyFor("source_revoked_before_approval")!,
    })
    .eq("subscription_id", id)
    .eq("status", "pending");
  if (extRejectErr) {
    console.error(
      `[api/subscriptions/${id}/revoke] auto-reject extensions failed:`,
      extRejectErr.message,
    );
  }

  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", sub.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendSubscriptionRevokedEmail({
      to: targetUser.email,
      product_label: productDisplayName(sub.product),
      tier_label: tierLabel(sub.tier),
    });
  }

  return NextResponse.json({ subscription: updated });
}
