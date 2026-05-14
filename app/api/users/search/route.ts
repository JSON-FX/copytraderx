import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export async function GET(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length === 0) return NextResponse.json({ users: [] });

  const sb = getSupabaseAdmin();
  const escaped = q.replace(/[%_,]/g, (c) => `\\${c}`);
  const { data, error } = await sb
    .from("users")
    .select("id, email, full_name")
    .or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
    .order("email")
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}
