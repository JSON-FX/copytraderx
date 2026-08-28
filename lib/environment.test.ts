import {
  getAdminSupabaseConfig,
  getAppOrigin,
  getPublicSupabaseConfig,
  validateDeploymentEnvironment,
  validateProductionEmailEnvironment,
  type EnvironmentSource,
} from "./environment";

const validEnvironment: EnvironmentSource = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: `sb_publishable_${"a".repeat(24)}`,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"b".repeat(24)}`,
  NEXT_PUBLIC_APP_URL: "https://copytraderx.vercel.app",
};

describe("deployment environment", () => {
  it("returns validated Supabase and application origins", () => {
    expect(getPublicSupabaseConfig(validEnvironment)).toEqual({
      url: "https://example.supabase.co",
      anonKey: `sb_publishable_${"a".repeat(24)}`,
    });
    expect(getAdminSupabaseConfig(validEnvironment)).toEqual({
      url: "https://example.supabase.co",
      serviceRoleKey: `sb_secret_${"b".repeat(24)}`,
    });
    expect(getAppOrigin(validEnvironment)).toBe(
      "https://copytraderx.vercel.app",
    );
  });

  it("names a missing variable without logging secret values", () => {
    const env = {
      ...validEnvironment,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "do-not-log-this-value",
    };

    expect(() => validateDeploymentEnvironment(env)).toThrow(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );

    try {
      validateDeploymentEnvironment(env);
    } catch (error) {
      expect(String(error)).not.toContain("do-not-log-this-value");
    }
  });

  it("rejects malformed application URLs", () => {
    expect(() =>
      validateDeploymentEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_APP_URL: "copytraderx.vercel.app",
      }),
    ).toThrow("NEXT_PUBLIC_APP_URL must be an absolute HTTP(S) URL");
  });

  it("requires HTTPS for the production Vercel environment", () => {
    expect(() =>
      validateDeploymentEnvironment({
        ...validEnvironment,
        VERCEL_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://copytraderx.vercel.app",
      }),
    ).toThrow("NEXT_PUBLIC_APP_URL must use HTTPS in production");
  });

  it("requires application SMTP settings in production", () => {
    expect(() =>
      validateProductionEmailEnvironment({
        ...validEnvironment,
      }),
    ).toThrow("Missing required environment variable: SMTP_HOST");
  });

  it("accepts a complete production email configuration", () => {
    expect(() =>
      validateProductionEmailEnvironment({
        ...validEnvironment,
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer@example.com",
        SMTP_PASS: "secret-value",
        EMAIL_FROM: "CopyTraderX <mailer@example.com>",
        EMAIL_REPLY_TO: "support@example.com",
      }),
    ).not.toThrow();
  });

  it("rejects an invalid production SMTP port", () => {
    expect(() =>
      validateProductionEmailEnvironment({
        ...validEnvironment,
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "not-a-port",
        SMTP_USER: "mailer@example.com",
        SMTP_PASS: "secret-value",
        EMAIL_FROM: "CopyTraderX <mailer@example.com>",
      }),
    ).toThrow("SMTP_PORT must be an integer from 1 to 65535");
  });

  it("rejects placeholder Supabase keys", () => {
    expect(() =>
      validateDeploymentEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder",
      }),
    ).toThrow(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY does not look like a valid Supabase API key",
    );
  });

  it("rejects mismatched Supabase projects", () => {
    expect(() =>
      validateDeploymentEnvironment({
        ...validEnvironment,
        SUPABASE_URL: "https://another.supabase.co",
      }),
    ).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL must reference the same origin",
    );
  });

  it("rejects a service-role key exposed as the public key", () => {
    expect(() =>
      validateDeploymentEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: `eyJ${"c".repeat(24)}`,
        SUPABASE_SERVICE_ROLE_KEY: `eyJ${"c".repeat(24)}`,
      }),
    ).toThrow(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY must not contain the service-role key",
    );
  });
});
