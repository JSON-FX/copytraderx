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
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Dashboard
          </div>
          <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight">
            Propfirm Rules
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Reusable challenge setups you can assign to any of your subscriptions.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/propfirm-rules/new">New rule</Link>
        </Button>
      </header>
      <RulesTable rules={rules} basePath="/dashboard/propfirm-rules" />
    </div>
  );
}
