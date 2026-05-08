import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminSiteNav } from "@/components/admin/admin-site-nav";
import { UserForm } from "@/components/admin/user-form";
import { UserSubscriptionsPanel } from "@/components/admin/user-subscriptions-panel";
import type { AppUser, Subscription } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchUserAndSubs(id: string): Promise<{
  user: AppUser;
  subscriptions: Subscription[];
} | null> {
  const sb = getSupabaseAdmin();
  const { data: user } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!user) return null;
  const { data: subs } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  return { user: user as AppUser, subscriptions: (subs ?? []) as Subscription[] };
}

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchUserAndSubs(id);
  if (!result) notFound();
  const { user, subscriptions } = result;

  return (
    <div className="min-h-screen">
      <AdminSiteNav />
      <main className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        <div>
          <Link
            href="/admin/users"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to users
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{user.email}</h1>
          {user.full_name && (
            <p className="mt-1 text-sm text-muted-foreground">{user.full_name}</p>
          )}
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Account</h2>
          <UserForm mode="edit" initial={user} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Subscriptions</h2>
          <UserSubscriptionsPanel subscriptions={subscriptions} />
        </section>
      </main>
    </div>
  );
}
