import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPnlDisplay } from "@/lib/preferences/server";
import { PreferencesForm } from "@/components/user/preferences-form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const pnlDisplay = await getPnlDisplay(user.id);

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Preferences
      </h2>
      <div className="mt-4">
        <PreferencesForm initial={pnlDisplay} />
      </div>
    </section>
  );
}
