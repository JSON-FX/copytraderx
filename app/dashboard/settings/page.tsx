import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPnlDisplay } from "@/lib/preferences/server";
import { DashboardNav } from "@/components/user/dashboard-nav";
import { PreferencesForm } from "@/components/user/preferences-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const pnlDisplay = await getPnlDisplay(user.id);

  return (
    <>
      <DashboardNav userEmail={user.email ?? ""} />
      <main className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage how the journal displays your trading activity.</p>
        </header>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preferences</h2>
          <div className="mt-4">
            <PreferencesForm initial={pnlDisplay} />
          </div>
        </section>
      </main>
    </>
  );
}
