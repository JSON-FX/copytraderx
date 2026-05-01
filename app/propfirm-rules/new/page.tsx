import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { SiteNav } from "@/components/site-nav";

export default function NewRulePage() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <h1 className="text-xl font-semibold">New propfirm rule</h1>
        <RuleForm />
      </div>
    </>
  );
}
