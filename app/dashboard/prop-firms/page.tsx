import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getPropFirmOverview } from "@/lib/prop-firm-data";
import { PropFirmSummaryStrip } from "@/components/prop-firms/prop-firm-summary-strip";
import { PropFirmTable } from "@/components/prop-firms/prop-firm-table";

export const dynamic = "force-dynamic";

export default async function PropFirmsPage() {
  const sb = await getSupabaseSSR();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const data = await getPropFirmOverview(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Prop Firms</h1>
        <p className="text-sm text-muted-foreground">
          {data.activeCount} active · {data.fundedCount} funded
        </p>
      </div>
      <PropFirmSummaryStrip data={data} />
      <PropFirmTable rows={data.rows} />
    </div>
  );
}
