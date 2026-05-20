import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { listPropfirmRules } from "@/lib/journal/queries";
import { propfirmRuleSchema } from "@/lib/schemas";
import { extractRole } from "@/lib/role";
import { decideListTarget } from "@/lib/propfirm-rules-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();

  const url = new URL(req.url);
  const queryUserId = url.searchParams.get("user_id");
  const result = decideListTarget(
    user?.id ?? null,
    extractRole(user ? { user } : null),
    queryUserId,
  );
  if (result.kind === "error") {
    return NextResponse.json({ error: result.code }, { status: result.status });
  }

  try {
    return NextResponse.json(await listPropfirmRules(result.targetUserId));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const parsed = propfirmRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("propfirm_rules")
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "server_error", detail: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
