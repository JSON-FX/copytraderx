import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { canHide } from "@/lib/subscription-state";

async function loadIdAndUser(
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: "invalid_id" }, { status: 400 }) };
  }
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  return { id, userId: user.id };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const loaded = await loadIdAndUser(ctx);
  if ("error" in loaded) return loaded.error;
  const { id, userId } = loaded;

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, status, hidden_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Idempotent: already hidden → return current row.
  if (sub.hidden_at !== null) {
    const { data: existing, error } = await sb
      .from("subscriptions")
      .select()
      .eq("id", id)
      .single();
    if (error) {
      return NextResponse.json(
        { error: "lookup_failed", details: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ subscription: existing });
  }

  const guard = canHide({ status: sub.status, hidden_at: sub.hidden_at });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 409 });
  }

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ subscription: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const loaded = await loadIdAndUser(ctx);
  if ("error" in loaded) return loaded.error;
  const { id, userId } = loaded;

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!sub || sub.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({ hidden_at: null })
    .eq("id", id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ subscription: updated });
}
