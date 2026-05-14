export type Role = "admin" | "user";

export type SessionUser = {
  id: string;
  app_metadata?: Record<string, unknown>;
};

export type SessionLike = {
  user: SessionUser;
} | null;

export class RoleError extends Error {
  code: "unauthenticated" | "forbidden";
  constructor(code: "unauthenticated" | "forbidden", message?: string) {
    super(message ?? code);
    this.name = "RoleError";
    this.code = code;
  }
}

export function extractRole(session: SessionLike): Role | null {
  if (!session) return null;
  const raw = session.user.app_metadata?.role;
  if (raw === "admin" || raw === "user") return raw;
  return null;
}

export function requireAdmin(session: SessionLike): SessionUser {
  if (!session) throw new RoleError("unauthenticated");
  if (extractRole(session) !== "admin") throw new RoleError("forbidden");
  return session.user;
}

export function requireUser(session: SessionLike): SessionUser {
  if (!session) throw new RoleError("unauthenticated");
  const role = extractRole(session);
  // Admins can access user-scoped resources (e.g. viewing a user's journal as admin).
  // Strictly user-only checks should compare extractRole() === "user" directly.
  if (role !== "admin" && role !== "user") throw new RoleError("forbidden");
  return session.user;
}
