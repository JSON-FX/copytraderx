const mockGenerateLink = jest.fn();
const mockGetSupabaseAdmin = jest.fn(() => ({
  auth: { admin: { generateLink: mockGenerateLink } },
}));
const mockSendEmail = jest.fn();

jest.mock("./server", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

jest.mock("../email", () => ({
  sendEmail: mockSendEmail,
}));

import { inviteAuthUser, sendRecoveryEmail } from "./admin";

describe("Supabase authentication emails", () => {
  beforeEach(() => {
    mockGenerateLink.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ ok: true });
  });

  it("creates and delivers an invitation link through application SMTP", async () => {
    const user = { id: "user-1" };
    mockGenerateLink.mockResolvedValue({
      data: {
        user,
        properties: { action_link: "https://supabase.test/invite" },
      },
      error: null,
    });

    await expect(
      inviteAuthUser({
        email: "user@example.com",
        role: "user",
        full_name: "Example User",
        redirectTo: "https://copytraderx.vercel.app/auth/change-password",
      }),
    ).resolves.toBe(user);

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "user@example.com",
      options: {
        data: { role: "user", full_name: "Example User" },
        redirectTo:
          "https://copytraderx.vercel.app/auth/change-password",
      },
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        text: expect.stringContaining("https://supabase.test/invite"),
      }),
    );
  });

  it("creates and delivers a recovery link through application SMTP", async () => {
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { action_link: "https://supabase.test/recovery" },
      },
      error: null,
    });

    await sendRecoveryEmail(
      "user@example.com",
      "https://copytraderx.vercel.app/auth/change-password",
    );

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "user@example.com",
      options: {
        redirectTo:
          "https://copytraderx.vercel.app/auth/change-password",
      },
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        text: expect.stringContaining("https://supabase.test/recovery"),
      }),
    );
  });

  it.each([
    [{ ok: false, error: "SMTP unavailable" }, "SMTP unavailable"],
    [{ ok: true, skipped: true }, "SMTP is not configured"],
  ])("rejects when application email delivery fails", async (result, message) => {
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { action_link: "https://supabase.test/recovery" },
      },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(result);

    await expect(sendRecoveryEmail("user@example.com")).rejects.toThrow(
      message,
    );
  });
});
