import nodemailer from "nodemailer";
import type { RejectionCode } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendResult = { ok: true; skipped?: boolean } | { ok: false; error: string };

export type EmailTransport = {
  send: (msg: EmailMessage) => Promise<void>;
  /**
   * Optional readiness probe. When defined and returning false, the dispatcher
   * (`sendEmail`) skips the call and returns `{ ok: true, skipped: true }` so
   * misconfigured environments are visible to callers (rather than looking
   * identical to a successful send). Transports that omit this method are
   * always considered available.
   */
  isAvailable?: () => boolean;
};

// ── Transports ────────────────────────────────────────────────────────────────

/** Real SMTP transport. Lazily instantiated so missing env vars don't crash imports. */
export const smtpTransport: EmailTransport = {
  isAvailable() {
    return Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.EMAIL_FROM,
    );
  },
  async send(msg) {
    // Dispatcher (`sendEmail`) gates on `isAvailable()`, so we can assume env
    // vars are present here.
    const host = process.env.SMTP_HOST!;
    const port = process.env.SMTP_PORT!;
    const user = process.env.SMTP_USER!;
    const pass = process.env.SMTP_PASS!;
    const from = process.env.EMAIL_FROM!;

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    const replyTo = process.env.EMAIL_REPLY_TO;
    await transporter.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      ...(replyTo ? { replyTo } : {}),
    });
  },
};

/** In-memory transport for tests. Captures every send. */
type MockTransport = EmailTransport & {
  sent: EmailMessage[];
  reset: () => void;
};

function makeMockTransport(): MockTransport {
  const sent: EmailMessage[] = [];
  return {
    sent,
    reset() {
      sent.length = 0;
    },
    async send(msg) {
      sent.push(msg);
    },
  };
}

export const mockTransport: MockTransport = makeMockTransport();

// ── Generic dispatcher ────────────────────────────────────────────────────────

/**
 * Send a single transactional email. Never throws — failures return
 * { ok: false, error } so callers can log without aborting the surrounding
 * DB transaction (per spec §4.3).
 */
export async function sendEmail(
  msg: EmailMessage,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  if (transport.isAvailable && !transport.isAvailable()) {
    console.warn(
      `[email] SMTP env vars missing; skipping send to ${msg.to} (subject: ${msg.subject})`,
    );
    return { ok: true, skipped: true };
  }
  try {
    await transport.send(msg);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] send failed to=${msg.to} subject="${msg.subject}":`, error);
    return { ok: false, error };
  }
}

// ── Typed senders ─────────────────────────────────────────────────────────────

export type WelcomeEmailInput = {
  to: string;
  full_name: string | null;
  temp_password: string;
  login_url: string;
};

export async function sendWelcomeEmail(
  input: WelcomeEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const greetingName = input.full_name?.trim() || "there";
  const text = [
    `Hi ${greetingName},`,
    ``,
    `An administrator has created a CopyTraderX account for you.`,
    ``,
    `Your temporary password: ${input.temp_password}`,
    `Sign in: ${input.login_url}`,
    ``,
    `You will be asked to set a new password on first login.`,
    ``,
    `— CopyTraderX`,
  ].join("\n");
  return sendEmail(
    {
      to: input.to,
      subject: "Your CopyTraderX account is ready",
      text,
    },
    transport,
  );
}

// ── Scaffolded senders (wired up in Plans 4 & 5) ──────────────────────────────

export type EmailKind = "license" | "extension";

export type RequestSubmittedEmailInput = {
  to: string;
  user_email: string;
  product_label: string;
  tier_label: string;
  notes: string | null;
  kind?: EmailKind; // default "license"
};

export async function sendRequestSubmittedEmail(
  input: RequestSubmittedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const kind: EmailKind = input.kind ?? "license";
  const prefix = kind === "extension" ? "[Extension]" : "[New License]";
  const noun = kind === "extension" ? "extension request" : "license request";
  const lines = [
    `New ${noun} from ${input.user_email}.`,
    ``,
    `Product: ${input.product_label}`,
    `Tier: ${input.tier_label}`,
  ];
  if (input.notes) lines.push(``, `Notes:`, input.notes);
  return sendEmail(
    {
      to: input.to,
      subject: `${prefix} ${input.product_label} (${input.tier_label})`,
      text: lines.join("\n"),
    },
    transport,
  );
}

export type RequestApprovedEmailInput = {
  to: string;
  product_label: string;
  tier_label: string;
  expires_at: string;
  kind?: EmailKind;
};

export async function sendRequestApprovedEmail(
  input: RequestApprovedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const kind: EmailKind = input.kind ?? "license";
  const subjectPrefix = kind === "extension" ? "Extension approved" : "License approved";
  const body =
    kind === "extension"
      ? [
          `Your ${input.product_label} (${input.tier_label}) extension has been approved.`,
          ``,
          `New expiry: ${input.expires_at}`,
          ``,
          `Your existing slots and licenses are unchanged.`,
        ]
      : [
          `Your ${input.product_label} (${input.tier_label}) license has been approved.`,
          ``,
          `Valid until: ${input.expires_at}`,
          ``,
          `Sign in to claim your live and demo slots.`,
        ];
  return sendEmail(
    {
      to: input.to,
      subject: `${subjectPrefix}: ${input.product_label}`,
      text: body.join("\n"),
    },
    transport,
  );
}

export type RequestRejectedEmailInput = {
  to: string;
  product_label: string;
  tier_label: string;
  rejection_reason: string;
  kind?: EmailKind;
};

export async function sendRequestRejectedEmail(
  input: RequestRejectedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const kind: EmailKind = input.kind ?? "license";
  const noun = kind === "extension" ? "extension request" : "license request";
  const subjectPrefix = kind === "extension" ? "Extension request not approved" : "License request not approved";
  const text = [
    `Your ${input.product_label} (${input.tier_label}) ${noun} was not approved.`,
    ``,
    `Reason:`,
    input.rejection_reason,
  ].join("\n");
  return sendEmail(
    {
      to: input.to,
      subject: `${subjectPrefix}: ${input.product_label}`,
      text,
    },
    transport,
  );
}

export type SubscriptionGrantedEmailInput = {
  to: string;
  product_label: string;
  tier_label: string;
  expires_at: string;
  login_url: string;
};

export async function sendSubscriptionGrantedEmail(
  input: SubscriptionGrantedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const text = [
    `An administrator has granted you a ${input.product_label} (${input.tier_label}) subscription.`,
    ``,
    `Valid until: ${input.expires_at}`,
    ``,
    `Sign in to claim your live and demo slots:`,
    input.login_url,
    ``,
    `— CopyTraderX`,
  ].join("\n");
  return sendEmail(
    {
      to: input.to,
      subject: `Subscription granted: ${input.product_label} (${input.tier_label})`,
      text,
    },
    transport,
  );
}

export type SubscriptionRevokedEmailInput = {
  to: string;
  product_label: string;
  tier_label: string;
};

export async function sendSubscriptionRevokedEmail(
  input: SubscriptionRevokedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const text = [
    `Your ${input.product_label} (${input.tier_label}) subscription has been revoked by an administrator.`,
    ``,
    `Any active licenses on this subscription are now deactivated. If this was unexpected, please reply to this email.`,
    ``,
    `— CopyTraderX`,
  ].join("\n");
  return sendEmail(
    {
      to: input.to,
      subject: `Subscription revoked: ${input.product_label} (${input.tier_label})`,
      text,
    },
    transport,
  );
}

const AUTO_REJECT_COPY: Record<Exclude<RejectionCode, "admin_manual">, string> = {
  source_expired_before_approval:
    "Your subscription expired before we could approve your extension. Submit a fresh renewal from your dashboard.",
  source_revoked_before_approval:
    "This subscription was revoked before the extension could be approved. Contact support if you believe this is an error.",
};

/**
 * Returns user-facing copy for an auto-reject rejection_code, or `null` for
 * `admin_manual` (caller uses the stored rejection_message verbatim).
 */
export function rejectionCopyFor(code: RejectionCode): string | null {
  if (code === "admin_manual") return null;
  return AUTO_REJECT_COPY[code];
}

/** True only if the message was actually delivered to the transport (not skipped). */
export function wasSent(result: SendResult): boolean {
  return result.ok && !("skipped" in result && result.skipped === true);
}
