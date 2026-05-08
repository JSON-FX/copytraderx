import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { rejectExtensionSchema } from "@/lib/schemas";
import { sendRequestRejectedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

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
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = rejectExtensionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();

  const { data: ext, error: extErr } = await sb
    .from("subscription_extensions")
    .select("id, subscription_id, user_id, requested_tier, status")
    .eq("id", id)
    .maybeSingle();
  if (extErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: extErr.message },
      { status: 500 },
    );
  }
  if (!ext) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ext.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  const { data: updated, error: updErr } = await sb
    .from("subscription_extensions")
    .update({
      status: "rejected",
      rejection_code: "admin_manual",
      rejection_message: parsed.data.rejection_message,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: "update_failed", details: updErr?.message ?? "no_pending_row" },
      { status: 500 },
    );
  }

  const { data: source } = await sb
    .from("subscriptions")
    .select("product")
    .eq("id", ext.subscription_id)
    .maybeSingle();
  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", ext.user_id)
    .maybeSingle();
  if (source && targetUser?.email) {
    void sendRequestRejectedEmail({
      to: targetUser.email,
      product_label: productDisplayName(source.product),
      tier_label: tierLabel(ext.requested_tier),
      rejection_reason: parsed.data.rejection_message,
      kind: "extension",
    });
  }

  return NextResponse.json({ extension: updated });
}
