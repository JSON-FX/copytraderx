import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { updateUserSchema } from "@/lib/schemas";
import { updateAuthUserRole, deleteAuthUser } from "@/lib/supabase/admin";

async function requireAdminFromSession() {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (extractRole({ user: session.user as never }) !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { adminId: session.user.id };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromSession();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const sb = getSupabaseAdmin();

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: userErr.message },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  if (subsErr) {
    return NextResponse.json(
      { error: "subscriptions_lookup_failed", details: subsErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ user, subscriptions: subs });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromSession();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Don't let an admin demote themselves and lock the system.
  if (input.role && input.role !== "admin" && id === auth.adminId) {
    return NextResponse.json({ error: "cannot_self_demote" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Update public.users first.
  const updatePayload: Record<string, unknown> = {};
  if (input.full_name !== undefined) updatePayload.full_name = input.full_name;
  if (input.role !== undefined) updatePayload.role = input.role;

  const { data: updated, error: updErr } = await sb
    .from("users")
    .update(updatePayload)
    .eq("id", id)
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .maybeSingle();
  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // If role changed, mirror to auth.users.app_metadata explicitly. The
  // on_users_role_change trigger already does this, but we also call the
  // admin API so the user's session is invalidated on next request.
  if (input.role) {
    try {
      await updateAuthUserRole(id, input.role);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[users.PATCH] role-mirror to auth.users failed:", msg);
      // Not fatal — the trigger already mirrored. Surface a warning header.
    }
  }

  return NextResponse.json({ user: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromSession();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  if (id === auth.adminId) {
    return NextResponse.json({ error: "cannot_self_delete" }, { status: 400 });
  }

  // Block deletion of the legacy synthetic admin — it owns the legacy
  // licenses and the admin-direct license-create path. Removing it breaks
  // the existing admin /admin/licenses/new flow until Plan 5 lands.
  const sb = getSupabaseAdmin();
  const { data: target, error: lookupErr } = await sb
    .from("users")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: lookupErr.message },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (target.email === "legacy@copytraderx.local") {
    return NextResponse.json({ error: "cannot_delete_legacy" }, { status: 400 });
  }

  try {
    await deleteAuthUser(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "delete_failed", details: msg },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
