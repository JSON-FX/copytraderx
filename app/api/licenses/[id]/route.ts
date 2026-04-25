import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { updateLicenseSchema, renewActionSchema } from "@/lib/schemas";
import { calculateExpiresAt } from "@/lib/expiry";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select("*")
    .eq("id", numericId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ license: data });
}

const patchBodySchema = z.union([renewActionSchema, updateLicenseSchema]);

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Expand renew action into a real update payload
  let updatePayload: Record<string, unknown>;
  if ("action" in parsed.data && parsed.data.action === "renew") {
    const expiresAt = calculateExpiresAt(parsed.data.tier, new Date());
    updatePayload = {
      tier: parsed.data.tier,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    };
  } else {
    updatePayload = parsed.data;
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .update(updatePayload)
    .eq("id", numericId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "update_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ license: data });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("licenses").delete().eq("id", numericId);
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
