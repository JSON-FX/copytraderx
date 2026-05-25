import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getSidebarData } from "@/lib/sidebar-data";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { MobileTopBar } from "@/components/sidebar/mobile-top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const sidebarData = await getSidebarData(user.id);

  const cookieStore = await cookies();
  const activeIdRaw = cookieStore.get("ctx.activeAccountId")?.value;
  const activeLicenseId = activeIdRaw ? Number(activeIdRaw) : null;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        sidebarData={sidebarData}
        activeLicenseId={activeLicenseId}
        userEmail={user.email ?? ""}
      />
      <MobileTopBar
        sidebarData={sidebarData}
        activeLicenseId={activeLicenseId}
        userEmail={user.email ?? ""}
      />
      <main className="md:pl-14 lg:pl-[220px] pt-12 md:pt-0">
        <div className="mx-auto max-w-6xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
