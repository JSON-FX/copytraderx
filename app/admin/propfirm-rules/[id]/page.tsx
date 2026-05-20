import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPropfirmRulesEditRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/propfirm-rules/${encodeURIComponent(id)}`);
}
