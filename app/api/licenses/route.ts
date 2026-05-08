import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createLicenseSchema } from "@/lib/schemas";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ licenses: data });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const sb = getSupabaseAdmin();

  // licenses.user_id and licenses.subscription_id are NOT NULL after Plan 2.
  // The admin "create license" path predates the subscription request UI
  // (Plans 3–4), so for admin-direct creates we mint a synthetic subscription
  // owned by the legacy admin user (same pattern as the Plan 2 backfill). When
  // the request/approval flow lands, this branch is replaced by a lookup
  // against the approved subscription.
  const { data: legacyUser, error: legacyUserErr } = await sb
    .from("users")
    .select("id")
    .eq("email", "legacy@copytraderx.local")
    .maybeSingle();

  if (legacyUserErr || !legacyUser) {
    return NextResponse.json(
      {
        error: "legacy_admin_missing",
        details:
          legacyUserErr?.message ??
          "legacy@copytraderx.local synthetic admin not found; run the Plan 2 backfill migration",
      },
      { status: 500 },
    );
  }

  const { data: synthSub, error: synthSubErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: legacyUser.id,
      product: input.product,
      tier: input.tier,
      status: "active",
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "admin-direct license create — pre-subscription-UI synthetic subscription",
    })
    .select("id")
    .single();

  if (synthSubErr || !synthSub) {
    return NextResponse.json(
      {
        error: "subscription_create_failed",
        details: synthSubErr?.message ?? "could not create synthetic subscription",
      },
      { status: 500 },
    );
  }

  const { data, error } = await sb
    .from("licenses")
    .insert({
      license_key: input.license_key,
      mt5_account: input.mt5_account,
      product: input.product,
      tier: input.tier,
      user_id: legacyUser.id,
      subscription_id: synthSub.id,
      // expires_at + activated_at left null on purpose: the EA stamps both
      // on first successful validation. Admin can override via
      // /api/licenses/:id/activate.
      expires_at: null,
      activated_at: null,
      customer_email: input.customer_email ?? null,
      notes: input.notes ?? null,
      status: "active",
      intended_account_type: input.intended_account_type,
    })
    .select()
    .single();

  if (error) {
    // Roll back the synthetic subscription so we don't leak orphan rows.
    await sb.from("subscriptions").delete().eq("id", synthSub.id);
    if (error.code === "23505") {
      return NextResponse.json({ error: "key_exists" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ license: data }, { status: 201 });
}
