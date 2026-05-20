import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { canCancel } from "@/lib/subscription-state";
import { extractRole } from "@/lib/role";
import { updateSubscriptionPolicySchema } from "@/lib/schemas";
import { decideSubscriptionPatch } from "@/lib/propfirm-rules-auth";

export async function DELETE(
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

  const sb = getSupabaseAdmin();

  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const guard = canCancel({ status: sub.status });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const { error: delErr } = await sb.from("subscriptions").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "delete_failed", details: delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = updateSubscriptionPolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: "lookup_failed", details: fetchErr.message }, { status: 500 });

  // Pre-fetch the rule when propfirm_rule_id is being set to a non-null value.
  const ruleRequired =
    parsed.data.propfirm_rule_id !== undefined &&
    parsed.data.propfirm_rule_id !== null;
  let rule: { user_id: string } | null = null;
  if (ruleRequired) {
    const { data: fetchedRule } = await sb
      .from("propfirm_rules")
      .select("user_id")
      .eq("id", parsed.data.propfirm_rule_id as number)
      .maybeSingle();
    rule = fetchedRule;
  }

  const decision = decideSubscriptionPatch({
    callerId: user.id,
    callerRole: extractRole({ user }),
    subscription: sub,
    body: parsed.data,
    rule,
    ruleRequired,
  });
  if (decision.kind === "error") {
    return NextResponse.json({ error: decision.code }, { status: decision.status });
  }

  const { data: updated, error } = await sb
    .from("subscriptions")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "update_failed", details: error.message }, { status: 500 });

  return NextResponse.json({ subscription: updated });
}
