import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

async function getRole() {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  return extractRole(session ? { user: session.user as never } : null);
}

export async function GET() {
  const role = await getRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ users: data });
}
