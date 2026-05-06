import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { createUserSchema } from "@/lib/schemas";
import { inviteAuthUser, findAuthUserByEmail } from "@/lib/supabase/admin";
import { calculateExpiresAt } from "@/lib/expiry";

export async function GET() {
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
  return NextResponse.json({ users: data ?? [] });
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

  // Invite via Supabase: creates the auth.users row AND sends the welcome
  // email through Supabase's configured SMTP. The user clicks the link in
  // the email to set their password on first sign-in.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/change-password`;
  let createdId: string;
  try {
    const created = await inviteAuthUser({
      email: input.email,
      role: input.role,
      full_name: input.full_name ?? undefined,
      redirectTo,
    });
    createdId = created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "invite_failed", details: msg },
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

  // Supabase already sent the invite email via inviteUserByEmail above.
  return NextResponse.json(
    {
      user_id: createdId,
      subscription_id: subscriptionId,
    },
    { status: 201 },
  );
}
