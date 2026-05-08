import { sendEmail, sendWelcomeEmail, sendRequestSubmittedEmail, sendSubscriptionGrantedEmail, sendSubscriptionRevokedEmail, mockTransport } from "./email";

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
    if (!result.ok) {
      expect(result.error).toMatch(/smtp down/);
    }
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

  it("greets 'there' when full_name is null", async () => {
    await sendWelcomeEmail(
      {
        to: "newuser@example.com",
        full_name: null,
        temp_password: "Abc12345xyz!",
        login_url: "https://example.com/login",
      },
      mockTransport,
    );
    expect(mockTransport.sent[0].text).toContain("Hi there,");
    expect(mockTransport.sent[0].text).not.toContain("Hi ,");
  });
});

describe("sendRequestSubmittedEmail", () => {
  beforeEach(() => mockTransport.reset());

  it("omits the notes section when notes is null", async () => {
    await sendRequestSubmittedEmail(
      {
        to: "admin@example.com",
        user_email: "user@example.com",
        product_label: "Impulse",
        tier_label: "Monthly",
        notes: null,
      },
      mockTransport,
    );
    const text = mockTransport.sent[0].text;
    expect(text).toContain("user@example.com");
    expect(text).toContain("Impulse");
    expect(text).toContain("Monthly");
    expect(text).not.toContain("Notes:");
  });

  it("includes the notes section when notes is provided", async () => {
    await sendRequestSubmittedEmail(
      {
        to: "admin@example.com",
        user_email: "user@example.com",
        product_label: "Impulse",
        tier_label: "Monthly",
        notes: "renewing my prop firm challenge",
      },
      mockTransport,
    );
    const text = mockTransport.sent[0].text;
    expect(text).toContain("Notes:");
    expect(text).toContain("renewing my prop firm challenge");
  });
});

describe("sendSubscriptionGrantedEmail", () => {
  beforeEach(() => mockTransport.reset());

  it("renders subject and body with product/tier/login_url", async () => {
    const result = await sendSubscriptionGrantedEmail(
      {
        to: "user@example.com",
        product_label: "CTX Live",
        tier_label: "Monthly",
        expires_at: "2026-06-08",
        login_url: "https://copytraderx.example/login",
      },
      mockTransport,
    );
    expect(result.ok).toBe(true);
    expect(mockTransport.sent).toHaveLength(1);
    const msg = mockTransport.sent[0];
    expect(msg.to).toBe("user@example.com");
    expect(msg.subject).toContain("CTX Live");
    expect(msg.text).toContain("Monthly");
    expect(msg.text).toContain("2026-06-08");
    expect(msg.text).toContain("https://copytraderx.example/login");
  });
});

describe("sendSubscriptionRevokedEmail", () => {
  beforeEach(() => mockTransport.reset());

  it("renders subject and body with product/tier", async () => {
    const result = await sendSubscriptionRevokedEmail(
      {
        to: "user@example.com",
        product_label: "Impulse",
        tier_label: "Yearly",
      },
      mockTransport,
    );
    expect(result.ok).toBe(true);
    expect(mockTransport.sent).toHaveLength(1);
    const msg = mockTransport.sent[0];
    expect(msg.subject).toContain("revoked");
    expect(msg.subject).toContain("Impulse");
    expect(msg.text).toContain("Yearly");
  });
});
