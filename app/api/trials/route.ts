import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { createTrialSchema } from "@/lib/schemas";
import { checkTrialDedupe } from "@/lib/trial-dedupe";
import { generateLicenseKey } from "@/lib/license-key";

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createTrialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const sb = getSupabaseAdmin();

  // App-level dedupe pre-check — returns 409 with per-field detail.
  const dedupe = await checkTrialDedupe(sb, {
    email: input.email,
    mt5_account: input.mt5_account,
    telegram_handle: input.telegram_handle ?? null,
    discord_handle: input.discord_handle ?? null,
  });
  if (Object.keys(dedupe).length > 0) {
    return NextResponse.json(
      { error: "duplicate_trial", fields: dedupe },
      { status: 409 },
    );
  }

  // Generate a license key. Retry up to 3 times on the (effectively zero)
  // chance the generated key collides with an existing key in either table.
  let licenseKey = generateLicenseKey(input.product);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count: cLic } = await sb
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .eq("license_key", licenseKey);
    const { count: cTrial } = await sb
      .from("trial_licenses")
      .select("id", { count: "exact", head: true })
      .eq("license_key", licenseKey);
    if ((cLic ?? 0) === 0 && (cTrial ?? 0) === 0) break;
    licenseKey = generateLicenseKey(input.product);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);

  // Insert the lead first.
  const { data: lead, error: leadErr } = await sb
    .from("trial_leads")
    .insert({
      email: input.email,
      telegram_handle: input.telegram_handle ?? null,
      discord_handle: input.discord_handle ?? null,
      notes: input.notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (leadErr) {
    if (leadErr.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_trial", fields: { email: { trial_id: 0, created_at: now.toISOString(), status: "active" } } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "insert_failed", details: leadErr.message }, { status: 500 });
  }

  // Insert the license. If this fails, roll back the lead manually.
  const { data: license, error: licErr } = await sb
    .from("trial_licenses")
    .insert({
      trial_lead_id: lead.id,
      product: input.product,
      license_key: licenseKey,
      mt5_account: input.mt5_account,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (licErr) {
    await sb.from("trial_leads").delete().eq("id", lead.id);
    if (licErr.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_trial", fields: { mt5_account: { trial_id: 0, created_at: now.toISOString(), status: "active" } } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "insert_failed", details: licErr.message }, { status: 500 });
  }

  return NextResponse.json({ trial_lead: lead, trial_license: license }, { status: 201 });
}
