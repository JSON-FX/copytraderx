import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { propfirmRuleSchema } from "@/lib/schemas";
import { getPropfirmRule } from "@/lib/journal/queries";
import { extractRole, type Role } from "@/lib/role";
import type { PropfirmRule } from "@/lib/types";

export const dynamic = "force-dynamic";

type AuthOk = { user: { id: string }; role: Role | null; rule: PropfirmRule };
type AuthErr = { error: "unauthenticated" | "not_found"; status: 401 | 404 };

async function authorize(id: number): Promise<AuthOk | AuthErr> {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { error: "unauthenticated", status: 401 };

  const role: Role | null = extractRole({ user });
  const rule = await getPropfirmRule(id);
  if (!rule) return { error: "not_found", status: 404 };

  // 404 (not 403) when foreign — don't leak existence of other users' rule IDs.
  if (rule.user_id !== user.id && role !== "admin") {
    return { error: "not_found", status: 404 };
  }

  return { user, role, rule };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const result = await authorize(n);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.rule);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const result = await authorize(n);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const parsed = propfirmRuleSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });

  // user_id is not patchable — strip if the client tries.
  const { user_id: _ignored, ...patchable } = parsed.data as Partial<PropfirmRule>;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .update(patchable)
    .eq("id", n)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const result = await authorize(n);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("propfirm_rules").delete().eq("id", n);
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
