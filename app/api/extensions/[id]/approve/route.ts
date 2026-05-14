import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canExtendFrom, canExtendToTier } from "@/lib/subscription-state";
import { calculateExpiresAt } from "@/lib/expiry";
import {
  sendRequestApprovedEmail,
  sendRequestRejectedEmail,
  rejectionCopyFor,
} from "@/lib/email";
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

  const { data: source, error: srcErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status, expires_at")
    .eq("id", ext.subscription_id)
    .maybeSingle();
  if (srcErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: srcErr.message },
      { status: 500 },
    );
  }
  if (!source) {
    return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  }

  const activeGuard = canExtendFrom({ status: source.status });
  if (!activeGuard.ok) {
    // Auto-reject the extension to keep audit clean.
    await sb
      .from("subscription_extensions")
      .update({
        status: "rejected",
        rejection_code: "source_revoked_before_approval",
        rejection_message: rejectionCopyFor("source_revoked_before_approval")!,
      })
      .eq("id", id)
      .eq("status", "pending");
    const { data: targetUser } = await sb
      .from("users")
      .select("email")
      .eq("id", ext.user_id)
      .maybeSingle();
    if (targetUser?.email) {
      void sendRequestRejectedEmail({
        to: targetUser.email,
        product_label: productDisplayName(source.product),
        tier_label: tierLabel(ext.requested_tier),
        rejection_reason: rejectionCopyFor("source_revoked_before_approval")!,
        kind: "extension",
      });
    }
    return NextResponse.json({ error: "source_not_active" }, { status: 409 });
  }

  const tierGuard = canExtendToTier(source.tier, ext.requested_tier);
  if (!tierGuard.ok) {
    return NextResponse.json({ error: tierGuard.reason }, { status: 422 });
  }

  const oldExpiresAt = source.expires_at ? new Date(source.expires_at) : new Date();
  const newExpiresAt = calculateExpiresAt(ext.requested_tier, oldExpiresAt);

  if (newExpiresAt.getTime() <= Date.now()) {
    // Race: source effectively expired between request and approve. Auto-reject.
    await sb
      .from("subscription_extensions")
      .update({
        status: "rejected",
        rejection_code: "source_expired_before_approval",
        rejection_message: rejectionCopyFor("source_expired_before_approval")!,
      })
      .eq("id", id)
      .eq("status", "pending");
    const { data: targetUser } = await sb
      .from("users")
      .select("email")
      .eq("id", ext.user_id)
      .maybeSingle();
    if (targetUser?.email) {
      void sendRequestRejectedEmail({
        to: targetUser.email,
        product_label: productDisplayName(source.product),
        tier_label: tierLabel(ext.requested_tier),
        rejection_reason: rejectionCopyFor("source_expired_before_approval")!,
        kind: "extension",
      });
    }
    return NextResponse.json({ error: "source_expired_before_approval" }, { status: 409 });
  }

  // Step 1: bump source row, gated on still-active.
  const { data: updatedSrc, error: srcUpdErr } = await sb
    .from("subscriptions")
    .update({
      expires_at: newExpiresAt.toISOString(),
      tier: ext.requested_tier,
    })
    .eq("id", source.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (srcUpdErr) {
    return NextResponse.json(
      { error: "update_failed", details: srcUpdErr.message },
      { status: 500 },
    );
  }
  if (!updatedSrc) {
    return NextResponse.json({ error: "concurrent_modification" }, { status: 409 });
  }

  // Step 2: stamp audit row.
  const { data: stampedExt, error: stampErr } = await sb
    .from("subscription_extensions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      old_tier: source.tier,
      new_tier: ext.requested_tier,
      old_expires_at: source.expires_at,
      new_expires_at: newExpiresAt.toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (stampErr || !stampedExt) {
    // Audit stamp failed AFTER source bump committed. Surface the error;
    // operator must hand-reconcile the audit row. Rare — only happens if
    // another concurrent writer flipped the audit row's status in the
    // ~ms between the two updates.
    return NextResponse.json(
      { error: "audit_stamp_failed", details: stampErr?.message ?? "no_pending_row" },
      { status: 500 },
    );
  }

  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", ext.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendRequestApprovedEmail({
      to: targetUser.email,
      product_label: productDisplayName(source.product),
      tier_label: tierLabel(ext.requested_tier),
      expires_at: newExpiresAt.toISOString().slice(0, 10),
      kind: "extension",
    });
  }

  return NextResponse.json({ extension: stampedExt });
}
