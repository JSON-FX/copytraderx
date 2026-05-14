import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { convertTrialSchema } from "@/lib/schemas";

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
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = convertTrialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { data: lead, error: leadErr } = await sb
    .from("trial_leads")
    .update({
      status: "converted",
      converted_user_id: parsed.data.converted_user_id ?? null,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: "update_failed", details: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: license, error: licErr } = await sb
    .from("trial_licenses")
    .update({ status: "revoked" })
    .eq("trial_lead_id", id)
    .select()
    .maybeSingle();
  if (licErr) {
    await sb.from("trial_leads").update({ status: "active", converted_user_id: null }).eq("id", id);
    return NextResponse.json({ error: "update_failed", details: licErr.message }, { status: 500 });
  }

  return NextResponse.json({ trial_lead: lead, trial_license: license });
}
