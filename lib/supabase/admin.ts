import { sendEmail } from "../email";
import { getSupabaseAdmin } from "./server";

async function deliverAuthLink(input: {
  email: string;
  actionLink: string;
  kind: "invite" | "recovery";
}) {
  const isInvite = input.kind === "invite";
  const result = await sendEmail({
    to: input.email,
    subject: isInvite
      ? "Set up your CopyTraderX account"
      : "Reset your CopyTraderX password",
    text: [
      isInvite
        ? "An administrator created a CopyTraderX account for you."
        : "An administrator requested a password reset for your CopyTraderX account.",
      "",
      isInvite ? "Set your password:" : "Choose a new password:",
      input.actionLink,
      "",
      "If you did not expect this message, you can ignore it.",
    ].join("\n"),
  });

  if (!result.ok) {
    throw new Error(`Unable to send authentication email: ${result.error}`);
  }
  if (result.skipped) {
    throw new Error("Unable to send authentication email: SMTP is not configured");
  }
}

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
    app_metadata: {
      role: input.role,
      must_change_password: true,
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");
  return data.user;
}

export type InviteAuthUserInput = {
  email: string;
  role: "admin" | "user";
  full_name?: string;
  redirectTo?: string;
};

/**
 * Creates a Supabase Auth invitation link and delivers it through the
 * application's SMTP transport. No temporary password is generated locally.
 */
export async function inviteAuthUser(input: InviteAuthUserInput) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: {
      data: {
        role: input.role,
        full_name: input.full_name,
      },
      redirectTo: input.redirectTo,
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("generateLink returned no user");
  if (!data.properties?.action_link) {
    throw new Error("generateLink returned no invitation URL");
  }

  await deliverAuthLink({
    email: input.email,
    actionLink: data.properties.action_link,
    kind: "invite",
  });

  return data.user;
}

/**
 * Creates a Supabase Auth recovery link and delivers it through the
 * application's SMTP transport.
 */
export async function sendRecoveryEmail(email: string, redirectTo?: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) throw error;
  const actionLink = data.properties?.action_link;
  if (!actionLink) throw new Error("generateLink returned no recovery URL");

  await deliverAuthLink({ email, actionLink, kind: "recovery" });
}

/**
 * Looks up a user by email via public.users (which the auth.users insert
 * trigger keeps in sync). Avoids auth.admin.listUsers, which paginates and
 * has been observed to fail on some Supabase projects with a generic
 * "Database error finding users".
 */
export async function findAuthUserByEmail(email: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function invalidateAuthSession(userId: string) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.signOut(userId);
  if (error) throw error;
}

/**
 * Updates the role on auth.users.app_metadata. The on_users_role_change
 * trigger from migration 20260506000001 keeps public.users.role in sync —
 * but since we're updating from the admin API (which writes
 * auth.users.app_metadata directly), we update public.users separately.
 */
export async function updateAuthUserRole(
  userId: string,
  role: "admin" | "user",
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
  if (error) throw error;
}

/**
 * Resets a user's password to a freshly generated value and forces a
 * password change on next login. Used by "resend welcome".
 */
export async function resetAuthUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.updateUserById(userId, {
    password: newPassword,
    app_metadata: { must_change_password: true },
  });
  if (error) throw error;
}

/**
 * Deletes a user from auth.users. The ON DELETE CASCADE on
 * public.users.id references auth.users(id), so the public.users row
 * goes away automatically. Subscriptions and licenses cascade in turn.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) throw error;
}
