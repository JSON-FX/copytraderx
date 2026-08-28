import { NextResponse } from "next/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getAppOrigin } from "@/lib/environment";

export async function POST() {
  const sb = await getSupabaseSSR();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", getAppOrigin()), {
    status: 303,
  });
}
