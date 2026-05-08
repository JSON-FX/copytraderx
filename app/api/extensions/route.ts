import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extendSubscriptionRequestSchema } from "@/lib/schemas";
import { canExtendFrom, canExtendToTier } from "@/lib/subscription-state";
import { sendRequestSubmittedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = extendSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { subscription_id, requested_tier, notes } = parsed.data;
  const sb = getSupabaseAdmin();

  const { data: source, error: sourceErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", subscription_id)
    .maybeSingle();
  if (sourceErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: sourceErr.message },
      { status: 500 },
    );
  }
  if (!source || source.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const activeGuard = canExtendFrom({ status: source.status });
  if (!activeGuard.ok) {
    return NextResponse.json({ error: activeGuard.reason }, { status: 409 });
  }

  const tierGuard = canExtendToTier(source.tier, requested_tier);
  if (!tierGuard.ok) {
    return NextResponse.json({ error: tierGuard.reason }, { status: 422 });
  }

  const { data: inserted, error: insertErr } = await sb
    .from("subscription_extensions")
    .insert({
      subscription_id,
      user_id: user.id,
      requested_tier,
      status: "pending",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    // 23505 = unique_violation → idx_extensions_one_pending_per_source.
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "extension_already_pending" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "insert_failed", details: insertErr.message },
      { status: 500 },
    );
  }

  const adminTo = process.env.INITIAL_ADMIN_EMAIL;
  if (adminTo) {
    void sendRequestSubmittedEmail({
      to: adminTo,
      user_email: user.email ?? "(unknown)",
      product_label: productDisplayName(source.product),
      tier_label: requested_tier,
      notes: notes ?? null,
      kind: "extension",
    });
  } else {
    console.warn("[api/extensions] INITIAL_ADMIN_EMAIL not set; skipping admin notification");
  }

  return NextResponse.json({ extension: inserted }, { status: 201 });
}
