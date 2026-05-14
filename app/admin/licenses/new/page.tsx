import { redirect } from "next/navigation";

export default function LegacyAdminLicensesNewPage(): never {
  redirect("/admin/subscriptions/new");
}
