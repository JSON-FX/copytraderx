import { notFound } from "next/navigation";
import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { SiteNav } from "@/components/site-nav";
import { getPropfirmRule } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isFinite(n)) notFound();
  const rule = await getPropfirmRule(n);
  if (!rule) notFound();
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Edit rule: {rule.name}</h1>
        <RuleForm initial={rule} />
      </div>
    </>
  );
}
