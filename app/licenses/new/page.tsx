import Link from "next/link";
import { LicenseForm } from "@/components/license-form";
import { SiteNav } from "@/components/site-nav";

export default function NewLicensePage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <Link href="/licenses" className="text-sm text-muted-foreground hover:underline">
            ← Back to licenses
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">New License</h1>
        </div>
        <LicenseForm mode="create" />
      </main>
    </div>
  );
}
