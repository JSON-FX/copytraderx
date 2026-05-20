import { notFound, redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { getPropfirmRule } from "@/lib/journal/queries";
import { extractRole } from "@/lib/role";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserRulePage({ params }: PageProps) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();

  const rule = await getPropfirmRule(n);
  if (!rule) notFound();

  const isAdmin = extractRole({ user }) === "admin";
  if (rule.user_id !== user.id && !isAdmin) notFound();

  return (
    <div className="px-6 py-8">
      <RuleForm initial={rule} basePath="/dashboard/propfirm-rules" />
    </div>
  );
}
