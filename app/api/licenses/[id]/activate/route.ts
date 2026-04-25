import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { calculateExpiresAt } from "@/lib/expiry";
import type { LicenseTier } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: existing, error: lookupErr } = await sb
    .from("licenses")
    .select("id, tier, activated_at")
    .eq("id", numericId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: lookupErr.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.activated_at !== null) {
    return NextResponse.json({ error: "already_activated" }, { status: 409 });
  }
  if (existing.tier === null) {
    return NextResponse.json({ error: "tier_missing" }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = calculateExpiresAt(existing.tier as LicenseTier, now);

  const { data, error: updErr } = await sb
    .from("licenses")
    .update({
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", numericId)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ license: data });
}
