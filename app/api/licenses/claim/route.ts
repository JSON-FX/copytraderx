import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { claimSlotSchema } from "@/lib/schemas";
import { canClaimOn } from "@/lib/subscription-state";
import { generateLicenseKey } from "@/lib/license-key";

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

  const parsed = claimSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { subscription_id, mt5_account, intended_account_type } = parsed.data;

  const sb = getSupabaseAdmin();

  const { data: sub, error: subErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status, expires_at")
    .eq("id", subscription_id)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: subErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const guard = canClaimOn({ status: sub.status });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const license_key = generateLicenseKey(sub.product);

  const { data, error } = await sb
    .from("licenses")
    .insert({
      license_key,
      mt5_account,
      product: sub.product,
      tier: sub.tier,
      user_id: user.id,
      subscription_id: sub.id,
      // expires_at left null — EA stamps on first activation; matches the
      // admin-direct create path. Once the EA validates, the row carries
      // sub.expires_at via the activate route.
      expires_at: null,
      activated_at: null,
      status: "active",
      intended_account_type,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const detail = error.message ?? "";
      if (detail.includes("idx_licenses_one_per_slot")) {
        return NextResponse.json({ error: "slot_already_claimed" }, { status: 409 });
      }
      if (detail.includes("idx_licenses_mt5_product")) {
        return NextResponse.json({ error: "mt5_already_in_use_for_product" }, { status: 409 });
      }
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ license: data }, { status: 201 });
}
