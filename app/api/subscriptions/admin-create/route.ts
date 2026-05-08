import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { adminCreateSubscriptionSchema } from "@/lib/schemas";
import { calculateExpiresAt } from "@/lib/expiry";
import { sendSubscriptionGrantedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

export async function POST(req: Request) {
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
  const parsed = adminCreateSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const sb = getSupabaseAdmin();

  const { data: target, error: tErr } = await sb
    .from("users")
    .select("id, email")
    .eq("id", input.user_id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: "lookup_failed", details: tErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const now = new Date();
  const expires = calculateExpiresAt(input.tier, now);

  const { data: created, error: insErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: input.user_id,
      product: input.product,
      tier: input.tier,
      status: "active",
      requested_at: now.toISOString(),
      approved_at: now.toISOString(),
      approved_by: user.id,
      expires_at: expires.toISOString(),
      push_interval_seconds: input.push_interval_seconds,
      propfirm_rule_id: input.propfirm_rule_id,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: "insert_failed", details: insErr.message }, { status: 500 });

  if (input.send_grant_email && target.email) {
    void sendSubscriptionGrantedEmail({
      to: target.email,
      product_label: productDisplayName(input.product),
      tier_label: tierLabel(input.tier),
      expires_at: expires.toISOString().slice(0, 10),
      login_url: process.env.PUBLIC_APP_URL
        ? `${process.env.PUBLIC_APP_URL}/login`
        : "/login",
    });
  }

  return NextResponse.json({ subscription: created }, { status: 201 });
}
