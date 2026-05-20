import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { RuleForm } from "@/components/propfirm-rules/rule-form";

interface PageProps {
  searchParams: Promise<{ return_to?: string }>;
}

export default async function NewUserRulePage({ searchParams }: PageProps) {
  const ssr = await getSupabaseSSR();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/login");

  const { return_to } = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
      <h1 className="text-xl font-semibold">New propfirm rule</h1>
      <RuleForm basePath="/dashboard/propfirm-rules" returnTo={return_to} />
    </div>
  );
}
