import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("licenses")
    .select(
      `
      *,
      subscriptions:subscriptions!licenses_subscription_id_fkey (
        users:users!subscriptions_user_id_fkey ( email )
      )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  const licenses = (data ?? []).map((r) => {
    const owner_email =
      (r as { subscriptions: { users: { email: string } | null } | null }).subscriptions?.users
        ?.email ?? null;
    const { subscriptions: _drop, ...rest } = r as Record<string, unknown> & {
      subscriptions?: unknown;
    };
    return { ...rest, owner_email };
  });
  return NextResponse.json({ licenses });
}
