import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";

export default async function HomePage() {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const role = (user.app_metadata?.role as "admin" | "user" | undefined) ?? "user";
  redirect(role === "admin" ? "/admin/licenses" : "/dashboard");
}
