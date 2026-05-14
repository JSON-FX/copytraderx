import { extractRole, requireAdmin, requireUser, RoleError } from "./role";

type FakeSession = { user: { id: string; app_metadata?: Record<string, unknown> } } | null;

function session(role?: "admin" | "user"): FakeSession {
  if (!role) return null;
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      app_metadata: { role },
    },
  };
}

describe("extractRole", () => {
  it("returns the role when present", () => {
    expect(extractRole(session("admin"))).toBe("admin");
    expect(extractRole(session("user"))).toBe("user");
  });

  it("returns null for null session", () => {
    expect(extractRole(null)).toBeNull();
  });

  it("returns null when app_metadata.role is missing", () => {
    expect(extractRole({ user: { id: "x" } })).toBeNull();
  });

  it("returns null for an unknown role value", () => {
    expect(extractRole({ user: { id: "x", app_metadata: { role: "wizard" } } })).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("returns the admin user when role=admin", () => {
    const s = session("admin")!;
    expect(requireAdmin(s)).toBe(s.user);
  });

  it("throws RoleError('unauthenticated') for null session", () => {
    expect(() => requireAdmin(null)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }) as unknown as Error,
    );
  });

  it("throws RoleError('forbidden') when role=user", () => {
    expect(() => requireAdmin(session("user"))).toThrow(
      expect.objectContaining({ code: "forbidden" }) as unknown as Error,
    );
  });
});

describe("requireUser", () => {
  it("returns the user when role=user", () => {
    const s = session("user")!;
    expect(requireUser(s)).toBe(s.user);
  });

  it("returns the user when role=admin (admin can access user-scoped resources)", () => {
    const s = session("admin")!;
    expect(requireUser(s)).toBe(s.user);
  });

  it("throws unauthenticated for null", () => {
    expect(() => requireUser(null)).toThrow(RoleError);
  });
});
