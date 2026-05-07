import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { canCancel } from "@/lib/subscription-state";

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
