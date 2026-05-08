import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { reattachLicenseSchema } from "@/lib/schemas";
import { isLegacyAdmin } from "@/lib/users";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = reattachLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const targetUserId = parsed.data.target_user_id;

  const sb = getSupabaseAdmin();

  const { data: lic, error: licErr } = await sb
    .from("licenses")
    .select("id, user_id, subscription_id, product, tier, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (licErr) return NextResponse.json({ error: "lookup_failed", details: licErr.message }, { status: 500 });
  if (!lic) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: currentOwner } = await sb
    .from("users")
    .select("email")
    .eq("id", lic.user_id)
    .maybeSingle();

  if (!isLegacyAdmin(currentOwner?.email)) {
    return NextResponse.json({ error: "not_legacy_owned" }, { status: 409 });
  }

  const { data: target, error: targetErr } = await sb
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: "lookup_failed", details: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "target_not_found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: newSub, error: subErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: targetUserId,
      product: lic.product,
      tier: lic.tier,
      status: "active",
      requested_at: nowIso,
      approved_at: nowIso,
      approved_by: user.id,
      expires_at: lic.expires_at,
      push_interval_seconds: 10,
      propfirm_rule_id: null,
      notes: "Reattached from legacy backfill",
    })
    .select()
    .single();
  if (subErr) return NextResponse.json({ error: "subscription_insert_failed", details: subErr.message }, { status: 500 });

  const { data: updatedLic, error: updErr } = await sb
    .from("licenses")
    .update({ subscription_id: newSub.id, user_id: targetUserId })
    .eq("id", id)
    .select()
    .single();
  if (updErr) {
    await sb.from("subscriptions").delete().eq("id", newSub.id);
    return NextResponse.json({ error: "license_update_failed", details: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ license: updatedLic, subscription: newSub });
}
