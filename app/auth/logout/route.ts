import { NextResponse } from "next/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";

export async function POST() {
  const sb = await getSupabaseSSR();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"), {
    status: 303,
  });
}
