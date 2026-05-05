import "server-only";
import { getSupabaseAdmin } from "./server";

export type CreateAuthUserInput = {
  email: string;
  password: string;
  role: "admin" | "user";
  full_name?: string;
  email_confirm?: boolean;
};

export async function createAuthUser(input: CreateAuthUserInput) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: input.email_confirm ?? true,
    user_metadata: {
      role: input.role,
      full_name: input.full_name,
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");
  return data.user;
}

export async function findAuthUserByEmail(email: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function invalidateAuthSession(userId: string) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.signOut(userId);
  if (error) throw error;
}
