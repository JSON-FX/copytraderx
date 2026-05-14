import Link from "next/link";
import { listPropfirmRules } from "@/lib/journal/queries";
import { RulesTable } from "@/components/propfirm-rules/rules-table";
import { Button } from "@/components/ui/button";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";

export const dynamic = "force-dynamic";

export default async function PropfirmRulesPage() {
  const rules = await listPropfirmRules();
  return (
    <>
      <AdminSiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Propfirm Rules</h1>
          <Button asChild><Link href="/admin/propfirm-rules/new">New rule</Link></Button>
        </div>
        <RulesTable rules={rules} />
      </div>
    </>
  );
}
