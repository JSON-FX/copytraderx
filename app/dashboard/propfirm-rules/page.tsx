import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { listPropfirmRules } from "@/lib/journal/queries";
import { RulesTable } from "@/components/propfirm-rules/rules-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function UserPropfirmRulesPage() {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const rules = await listPropfirmRules(user.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Propfirm Rules</h1>
        <Button asChild><Link href="/dashboard/propfirm-rules/new">New rule</Link></Button>
      </div>
      <RulesTable rules={rules} basePath="/dashboard/propfirm-rules" />
    </div>
  );
}
