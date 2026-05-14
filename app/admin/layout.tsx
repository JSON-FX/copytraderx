import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const role = extractRole(session ? { user: session.user as never } : null);
  if (!session) redirect("/login");
  if (role !== "admin") redirect("/dashboard");
  return <>{children}</>;
}
