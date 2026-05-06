import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { createUserSchema } from "@/lib/schemas";
import { createAuthUser, findAuthUserByEmail } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email";
import { calculateExpiresAt } from "@/lib/expiry";

async function getRole() {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  return extractRole(session ? { user: session.user as never } : null);
}

export async function GET() {
  const role = await getRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ users: data });
}

export async function POST(req: Request) {
  // Re-read role from the SSR session (defense in depth, per spec §4.2).
  const sbSSR = await getSupabaseSSR();
  const {
    data: { session },
  } = await sbSSR.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const adminId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Reject duplicate email up front for a clean error message.
  const existing = await findAuthUserByEmail(input.email);
  if (existing) {
    return NextResponse.json({ error: "email_in_use" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  let createdId: string;
  try {
    const created = await createAuthUser({
      email: input.email,
      password: tempPassword,
      role: input.role,
      full_name: input.full_name ?? undefined,
      email_confirm: true,
    });
    createdId = created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "create_failed", details: msg },
      { status: 500 },
    );
  }

  const sb = getSupabaseAdmin();

  // Stamp created_by on the public.users row that the trigger inserted.
  // (The trigger doesn't know the calling admin.) full_name was set by
  // createAuthUser via raw_user_meta_data, but only when present, so we also
  // re-write it here to handle the null-vs-undefined edge case.
  {
    const { error } = await sb
      .from("users")
      .update({
        created_by: adminId,
        full_name: input.full_name ?? null,
      })
      .eq("id", createdId);
    if (error) {
      console.error("[users.POST] failed to stamp created_by:", error.message);
    }
  }

  // Optional initial subscription.
  let subscriptionId: number | null = null;
  if (input.initial_subscription) {
    const { product, tier } = input.initial_subscription;
    const now = new Date();
    const expires = calculateExpiresAt(tier, now);
    const { data: sub, error: subErr } = await sb
      .from("subscriptions")
      .insert({
        user_id: createdId,
        product,
        tier,
        status: "active",
        approved_at: now.toISOString(),
        approved_by: adminId,
        expires_at: expires.toISOString(),
        notes: "initial subscription provisioned at user creation",
      })
      .select("id")
      .single();

    if (subErr || !sub) {
      console.error(
        "[users.POST] initial subscription insert failed:",
        subErr?.message,
      );
      // We do not roll back the user — the admin can re-issue the subscription
      // from the user detail page (Plan 5 surface). Surface the partial
      // failure to the client so the UI can warn.
      return NextResponse.json(
        {
          user_id: createdId,
          warning: "subscription_create_failed",
          details: subErr?.message ?? "unknown",
        },
        { status: 207 },
      );
    }
    subscriptionId = sub.id;
  }

  // Send welcome email. Best-effort; log and continue on failure.
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
  const emailResult = await sendWelcomeEmail({
    to: input.email,
    full_name: input.full_name ?? null,
    temp_password: tempPassword,
    login_url: loginUrl,
  });
  if (!emailResult.ok) {
    console.error("[users.POST] welcome email failed:", emailResult.error);
  }

  return NextResponse.json(
    {
      user_id: createdId,
      subscription_id: subscriptionId,
      email_sent: emailResult.ok,
    },
    { status: 201 },
  );
}
