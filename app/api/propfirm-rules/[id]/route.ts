import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { propfirmRuleSchema } from "@/lib/schemas";
import { getPropfirmRule } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const rule = await getPropfirmRule(n);
  if (!rule) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const parsed = propfirmRuleSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").update(parsed.data).eq("id", n).select().single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("propfirm_rules").delete().eq("id", n);
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
