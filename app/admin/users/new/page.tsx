import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { UserForm } from "@/components/admin/user-form";

export default function NewUserPage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/admin/users"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to users
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">New user</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A welcome email with a temp password is sent on save.
          </p>
        </div>
        <UserForm mode="create" />
      </main>
    </div>
  );
}
