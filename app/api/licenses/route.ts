import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createLicenseSchema } from "@/lib/schemas";
import { calculateExpiresAt } from "@/lib/expiry";

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
  const now = new Date();
  const expiresAt = calculateExpiresAt(input.tier, now);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .insert({
      license_key: input.license_key,
      mt5_account: input.mt5_account,
      tier: input.tier,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      customer_email: input.customer_email ?? null,
      notes: input.notes ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
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
