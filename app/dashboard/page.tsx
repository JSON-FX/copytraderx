import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSidebarData } from "@/lib/sidebar-data";

export default async function DashboardPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const activeIdRaw = cookieStore.get("ctx.activeAccountId")?.value;

  if (activeIdRaw) {
    redirect(`/dashboard/${activeIdRaw}`);
  }

  const sidebar = await getSidebarData(user.id);
  const firstAccount = sidebar.active[0]?.liveSlot ?? sidebar.active[0]?.demoSlot;
  if (firstAccount) {
    redirect(`/dashboard/${firstAccount.licenseId}`);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Select an account to get started</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the account switcher in the sidebar to choose an account, or request a new license from your admin.
        </p>
      </div>
    </div>
  );
}
