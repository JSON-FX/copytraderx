import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { resetAuthUserPassword } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email";

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
    .select("id, email, full_name")
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

  const tempPassword = generateTempPassword();
  try {
    await resetAuthUserPassword(id, tempPassword);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "reset_failed", details: msg },
      { status: 500 },
    );
  }

  // Mirror must_change_password=true on public.users.
  const { error: flagErr } = await sbAdmin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", id);
  if (flagErr) {
    console.error("[resend-welcome] failed to set must_change_password:", flagErr.message);
  }

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
  const emailResult = await sendWelcomeEmail({
    to: user.email,
    full_name: user.full_name,
    temp_password: tempPassword,
    login_url: loginUrl,
  });

  return NextResponse.json({
    ok: true,
    email_sent: emailResult.ok,
  });
}
