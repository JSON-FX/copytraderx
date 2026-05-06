import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { UserTable } from "@/components/admin/user-table";
import type { AppUser } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchUsers(): Promise<AppUser[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch users:", error);
    return [];
  }
  return data as AppUser[];
}

export default async function UsersPage() {
  const users = await fetchUsers();
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {users.length} {users.length === 1 ? "user" : "users"} total
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/users/new">New user</Link>
          </Button>
        </div>
        <UserTable users={users} />
      </main>
    </div>
  );
}
