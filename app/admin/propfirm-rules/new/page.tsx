import { RuleForm } from "@/components/propfirm-rules/rule-form";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";

export default function NewRulePage() {
  return (
    <>
      <AdminSiteNav />
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-4">
        <h1 className="text-xl font-semibold">New propfirm rule</h1>
        <RuleForm />
      </div>
    </>
  );
}
