import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canReject } from "@/lib/subscription-state";
import { rejectSubscriptionSchema } from "@/lib/schemas";
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
  const parsed = rejectSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr)
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guard = canReject({ status: sub.status });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.rejection_reason,
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr)
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );

  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", sub.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendRequestRejectedEmail({
      to: targetUser.email,
      product_label: productDisplayName(sub.product),
      tier_label: tierLabel(sub.tier),
      rejection_reason: parsed.data.rejection_reason,
    });
  }

  return NextResponse.json({ subscription: updated });
}
