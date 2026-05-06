import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { sendRecoveryEmail } from "@/lib/supabase/admin";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const sbAdmin = getSupabaseAdmin();
  const { data: user, error } = await sbAdmin
    .from("users")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/change-password`;
  let actionLink: string | null = null;
  try {
    actionLink = await sendRecoveryEmail(user.email, redirectTo);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "recovery_failed", details: msg },
      { status: 500 },
    );
  }

  // Supabase generated the recovery link and (if SMTP is configured on the
  // project) sent the email. Mirror must_change_password=true on public.users
  // so the user lands on /auth/change-password after clicking through.
  const { error: flagErr } = await sbAdmin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", id);
  if (flagErr) {
    console.error("[resend-welcome] failed to set must_change_password:", flagErr.message);
  }

  return NextResponse.json({
    ok: true,
    action_link: actionLink,
  });
}
