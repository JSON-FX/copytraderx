export type EnvironmentSource = Record<string, string | undefined>;

function readRequired(
  env: EnvironmentSource,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readHttpUrl(
  env: EnvironmentSource,
  name: string,
): URL {
  const value = readRequired(env, name);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }

  return url;
}

function readSupabaseKey(
  env: EnvironmentSource,
  name: string,
  acceptedPrefixes: readonly string[],
): string {
  const value = readRequired(env, name);
  if (
    value.length < 20 ||
    !acceptedPrefixes.some((prefix) => value.startsWith(prefix))
  ) {
    throw new Error(`${name} does not look like a valid Supabase API key`);
  }
  return value;
}

function readEmailAddress(
  env: EnvironmentSource,
  name: string,
): string {
  const value = readRequired(env, name);
  const bracketedAddress = value.match(/<([^<>]+)>/)?.[1];
  const address = bracketedAddress ?? value;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error(`${name} must contain a valid email address`);
  }

  return value;
}

export function validateProductionEmailEnvironment(
  env: EnvironmentSource = process.env,
): void {
  const host = readRequired(env, "SMTP_HOST");
  const portValue = readRequired(env, "SMTP_PORT");
  readRequired(env, "SMTP_USER");
  readRequired(env, "SMTP_PASS");
  readEmailAddress(env, "EMAIL_FROM");

  if (/\s/.test(host)) {
    throw new Error("SMTP_HOST must be a hostname without spaces");
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer from 1 to 65535");
  }

  if (env.EMAIL_REPLY_TO?.trim()) {
    readEmailAddress(env, "EMAIL_REPLY_TO");
  }
}

export function getPublicSupabaseConfig(
  env: EnvironmentSource = process.env,
) {
  return {
    url: readHttpUrl(env, "NEXT_PUBLIC_SUPABASE_URL").origin,
    anonKey: readSupabaseKey(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY", [
      "eyJ",
      "sb_publishable_",
    ]),
  };
}

export function getAdminSupabaseConfig(
  env: EnvironmentSource = process.env,
) {
  return {
    url: readHttpUrl(env, "SUPABASE_URL").origin,
    serviceRoleKey: readSupabaseKey(env, "SUPABASE_SERVICE_ROLE_KEY", [
      "eyJ",
      "sb_secret_",
    ]),
  };
}

export function getAppOrigin(
  env: EnvironmentSource = process.env,
): string {
  return readHttpUrl(env, "NEXT_PUBLIC_APP_URL").origin;
}

export function validateDeploymentEnvironment(
  env: EnvironmentSource = process.env,
): void {
  const publicConfig = getPublicSupabaseConfig(env);
  const adminConfig = getAdminSupabaseConfig(env);
  const appOrigin = getAppOrigin(env);

  if (
    env.VERCEL_ENV === "production" &&
    new URL(appOrigin).protocol !== "https:"
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
  }

  if (publicConfig.url !== adminConfig.url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL must reference the same origin",
    );
  }

  if (publicConfig.anonKey === adminConfig.serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY must not contain the service-role key",
    );
  }
}
