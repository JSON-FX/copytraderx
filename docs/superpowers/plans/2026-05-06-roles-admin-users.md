# Admin Users + Email Module — Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin "Users" surface (`/admin/users`, `/admin/users/new`, `/admin/users/[id]`) and the transactional `lib/email.ts` module that the rest of the system uses for user-facing notifications. Includes the API routes that back the admin Users UI: list users, create user (with optional initial subscription), update user (role / `must_change_password`), and a "Resend welcome email" action.

**Architecture:** Three layers, mirroring the existing `/admin/licenses` shape:

1. **Server pages** under `app/admin/users/*` render lists/forms; they call the API routes via `fetch` from client components and read directly via the service-role client for SSR data.
2. **API routes** under `app/api/users/*` enforce `requireAdmin` (re-checking the session, not trusting middleware), validate with Zod, and call `lib/supabase/admin.ts` for `auth.users` writes + `getSupabaseAdmin()` for `public.users` writes. A **single create** writes both rows + (optionally) a `subscriptions` row in one transaction-shaped function so partial failures roll back via cleanup.
3. **Email module** (`lib/email.ts`) wraps Supabase Auth's built-in SMTP for transactional sends. It exposes typed functions per email type (welcome, request-submitted, request-approved, request-rejected) and never throws — it logs and returns `{ ok, error }`. Failures do not block the surrounding DB transaction (per spec §4.3).

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase Auth admin API + `@supabase/ssr` (existing) + Zod (existing) + Jest (existing). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-06-admin-client-roles-design.md` — sections that bind this plan: §4.3 (email), §5.1 (users table), §6.1 (admin creates a user), §8 (auth/error handling), §11 (file layout).

**Branch:** `feat/admin-client-roles`. Already created in Plans 1 & 2; do **not** switch.

**Prerequisites:** Plan 1 ✅ (users table, auth, middleware, seed admin) and Plan 2 ✅ (subscriptions table, multi-product licenses, RLS, backfill). Confirm with `git log --oneline -10` that `faca416 docs(plan): close out Plan 2` is in history.

---

## Resuming this plan in a new session

Same protocol as Plans 1 & 2:

1. Confirm branch: `git branch --show-current` → `feat/admin-client-roles`.
2. Find the first unchecked `- [ ]` step in this file. That is your starting point.
3. Verify the previous task's commit landed: `git log --oneline -10`.
4. Read the **Status** block immediately below.
5. Each completed step flips its `- [ ]` to `- [x]` **in the same commit** as the code change. `git log -- docs/superpowers/plans/2026-05-06-roles-admin-users.md` shows the precise progression.
6. **Never** delete checked-off steps. If a step needs to change after being checked, append a **Correction** sub-section at the bottom of that task and explain.

---

## Status

> **Updated by the executor after each completed task. Single source of truth for "what's done."**

- **Last completed:** Task 7 — GET/PATCH/DELETE /api/users/[id]
- **Last completed commit:** Task 1 = 3e20def + 112eec7 + 14a925b; Task 2 = ea12980; Task 3 = f635770; Task 4 = 62420b3; Task 5 = 4e4dc76; Task 6 = f66f0b9; Task 7 = (this commit)
- **Next task to execute:** Task 8 — POST /api/users/[id]/resend-welcome
- **Plan version:** 1.0

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/email.ts` | Create | Transactional email wrapper. Typed senders for welcome/request-submitted/request-approved/request-rejected. Never throws. |
| `lib/email.test.ts` | Create | Unit tests for the dispatcher and each typed sender (using a mocked transport). |
| `lib/schemas.ts` | Modify | Add `createUserSchema`, `updateUserSchema`. |
| `lib/schemas.test.ts` | Modify | Cover new schemas (valid + invalid). |
| `lib/users.ts` | Create | Pure helpers: `generateTempPassword()`, `formatWelcomeEmailBody()`, `formatTier(...)`, `tierLabel(...)`. |
| `lib/users.test.ts` | Create | Unit tests for helpers. |
| `lib/types.ts` | Modify | Add `AppUser` interface (projection of `public.users`). |
| `lib/supabase/admin.ts` | Modify | Add `updateAuthUserRole(userId, role)` and `deleteAuthUser(userId)` (deletes from `auth.users`; cascades to `public.users`). |
| `app/api/users/route.ts` | Create | `GET` (list users, admin-only) and `POST` (create user + optional initial subscription, admin-only). |
| `app/api/users/[id]/route.ts` | Create | `GET` (single user + their subscriptions, admin-only), `PATCH` (update role/full_name, admin-only), `DELETE` (admin-only). |
| `app/api/users/[id]/resend-welcome/route.ts` | Create | `POST` — generate a new temp password, set `must_change_password=true`, email it. |
| `app/admin/users/page.tsx` | Create | Server-rendered users table. |
| `app/admin/users/new/page.tsx` | Create | Server page that renders the create-user form. |
| `app/admin/users/[id]/page.tsx` | Create | Server page that renders the edit-user form + this user's subscriptions list. |
| `components/admin/user-table.tsx` | Create | Client component: table with role badge, created_at, "must change password" indicator, per-row actions. |
| `components/admin/user-form.tsx` | Create | Client form for create/edit. Email + full_name + role + (create-only) optional initial subscription (product + tier). |
| `components/admin/user-subscriptions-panel.tsx` | Create | Read-only list of a user's subscriptions on the edit page. |
| `components/shared/role-badge.tsx` | Create | Small `<Badge>`-style pill: "Admin" or "User". |
| `components/site-nav.tsx` | Modify | Add a "Users" link between "Licenses" and "Settings". |
| `.env.example` | Modify | Document `EMAIL_FROM` and (optional) `EMAIL_REPLY_TO`. |
| `docs/superpowers/plans/2026-05-06-roles-admin-users.md` | Modify (each task) | Flip `- [ ]` → `- [x]` and update Status. |

We are **not** touching: the `/dashboard` tree (Plan 4), the request-license modal (Plan 4), the admin pending-requests panel (Plan 5), Playwright (Plan 5), or the cron-driven natural expiry (Plan 5). The admin-direct license create path keeps its synthetic-subscription behavior from Plan 2 — Plan 5 replaces it once the request flow lands.

---

## Conventions for this plan

- **Each step is its own commit** unless explicitly grouped.
- **Commit message format**: conventional commits as already used in this repo (`feat(...)`, `fix(...)`, `refactor(...)`, `chore(...)`, `docs(...)`).
- **Trailer**: every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (matches existing repo style).
- **Updating this plan**: when a step is done, edit it from `- [ ]` to `- [x]` and update the Status block, in the **same commit** as the code change.
- **TDD where applicable**: pure-logic modules (`lib/email.ts`, `lib/users.ts`, `lib/schemas.ts` additions) follow Red → Green → Refactor.
- **Manual verification**: pages, layouts, route handlers — verify per the Verification block at the end of each task.

---

## Task 1: Email module skeleton + tests

The email module is a thin wrapper over Supabase's auth-server SMTP. It does **not** send Supabase's built-in welcome / password-reset emails — those go through `auth.admin` calls automatically. `lib/email.ts` is for **application-triggered** transactional emails (request-submitted, request-approved, request-rejected) and a custom welcome that includes the temp password the admin minted (Supabase's built-in welcome doesn't include the temp password we generated).

**Transport:** Supabase doesn't expose a generic "send email" API for arbitrary content — only auth-flow emails. So `lib/email.ts` ships a **transport interface** that callers can satisfy in two ways:

- **`smtpTransport`** (used in production) — uses `nodemailer` against the same SMTP credentials Supabase uses, read from env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`). If those env vars are absent, the transport logs to stderr and returns `{ ok: true, skipped: true }` so dev environments don't crash.
- **`mockTransport`** (used in tests) — captures sends in an in-memory array; tests assert on it.

This avoids coupling `lib/email.ts` to a specific transport library and keeps dev-machine setup zero-friction (no SMTP needed locally).

> **Note:** The Plan 3 implementation only adds the transport interface and the `welcome` sender. The `request-submitted`, `request-approved`, and `request-rejected` senders are scaffolded as typed functions but are **not wired into any caller** in this plan — Plan 4 (user requests) and Plan 5 (admin approves/rejects) wire them up. The scaffolding lives here because the email module belongs to Plan 3 per the spec.

**Files:**
- Create: `lib/email.ts`
- Create: `lib/email.test.ts`
- Modify: `package.json` (add `nodemailer` + `@types/nodemailer`)
- Modify: `.env.example`

- [x] **Step 1.1: Add nodemailer dependency**

Run from repo root:

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Expected: `package.json` updated; `node_modules/nodemailer` exists.

- [x] **Step 1.2: Document new env vars in `.env.example`**

Append to `/Users/jsonse/Documents/development/copytraderx-license/.env.example`:

```
# Transactional email (application-triggered emails — request submitted/approved/rejected, custom welcome).
# All four SMTP_* vars must be set together to enable real sends; if any is missing the email module logs and skips.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="CopyTraderX <noreply@copytraderx.local>"
# Optional. If set, applied as the Reply-To header on all transactional emails.
EMAIL_REPLY_TO=
```

- [x] **Step 1.3: Write the failing test for `lib/email.ts`**

Create `/Users/jsonse/Documents/development/copytraderx-license/lib/email.test.ts`:

```typescript
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
```

- [x] **Step 1.4: Run the test — expect FAIL**

Run:

```bash
pnpm test lib/email.test.ts
```

Expected: FAIL with "Cannot find module './email'".

- [x] **Step 1.5: Implement `lib/email.ts`**

Create `/Users/jsonse/Documents/development/copytraderx-license/lib/email.ts`:

```typescript
import nodemailer from "nodemailer";

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
};

// ── Transports ────────────────────────────────────────────────────────────────

/** Real SMTP transport. Lazily instantiated so missing env vars don't crash imports. */
export const smtpTransport: EmailTransport = {
  async send(msg) {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;

    if (!host || !port || !user || !pass || !from) {
      // Missing config — log and skip so dev environments don't crash.
      console.warn(
        `[email] SMTP env vars missing; skipping send to ${msg.to} (subject: ${msg.subject})`,
      );
      return;
    }

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

export type RequestSubmittedEmailInput = {
  to: string;
  user_email: string;
  product_label: string;
  tier_label: string;
  notes: string | null;
};

export async function sendRequestSubmittedEmail(
  input: RequestSubmittedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const lines = [
    `New license request from ${input.user_email}.`,
    ``,
    `Product: ${input.product_label}`,
    `Tier: ${input.tier_label}`,
  ];
  if (input.notes) lines.push(``, `Notes:`, input.notes);
  return sendEmail(
    {
      to: input.to,
      subject: `New license request: ${input.product_label} (${input.tier_label})`,
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
};

export async function sendRequestApprovedEmail(
  input: RequestApprovedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const text = [
    `Your ${input.product_label} (${input.tier_label}) license has been approved.`,
    ``,
    `Valid until: ${input.expires_at}`,
    ``,
    `Sign in to claim your live and demo slots.`,
  ].join("\n");
  return sendEmail(
    {
      to: input.to,
      subject: `License approved: ${input.product_label}`,
      text,
    },
    transport,
  );
}

export type RequestRejectedEmailInput = {
  to: string;
  product_label: string;
  tier_label: string;
  rejection_reason: string;
};

export async function sendRequestRejectedEmail(
  input: RequestRejectedEmailInput,
  transport: EmailTransport = smtpTransport,
): Promise<SendResult> {
  const text = [
    `Your ${input.product_label} (${input.tier_label}) license request was not approved.`,
    ``,
    `Reason:`,
    input.rejection_reason,
  ].join("\n");
  return sendEmail(
    {
      to: input.to,
      subject: `License request not approved: ${input.product_label}`,
      text,
    },
    transport,
  );
}
```

- [x] **Step 1.6: Run the tests — expect PASS**

Run:

```bash
pnpm test lib/email.test.ts
```

Expected: PASS (3 tests).

- [x] **Step 1.7: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example lib/email.ts lib/email.test.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(email): add transactional email module with welcome sender

Adds lib/email.ts with a transport-agnostic dispatcher, a mock transport
for tests, an SMTP transport that no-ops when env vars are missing, and
typed senders for welcome / request-submitted / request-approved /
request-rejected. Plan 3 wires up only the welcome sender; the rest are
scaffolded for Plans 4 & 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:**
- `pnpm test lib/email.test.ts` passes.
- `grep -n "sendWelcomeEmail" lib/email.ts` shows the function is exported.

---

## Task 2: User helper module + tests

Pure helpers: temp-password generator, tier-label formatting (used by emails and the admin UI). Pulled out so the API route stays focused.

**Files:**
- Create: `lib/users.ts`
- Create: `lib/users.test.ts`

- [x] **Step 2.1: Write the failing test**

Create `/Users/jsonse/Documents/development/copytraderx-license/lib/users.test.ts`:

```typescript
import { generateTempPassword, tierLabel, productLabel } from "./users";

describe("generateTempPassword", () => {
  it("returns a 12-character string by default", () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(12);
  });

  it("returns the requested length", () => {
    expect(generateTempPassword(16)).toHaveLength(16);
  });

  it("uses only ascii printable, no ambiguous characters", () => {
    const pw = generateTempPassword(64);
    expect(pw).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9!@#$%^&*]+$/);
    // No 0/O/1/I/l/o.
    expect(pw).not.toMatch(/[0OIl1o]/);
  });

  it("produces different values on each call", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toBe(b);
  });
});

describe("tierLabel", () => {
  it("renders human-readable labels", () => {
    expect(tierLabel("monthly")).toBe("Monthly");
    expect(tierLabel("quarterly")).toBe("Quarterly");
    expect(tierLabel("yearly")).toBe("Yearly");
  });
});

describe("productLabel", () => {
  it("renders the product display name", () => {
    expect(productLabel("impulse")).toBe("Impulse");
    expect(productLabel("ctx-live")).toBe("CTX Live");
  });
});
```

- [x] **Step 2.2: Run the test — expect FAIL**

Run:

```bash
pnpm test lib/users.test.ts
```

Expected: FAIL with "Cannot find module './users'".

- [x] **Step 2.3: Implement `lib/users.ts`**

Create `/Users/jsonse/Documents/development/copytraderx-license/lib/users.ts`:

```typescript
import { randomInt } from "node:crypto";
import { PRODUCTS, type Product } from "./products";
import type { LicenseTier } from "./types";

// Safe alphabet: omit 0, O, 1, I, l, o for human-typable temp passwords.
const SAFE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ" +
  "abcdefghjkmnpqrstuvwxyz" +
  "23456789" +
  "!@#$%^&*";

/**
 * Cryptographically random temp password using a confusion-resistant alphabet.
 * Default length 12 — matches spec §6.1 ("generated 12-char temp password").
 */
export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)];
  }
  return out;
}

const TIER_LABELS: Record<LicenseTier, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function tierLabel(tier: LicenseTier): string {
  return TIER_LABELS[tier];
}

const PRODUCT_LABELS: Record<Product, string> = Object.fromEntries(
  PRODUCTS.map((p) => [p.code, p.displayName]),
) as Record<Product, string>;

export function productLabel(product: Product): string {
  return PRODUCT_LABELS[product];
}
```

- [x] **Step 2.4: Run the tests — expect PASS**

Run:

```bash
pnpm test lib/users.test.ts
```

Expected: PASS (6 tests).

- [x] **Step 2.5: Commit**

```bash
git add lib/users.ts lib/users.test.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(users): add temp-password generator and label helpers

Adds lib/users.ts with generateTempPassword(), tierLabel(), and
productLabel() — pure helpers used by the admin Users API and the
welcome email body.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `pnpm test lib/users.test.ts` passes.

---

## Task 3: Add `AppUser` type + extend Zod schemas

`AppUser` mirrors the `public.users` row. The schemas validate the create/edit forms.

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/schemas.ts`
- Modify: `lib/schemas.test.ts`

- [x] **Step 3.1: Add `AppUser` to `lib/types.ts`**

Append to `/Users/jsonse/Documents/development/copytraderx-license/lib/types.ts`:

```typescript
// ── App users ────────────────────────────────────────────────────────────────

export type AppUserRole = "admin" | "user";

export interface AppUser {
  id: string;                     // matches auth.users.id
  email: string;
  role: AppUserRole;
  full_name: string | null;
  must_change_password: boolean;
  created_at: string;
  created_by: string | null;
}
```

- [x] **Step 3.2: Write the failing test for the new schemas**

Append to `/Users/jsonse/Documents/development/copytraderx-license/lib/schemas.test.ts`:

```typescript
import { createUserSchema, updateUserSchema } from "./schemas";

describe("createUserSchema", () => {
  it("accepts a minimal valid input (email + role only)", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      role: "user",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an input with an initial subscription", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      full_name: "User Name",
      role: "user",
      initial_subscription: { product: "impulse", tier: "monthly" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bad email", () => {
    const result = createUserSchema.safeParse({
      email: "not-an-email",
      role: "user",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = createUserSchema.safeParse({
      email: "u@example.com",
      role: "superuser",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an initial_subscription with a bad product", () => {
    const result = createUserSchema.safeParse({
      email: "u@example.com",
      role: "user",
      initial_subscription: { product: "xyz", tier: "monthly" },
    });
    expect(result.success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("accepts a role-only update", () => {
    const result = updateUserSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(true);
  });

  it("accepts a full_name update", () => {
    const result = updateUserSchema.safeParse({ full_name: "Real Name" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [x] **Step 3.3: Run the test — expect FAIL**

Run:

```bash
pnpm test lib/schemas.test.ts
```

Expected: FAIL — `createUserSchema` and `updateUserSchema` not exported.

- [x] **Step 3.4: Add the schemas to `lib/schemas.ts`**

Append to `/Users/jsonse/Documents/development/copytraderx-license/lib/schemas.ts` (after the existing subscription schemas, before the `propfirmRuleSchema`):

```typescript
// ── App-user schemas (admin Users surface) ───────────────────────────────────

const roleEnum = z.enum(["admin", "user"]);

export const createUserSchema = z
  .object({
    email: z.string().email().max(254),
    full_name: optionalNonEmpty,
    role: roleEnum,
    /**
     * Optional. When present, the create endpoint also inserts a
     * subscriptions row with status='active' for this product+tier and
     * computes expires_at from the tier.
     */
    initial_subscription: z
      .object({
        product: productEnum,
        tier: tierEnum,
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    full_name: optionalNonEmpty,
    role: roleEnum.optional(),
  })
  .strict()
  .refine(
    (obj) => Object.keys(obj).length > 0,
    "Update body cannot be empty",
  );

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

- [x] **Step 3.5: Run the tests — expect PASS**

Run:

```bash
pnpm test lib/schemas.test.ts
```

Expected: all tests PASS (existing + 8 new).

- [x] **Step 3.6: Commit**

```bash
git add lib/types.ts lib/schemas.ts lib/schemas.test.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(schemas): add AppUser type, createUserSchema, updateUserSchema

Schemas validate the admin Users form. AppUser is the application-level
projection of public.users.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `pnpm test lib/schemas.test.ts` passes.

---

## Task 4: Extend `lib/supabase/admin.ts` with role-update + delete helpers

The Users API needs to mutate `auth.users` (role / app_metadata) and delete users. Wrap those calls so the routes stay readable.

**Files:**
- Modify: `lib/supabase/admin.ts`

- [x] **Step 4.1: Add `updateAuthUserRole` and `deleteAuthUser`**

Append to `/Users/jsonse/Documents/development/copytraderx-license/lib/supabase/admin.ts`:

```typescript
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
```

- [x] **Step 4.2: Verify the file compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [x] **Step 4.3: Commit**

```bash
git add lib/supabase/admin.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(supabase): add role-update, password-reset, and delete admin helpers

Wraps three auth.admin calls that the Users API will use:
updateAuthUserRole (role change), resetAuthUserPassword (resend welcome),
and deleteAuthUser (delete cascades to public.users via FK).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `pnpm tsc --noEmit` succeeds.

---

## Task 5: `GET /api/users` — list users (admin only)

Returns every row in `public.users`. Admin-only via `requireAdmin`.

**Files:**
- Create: `app/api/users/route.ts`

- [x] **Step 5.1: Implement the GET handler**

Create `/Users/jsonse/Documents/development/copytraderx-license/app/api/users/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

async function getRole() {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  return extractRole(session ? { user: session.user as never } : null);
}

export async function GET() {
  const role = await getRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ users: data });
}
```

> The POST handler is added in Task 6 in this same file.

- [x] **Step 5.2: Verify the route compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [x] **Step 5.3: Manual smoke test**

Sign in as admin. From the browser devtools console at any `/admin/*` page:

```javascript
fetch("/api/users").then((r) => r.json()).then(console.log);
```

Expected: `{ users: [...] }` with at least the seed admin and the legacy admin (`legacy@copytraderx.local`) — count ≥ 2.

Then sign out, attempt the same fetch with no session: expect HTTP 403 (or redirect, depending on middleware behavior; the API route itself returns 403).

- [x] **Step 5.4: Commit**

```bash
git add app/api/users/route.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(api): GET /api/users — list users for admin Users surface

Admin-only listing of public.users rows. Returns id, email, role,
full_name, must_change_password, created_at, created_by.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `POST /api/users` — create user + optional initial subscription

Creates an `auth.users` row (the trigger mirrors `public.users`), updates `public.users.created_by` to the calling admin, and — if `initial_subscription` was provided — inserts a `subscriptions` row with `status='active'` and computed `expires_at`. Sends the welcome email. Email failure is logged but does not roll back the DB writes (per spec §4.3).

**Files:**
- Modify: `app/api/users/route.ts`

- [x] **Step 6.1: Add the POST handler**

Append to `/Users/jsonse/Documents/development/copytraderx-license/app/api/users/route.ts`:

```typescript
import { createUserSchema } from "@/lib/schemas";
import { createAuthUser, findAuthUserByEmail } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email";
import { calculateExpiresAt } from "@/lib/expiry";

export async function POST(req: Request) {
  // Re-read role from the SSR session (defense in depth, per spec §4.2).
  const sbSSR = await getSupabaseSSR();
  const {
    data: { session },
  } = await sbSSR.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const adminId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Reject duplicate email up front for a clean error message.
  const existing = await findAuthUserByEmail(input.email);
  if (existing) {
    return NextResponse.json({ error: "email_in_use" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  let createdId: string;
  try {
    const created = await createAuthUser({
      email: input.email,
      password: tempPassword,
      role: input.role,
      full_name: input.full_name ?? undefined,
      email_confirm: true,
    });
    createdId = created.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "create_failed", details: msg },
      { status: 500 },
    );
  }

  const sb = getSupabaseAdmin();

  // Stamp created_by on the public.users row that the trigger inserted.
  // (The trigger doesn't know the calling admin.) full_name was set by
  // createAuthUser via raw_user_meta_data, but only when present, so we also
  // re-write it here to handle the null-vs-undefined edge case.
  {
    const { error } = await sb
      .from("users")
      .update({
        created_by: adminId,
        full_name: input.full_name ?? null,
      })
      .eq("id", createdId);
    if (error) {
      console.error("[users.POST] failed to stamp created_by:", error.message);
    }
  }

  // Optional initial subscription.
  let subscriptionId: number | null = null;
  if (input.initial_subscription) {
    const { product, tier } = input.initial_subscription;
    const now = new Date();
    const expires = calculateExpiresAt(tier, now);
    const { data: sub, error: subErr } = await sb
      .from("subscriptions")
      .insert({
        user_id: createdId,
        product,
        tier,
        status: "active",
        approved_at: now.toISOString(),
        approved_by: adminId,
        expires_at: expires.toISOString(),
        notes: "initial subscription provisioned at user creation",
      })
      .select("id")
      .single();

    if (subErr || !sub) {
      console.error(
        "[users.POST] initial subscription insert failed:",
        subErr?.message,
      );
      // We do not roll back the user — the admin can re-issue the subscription
      // from the user detail page (Plan 5 surface). Surface the partial
      // failure to the client so the UI can warn.
      return NextResponse.json(
        {
          user_id: createdId,
          warning: "subscription_create_failed",
          details: subErr?.message ?? "unknown",
        },
        { status: 207 },
      );
    }
    subscriptionId = sub.id;
  }

  // Send welcome email. Best-effort; log and continue on failure.
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
  const emailResult = await sendWelcomeEmail({
    to: input.email,
    full_name: input.full_name ?? null,
    temp_password: tempPassword,
    login_url: loginUrl,
  });
  if (!emailResult.ok) {
    console.error("[users.POST] welcome email failed:", emailResult.error);
  }

  return NextResponse.json(
    {
      user_id: createdId,
      subscription_id: subscriptionId,
      email_sent: emailResult.ok,
    },
    { status: 201 },
  );
}
```

- [x] **Step 6.2: Verify the route compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [x] **Step 6.3: Manual smoke test (without the UI yet)**

Sign in as admin. From devtools console:

```javascript
await fetch("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "smoketest@example.com",
    full_name: "Smoke Test",
    role: "user",
    initial_subscription: { product: "impulse", tier: "monthly" },
  }),
}).then((r) => r.json());
```

Expected: `{ user_id: "<uuid>", subscription_id: <number>, email_sent: <bool> }`. If SMTP isn't configured, `email_sent` is `true` (the mock-skip path). Verify in Supabase: a new row exists in `auth.users`, in `public.users`, and in `public.subscriptions` with `approved_by = <admin>`.

Cleanup:

```javascript
// Find and delete the smoke test user via the API once Task 9 lands;
// for now, delete it manually in the Supabase dashboard or via SQL.
```

- [x] **Step 6.4: Commit**

```bash
git add app/api/users/route.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(api): POST /api/users — create user with optional initial subscription

Generates a temp password, creates auth.users (the mirror trigger handles
public.users), stamps created_by, optionally inserts an active
subscription, and sends the welcome email. Email failure is logged but
does not roll back the DB writes (spec §4.3).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `GET / PATCH / DELETE /api/users/[id]`

Read-with-subscriptions, update role/full_name, delete (cascades).

**Files:**
- Create: `app/api/users/[id]/route.ts`

- [x] **Step 7.1: Implement the route**

Create `/Users/jsonse/Documents/development/copytraderx-license/app/api/users/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { updateUserSchema } from "@/lib/schemas";
import { updateAuthUserRole, deleteAuthUser } from "@/lib/supabase/admin";

async function requireAdminFromSession() {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (extractRole({ user: session.user as never }) !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { adminId: session.user.id };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromSession();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const sb = getSupabaseAdmin();

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: userErr.message },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  if (subsErr) {
    return NextResponse.json(
      { error: "subscriptions_lookup_failed", details: subsErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ user, subscriptions: subs });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromSession();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Don't let an admin demote themselves and lock the system.
  if (input.role && input.role !== "admin" && id === auth.adminId) {
    return NextResponse.json({ error: "cannot_self_demote" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Update public.users first.
  const updatePayload: Record<string, unknown> = {};
  if (input.full_name !== undefined) updatePayload.full_name = input.full_name;
  if (input.role !== undefined) updatePayload.role = input.role;

  const { data: updated, error: updErr } = await sb
    .from("users")
    .update(updatePayload)
    .eq("id", id)
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .maybeSingle();
  if (updErr) {
    return NextResponse.json(
      { error: "update_failed", details: updErr.message },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // If role changed, mirror to auth.users.app_metadata explicitly. The
  // on_users_role_change trigger already does this, but we also call the
  // admin API so the user's session is invalidated on next request.
  if (input.role) {
    try {
      await updateAuthUserRole(id, input.role);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[users.PATCH] role-mirror to auth.users failed:", msg);
      // Not fatal — the trigger already mirrored. Surface a warning header.
    }
  }

  return NextResponse.json({ user: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromSession();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  if (id === auth.adminId) {
    return NextResponse.json({ error: "cannot_self_delete" }, { status: 400 });
  }

  // Block deletion of the legacy synthetic admin — it owns the legacy
  // licenses and the admin-direct license-create path. Removing it breaks
  // the existing admin /admin/licenses/new flow until Plan 5 lands.
  const sb = getSupabaseAdmin();
  const { data: target, error: lookupErr } = await sb
    .from("users")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: lookupErr.message },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (target.email === "legacy@copytraderx.local") {
    return NextResponse.json({ error: "cannot_delete_legacy" }, { status: 400 });
  }

  try {
    await deleteAuthUser(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "delete_failed", details: msg },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [x] **Step 7.2: Verify the route compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [x] **Step 7.3: Manual smoke test**

Re-create a smoke-test user (Task 6 step 6.3) if you cleaned up. Then from devtools:

```javascript
const id = "<smoke-test-user-uuid>";
// Read with subscriptions
await fetch(`/api/users/${id}`).then((r) => r.json());
// PATCH role
await fetch(`/api/users/${id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "admin" }),
}).then((r) => r.json());
// DELETE
await fetch(`/api/users/${id}`, { method: "DELETE" }).then((r) => r.json());
```

Expected, in order: GET returns `{ user, subscriptions: [...] }`; PATCH returns `{ user }` with `role: "admin"`; DELETE returns `{ ok: true }`. After DELETE, GET on the same id returns 404, and the rows are gone from `auth.users`, `public.users`, and `public.subscriptions` (cascade).

Also verify guardrails:

```javascript
// Self-demote should be blocked.
const myId = "<seed-admin-uuid>";
await fetch(`/api/users/${myId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "user" }),
}).then((r) => r.json());
// → { error: "cannot_self_demote" }
```

- [x] **Step 7.4: Commit**

```bash
git add app/api/users/\[id\]/route.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(api): GET/PATCH/DELETE /api/users/[id]

Read includes the user's subscriptions. PATCH updates role and
full_name; rejects an admin demoting themselves. DELETE removes from
auth.users (cascades to public.users and downstream); rejects
self-deletion and deletion of the legacy synthetic admin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `POST /api/users/[id]/resend-welcome`

Generates a new temp password, sets `must_change_password=true`, sends the welcome email. Used when a welcome email gets lost.

**Files:**
- Create: `app/api/users/[id]/resend-welcome/route.ts`

- [ ] **Step 8.1: Implement the route**

Create `/Users/jsonse/Documents/development/copytraderx-license/app/api/users/[id]/resend-welcome/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { resetAuthUserPassword } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const sb = await getSupabaseSSR();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const sbAdmin = getSupabaseAdmin();
  const { data: user, error } = await sbAdmin
    .from("users")
    .select("id, email, full_name")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", details: error.message },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();
  try {
    await resetAuthUserPassword(id, tempPassword);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "reset_failed", details: msg },
      { status: 500 },
    );
  }

  // Mirror must_change_password=true on public.users.
  const { error: flagErr } = await sbAdmin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", id);
  if (flagErr) {
    console.error("[resend-welcome] failed to set must_change_password:", flagErr.message);
  }

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
  const emailResult = await sendWelcomeEmail({
    to: user.email,
    full_name: user.full_name,
    temp_password: tempPassword,
    login_url: loginUrl,
  });

  return NextResponse.json({
    ok: true,
    email_sent: emailResult.ok,
  });
}
```

- [ ] **Step 8.2: Verify the route compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8.3: Manual smoke test**

Create a fresh smoke-test user via `POST /api/users` (Task 6). Then:

```javascript
const id = "<smoke-test-user-uuid>";
await fetch(`/api/users/${id}/resend-welcome`, { method: "POST" }).then((r) =>
  r.json(),
);
```

Expected: `{ ok: true, email_sent: <bool> }`. In Supabase, the user's `must_change_password` is `true` and (if you can sign in as them in incognito) the new temp password works once. Clean up the smoke user.

- [ ] **Step 8.4: Commit**

```bash
git add app/api/users/\[id\]/resend-welcome/route.ts docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(api): POST /api/users/[id]/resend-welcome

Generates a fresh temp password, resets the auth.users password, sets
must_change_password=true, and re-sends the welcome email.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `RoleBadge` shared component

Tiny pill used in the users table and the user detail page.

**Files:**
- Create: `components/shared/role-badge.tsx`

- [ ] **Step 9.1: Create the component**

Create `/Users/jsonse/Documents/development/copytraderx-license/components/shared/role-badge.tsx`:

```typescript
import { cn } from "@/lib/utils";
import type { AppUserRole } from "@/lib/types";

interface Props {
  role: AppUserRole;
  className?: string;
}

export function RoleBadge({ role, className }: Props) {
  const isAdmin = role === "admin";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isAdmin
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        className,
      )}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}
```

- [ ] **Step 9.2: Verify the file compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9.3: Commit**

```bash
git add components/shared/role-badge.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(ui): add RoleBadge shared component

Pill used by the admin Users surface to render Admin/User role.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `UserTable` client component

Render the list. Per-row "Edit" link to `/admin/users/[id]`. Includes a "Pending password change" indicator for users with `must_change_password=true`.

**Files:**
- Create: `components/admin/user-table.tsx`

- [ ] **Step 10.1: Create the component**

Create `/Users/jsonse/Documents/development/copytraderx-license/components/admin/user-table.tsx`:

```typescript
"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { RoleBadge } from "@/components/shared/role-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppUser } from "@/lib/types";

interface Props {
  users: AppUser[];
}

export function UserTable({ users }: Props) {
  if (users.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No users yet. Click "New user" to invite the first one.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-mono text-xs">{u.email}</TableCell>
              <TableCell>{u.full_name ?? "—"}</TableCell>
              <TableCell>
                <RoleBadge role={u.role} />
              </TableCell>
              <TableCell>
                {u.must_change_password ? (
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Pending password change
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Active</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(parseISO(u.created_at), "yyyy-MM-dd")}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="text-xs text-foreground underline-offset-2 hover:underline"
                >
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```


- [ ] **Step 10.2: Verify**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10.3: Commit**

```bash
git add components/admin/user-table.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(ui): UserTable client component for /admin/users

Renders email, name, role badge, must-change-password indicator,
created_at, and a per-row Edit link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `/admin/users` list page

Server-rendered. Calls the service-role client directly (faster than the API round-trip; the API route exists for the future React Server Action / client refresh path).

**Files:**
- Create: `app/admin/users/page.tsx`

- [ ] **Step 11.1: Create the page**

Create `/Users/jsonse/Documents/development/copytraderx-license/app/admin/users/page.tsx`:

```typescript
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { UserTable } from "@/components/admin/user-table";
import type { AppUser } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchUsers(): Promise<AppUser[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch users:", error);
    return [];
  }
  return data as AppUser[];
}

export default async function UsersPage() {
  const users = await fetchUsers();
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {users.length} {users.length === 1 ? "user" : "users"} total
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/users/new">New user</Link>
          </Button>
        </div>
        <UserTable users={users} />
      </main>
    </div>
  );
}
```

- [ ] **Step 11.2: Verify the page renders**

Run `pnpm dev` and navigate to `/admin/users`. Expect to see the seed admin and the legacy admin in the list. Sign out and try again — expect a redirect to `/login` (handled by `app/admin/layout.tsx`).

- [ ] **Step 11.3: Commit**

```bash
git add app/admin/users/page.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(admin): /admin/users list page

Server-rendered users table with a "New user" link. Inherits admin-only
access from app/admin/layout.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `UserForm` client component (create)

Reusable form. In `mode="create"` it shows email, full_name, role, and an optional "Issue initial subscription" toggle that reveals product + tier pickers. In `mode="edit"` (Task 13 wires this up) it shows full_name + role; email is shown read-only.

**Files:**
- Create: `components/admin/user-form.tsx`

- [ ] **Step 12.1: Create the component**

Create `/Users/jsonse/Documents/development/copytraderx-license/components/admin/user-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PRODUCTS, type Product } from "@/lib/products";
import type { AppUser, AppUserRole } from "@/lib/types";

// Form schema is a superset of createUserSchema/updateUserSchema — we use a
// single shape and submit the appropriate subset based on mode.
const formSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  full_name: z.string().optional(),
  role: z.enum(["admin", "user"]),
  issue_initial: z.boolean().default(false),
  initial_product: z.enum(PRODUCTS.map((p) => p.code) as [Product, ...Product[]]).optional(),
  initial_tier: z.enum(["monthly", "quarterly", "yearly"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: "create" | "edit";
  initial?: AppUser;
}

export function UserForm({ mode, initial }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resending, setResending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initial?.email ?? "",
      full_name: initial?.full_name ?? "",
      role: initial?.role ?? "user",
      issue_initial: false,
      initial_product: "impulse",
      initial_tier: "monthly",
    },
  });

  const issueInitial = form.watch("issue_initial");

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      if (mode === "create") {
        const body = {
          email: values.email.trim(),
          full_name: values.full_name?.trim() || undefined,
          role: values.role,
          ...(values.issue_initial && values.initial_product && values.initial_tier
            ? { initial_subscription: { product: values.initial_product, tier: values.initial_tier } }
            : {}),
        };
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data?.error === "email_in_use") {
            toast.error("An account with that email already exists.");
            return;
          }
          toast.error(data?.error ?? "Failed to create user");
          return;
        }
        toast.success(
          data.email_sent
            ? "User created. Welcome email sent."
            : "User created. Welcome email failed — resend from the user page.",
        );
        router.push("/admin/users");
        router.refresh();
      } else {
        if (!initial) return;
        const body = {
          full_name: values.full_name?.trim() ? values.full_name.trim() : null,
          role: values.role,
        };
        const res = await fetch(`/api/users/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data?.error === "cannot_self_demote") {
            toast.error("You cannot demote yourself.");
            return;
          }
          toast.error(data?.error ?? "Failed to update user");
          return;
        }
        toast.success("User updated.");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResendWelcome() {
    if (!initial) return;
    setResending(true);
    try {
      const res = await fetch(`/api/users/${initial.id}/resend-welcome`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to resend welcome");
        return;
      }
      toast.success(
        data.email_sent
          ? "New temp password emailed."
          : "Temp password reset; email send failed.",
      );
    } finally {
      setResending(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${initial.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to delete user");
        return;
      }
      toast.success("User deleted.");
      router.push("/admin/users");
      router.refresh();
    } finally {
      setSubmitting(false);
      setShowDelete(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...form.register("email")}
          disabled={mode === "edit"}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">Name (optional)</Label>
        <Input id="full_name" {...form.register("full_name")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select
          value={form.watch("role")}
          onValueChange={(v) => form.setValue("role", v as AppUserRole)}
        >
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "create" && (
        <div className="space-y-3 rounded-md border p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("issue_initial")} />
            Issue an initial subscription on create
          </label>
          {issueInitial && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="initial_product">Product</Label>
                <Select
                  value={form.watch("initial_product") ?? "impulse"}
                  onValueChange={(v) => form.setValue("initial_product", v as Product)}
                >
                  <SelectTrigger id="initial_product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCTS.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial_tier">Tier</Label>
                <Select
                  value={form.watch("initial_tier") ?? "monthly"}
                  onValueChange={(v) =>
                    form.setValue("initial_tier", v as "monthly" | "quarterly" | "yearly")
                  }
                >
                  <SelectTrigger id="initial_tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create user" : "Save changes"}
        </Button>
        {mode === "edit" && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onResendWelcome}
              disabled={resending}
            >
              {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resend welcome email
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDelete(true)}
              disabled={submitting}
              className="ml-auto"
            >
              Delete user
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete user?"
        description="This permanently removes the user, their subscriptions, and their licenses. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </form>
  );
}
```

- [ ] **Step 12.2: Verify**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors. If `ConfirmDialog` props differ, adjust before this step passes.

- [ ] **Step 12.3: Commit**

```bash
git add components/admin/user-form.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(ui): UserForm component (create + edit modes)

Drives /admin/users/new and /admin/users/[id]. Supports optional initial
subscription on create, and role/full_name edits + resend-welcome +
delete on edit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `/admin/users/new` page

Hosts `<UserForm mode="create" />`.

**Files:**
- Create: `app/admin/users/new/page.tsx`

- [ ] **Step 13.1: Create the page**

Create `/Users/jsonse/Documents/development/copytraderx-license/app/admin/users/new/page.tsx`:

```typescript
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { UserForm } from "@/components/admin/user-form";

export default function NewUserPage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/admin/users"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to users
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">New user</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A welcome email with a temp password is sent on save.
          </p>
        </div>
        <UserForm mode="create" />
      </main>
    </div>
  );
}
```

- [ ] **Step 13.2: Manual smoke test**

Run `pnpm dev`. Navigate to `/admin/users/new`. Fill the form: email `manualtest@example.com`, name `Manual Test`, role `User`. Tick "Issue initial subscription", pick `Impulse` + `Monthly`. Submit. Expect a success toast and redirect to `/admin/users`. The new row should appear at the top of the list.

Verify in Supabase: `auth.users` has the row, `public.users.created_by` is set to the seed admin's id, `public.subscriptions` has an `active` row with `expires_at ≈ now + 30d`.

Clean up the test user from `/admin/users/<id>`.

- [ ] **Step 13.3: Commit**

```bash
git add app/admin/users/new/page.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(admin): /admin/users/new page

Hosts UserForm in create mode. Submits to POST /api/users.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `UserSubscriptionsPanel` component

Read-only list shown on the user detail page. Each row shows product/tier/status/expires_at. Reused: same shape will appear in Plan 4's user dashboard, but kept admin-side here.

**Files:**
- Create: `components/admin/user-subscriptions-panel.tsx`

- [ ] **Step 14.1: Create the component**

Create `/Users/jsonse/Documents/development/copytraderx-license/components/admin/user-subscriptions-panel.tsx`:

```typescript
import { format, parseISO } from "date-fns";
import { productLabel, tierLabel } from "@/lib/users";
import type { Subscription } from "@/lib/types";

interface Props {
  subscriptions: Subscription[];
}

const STATUS_STYLES: Record<Subscription["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function UserSubscriptionsPanel({ subscriptions }: Props) {
  if (subscriptions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
        No subscriptions yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {subscriptions.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between rounded-md border p-3 text-sm"
        >
          <div>
            <div className="font-medium">
              {productLabel(s.product)} — {tierLabel(s.tier)}
            </div>
            <div className="text-xs text-muted-foreground">
              {s.status === "active" && s.expires_at
                ? `Expires ${format(parseISO(s.expires_at), "yyyy-MM-dd")}`
                : `Requested ${format(parseISO(s.requested_at), "yyyy-MM-dd")}`}
              {s.notes ? ` · ${s.notes}` : ""}
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status]}`}
          >
            {s.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 14.2: Verify**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 14.3: Commit**

```bash
git add components/admin/user-subscriptions-panel.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(ui): UserSubscriptionsPanel for user detail page

Read-only list of a user's subscriptions with product/tier/status/expiry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: `/admin/users/[id]` edit page

Loads the user + their subscriptions server-side, renders `<UserForm mode="edit">` and the subscriptions panel.

**Files:**
- Create: `app/admin/users/[id]/page.tsx`

- [ ] **Step 15.1: Create the page**

Create `/Users/jsonse/Documents/development/copytraderx-license/app/admin/users/[id]/page.tsx`:

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SiteNav } from "@/components/site-nav";
import { UserForm } from "@/components/admin/user-form";
import { UserSubscriptionsPanel } from "@/components/admin/user-subscriptions-panel";
import type { AppUser, Subscription } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchUserAndSubs(id: string): Promise<{
  user: AppUser;
  subscriptions: Subscription[];
} | null> {
  const sb = getSupabaseAdmin();
  const { data: user } = await sb
    .from("users")
    .select("id, email, role, full_name, must_change_password, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!user) return null;
  const { data: subs } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  return { user: user as AppUser, subscriptions: (subs ?? []) as Subscription[] };
}

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchUserAndSubs(id);
  if (!result) notFound();
  const { user, subscriptions } = result;

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        <div>
          <Link
            href="/admin/users"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to users
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{user.email}</h1>
          {user.full_name && (
            <p className="mt-1 text-sm text-muted-foreground">{user.full_name}</p>
          )}
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Account</h2>
          <UserForm mode="edit" initial={user} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Subscriptions</h2>
          <UserSubscriptionsPanel subscriptions={subscriptions} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 15.2: Manual smoke test**

Navigate to `/admin/users` and click "Edit" on a row. Expect the email/name/role pre-populated; subscriptions panel below. Change the role from `User` to `Admin`, save → toast says "User updated." Refresh → role badge in the list flips to Admin. Switch back. Click "Resend welcome email" → toast confirms. Click "Delete user" on a throwaway user → confirms → list page no longer shows the row.

Verify the legacy admin guardrail: navigate to `/admin/users/<legacy-admin-id>` and click Delete → toast: "Cannot delete legacy admin." Navigate to your own seed-admin row → demote yourself → toast: "You cannot demote yourself."

- [ ] **Step 15.3: Commit**

```bash
git add app/admin/users/\[id\]/page.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(admin): /admin/users/[id] edit page

Loads user + subscriptions server-side. Renders UserForm in edit mode
plus the subscriptions panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Add "Users" link to `SiteNav`

**Files:**
- Modify: `components/site-nav.tsx`

- [ ] **Step 16.1: Add the nav link**

Edit `/Users/jsonse/Documents/development/copytraderx-license/components/site-nav.tsx` and insert a new `<Link>` between the "Licenses" and "Settings" links:

```tsx
<Link
  href="/admin/users"
  className={linkClass("/admin/users")}
  aria-current={pathname?.startsWith("/admin/users") ? "page" : undefined}
>
  Users
</Link>
```

- [ ] **Step 16.2: Verify**

Run `pnpm dev`. The nav now shows "Licenses · Users · Settings · Propfirm Rules" in that order. Clicking "Users" reaches `/admin/users`. The active style applies on `/admin/users`, `/admin/users/new`, and `/admin/users/[id]`.

- [ ] **Step 16.3: Commit**

```bash
git add components/site-nav.tsx docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
feat(nav): add Users link to admin SiteNav

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Plan completion — close out

- [ ] **Step 17.1: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: all tests pass (existing + new from this plan).

- [ ] **Step 17.2: Run the type-check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 17.3: Update the Status block**

Edit the **Status** block at the top of this file:

```markdown
## Status

- **Last completed:** Task 17 — Plan 3 complete ✅
- **Last completed commit:** _(filled by commit)_
- **Next task to execute:** Plan 4 (`docs/superpowers/plans/2026-05-06-roles-user-dashboard.md` — write when ready)
- **Plan version:** 1.0

## Plan complete

- Admin can list, create, edit, and delete users at `/admin/users`.
- Welcome email is sent on create; "Resend welcome email" on the edit page re-issues a temp password.
- Optional initial subscription is provisioned with `status='active'`, computed expiry, and `approved_by = <calling admin>`.
- `lib/email.ts` is the single transactional-email surface for the rest of the app — Plans 4 & 5 wire up the request-submitted / request-approved / request-rejected senders.
- Self-demote and self-delete are blocked. Deleting `legacy@copytraderx.local` is blocked (it owns legacy licenses + the admin-direct create path).
- Next plan: `2026-05-06-roles-user-dashboard.md` (Plan 4 — write when ready)
```

- [ ] **Step 17.4: Commit the closeout**

```bash
git add docs/superpowers/plans/2026-05-06-roles-admin-users.md
git commit -m "$(cat <<'EOF'
docs(plan): close out Plan 3 — admin users + email module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist (executor: skim before starting Task 1)

- [ ] **Spec coverage:** §4.3 (email) → Task 1. §5.1 (users table) is from Plan 1; §6.1 (admin creates user) → Tasks 5–6, 9–13. §6.5 (approve/reject) is **not** in this plan — confirmed Plan 5 scope.
- [ ] **Placeholders:** No "TBD/TODO/handle later" entries in any task body.
- [ ] **Type consistency:** `AppUser`, `AppUserRole`, `CreateUserInput`, `UpdateUserInput` are defined in Tasks 2–3 and used unchanged in Tasks 5–15.
- [ ] **Multi-product:** every `Product`-typed parameter uses the canonical codes from `lib/products.ts`. The form uses `PRODUCTS.map(...)` so it stays in sync.
- [ ] **Email failure isolation:** every transactional call uses `await sendXEmail(...)` and inspects `result.ok` rather than try/catch — never bubbles into the surrounding DB write.
- [ ] **Admin guardrails:** self-demote (PATCH), self-delete (DELETE), legacy-admin delete (DELETE) — all enforced before the DB write.
