import { sendEmail, sendWelcomeEmail, mockTransport } from "./email";

describe("sendEmail (mock transport)", () => {
  beforeEach(() => mockTransport.reset());

  it("captures a send in the mock transport", async () => {
    const result = await sendEmail(
      { to: "user@example.com", subject: "Hi", text: "Body" },
      mockTransport,
    );
    expect(result).toEqual({ ok: true });
    expect(mockTransport.sent).toHaveLength(1);
    expect(mockTransport.sent[0]).toMatchObject({
      to: "user@example.com",
      subject: "Hi",
      text: "Body",
    });
  });

  it("returns ok:false when the transport throws — never bubbles", async () => {
    const throwingTransport = {
      send: async () => {
        throw new Error("smtp down");
      },
    };
    const result = await sendEmail(
      { to: "user@example.com", subject: "Hi", text: "Body" },
      throwingTransport,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/smtp down/);
  });
});

describe("sendWelcomeEmail", () => {
  beforeEach(() => mockTransport.reset());

  it("includes the temp password and the login URL in the body", async () => {
    await sendWelcomeEmail(
      {
        to: "newuser@example.com",
        full_name: "New User",
        temp_password: "Abc12345xyz!",
        login_url: "https://example.com/login",
      },
      mockTransport,
    );

    expect(mockTransport.sent).toHaveLength(1);
    const sent = mockTransport.sent[0];
    expect(sent.to).toBe("newuser@example.com");
    expect(sent.subject).toMatch(/CopyTraderX/i);
    expect(sent.text).toContain("Abc12345xyz!");
    expect(sent.text).toContain("https://example.com/login");
    expect(sent.text).toContain("New User");
  });
});
