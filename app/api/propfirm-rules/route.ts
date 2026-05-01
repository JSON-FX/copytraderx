import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { listPropfirmRules } from "@/lib/journal/queries";
import { propfirmRuleSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listPropfirmRules());
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const parsed = propfirmRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("propfirm_rules").insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
