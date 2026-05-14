# Plan 5 — Admin Requests, Admin-Direct Subscription Create, Cron Expiry, Revoke, Reattach, E2E

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the roles series by shipping admin pending-request management, admin-direct subscription creation (replacing the legacy license-create form), policy-field schema migration to subscriptions, admin revoke + cron-driven expiry, the legacy-license reattach UI, and a Playwright E2E suite.

**Architecture:** Adds new admin routes (`/admin/requests`, `/admin/subscriptions/new`) + new API endpoints under `/api/subscriptions/[id]/{approve,reject,revoke}` and `/api/licenses/[id]/reattach`. Migrates `push_interval_seconds` and `propfirm_rule_id` from `licenses` to `subscriptions` (Option A from spec §"Schema follow-ups"). Wires existing approve/reject email senders and adds two new senders (granted, revoked). Cron expiry runs as a Supabase pg_cron daily job. All admin-only via `requireAdmin()`; state transitions validated by pure-function guards in `lib/subscription-state.ts`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth + pg_cron), TypeScript, Zod, React Hook Form, Tailwind, shadcn/ui, Jest (unit), Playwright (E2E), nodemailer (SMTP).

**Spec:** `docs/superpowers/specs/2026-05-08-plan5-roles-requests-and-e2e-design.md`. Parent specs: `2026-05-06-admin-client-roles-design.md`, `2026-05-08-plan5-scope-note-admin-form-rework.md`.

---

## Task ordering

Tasks build on each other. The order below is the recommended execution order:

- Tasks 1–2: state-machine guards (foundation; every API route depends on these).
- Task 3: legacy-admin helper.
- Tasks 4–5: email senders (referenced by approve / reject / revoke / admin-create routes).
- Tasks 6–7: schemas (referenced by every new API route).
- Task 8: schema migration (Option A — `push_interval_seconds` & `propfirm_rule_id` move to `subscriptions`).
- Task 9: drop policy fields from license schemas / dashboard / `/api/licenses/[id]` PATCH.
- Tasks 10–12: approve / reject / revoke API routes.
- Task 13: `<RejectRequestDialog>` and `<RevokeDialog>` components.
- Task 14: `/admin/requests` page + nav link with count badge.
- Task 15: `<UserTypeahead>` component + search API.
- Task 16: admin-direct subscription create API.
- Task 17: admin subscription create form + page.
- Task 18: retire `/admin/licenses/new` (server-side redirect).
- Task 19: delete admin-direct POST handler in `app/api/licenses/route.ts`.
- Tasks 20–21: PATCH route + inline policy edit + Revoke button on `/admin/users/[id]`.
- Tasks 22–23: legacy license reattach (API + UI).
- Task 24: pg_cron expiry migration + manual trigger script.
- Tasks 25–26: Playwright install + helpers (seed, auth).
- Tasks 27–30: 6 E2E specs.
- Task 31: README update + final verification.

---

## File map

### Created
- `app/admin/requests/page.tsx`
- `app/admin/subscriptions/new/page.tsx`
- `app/api/subscriptions/admin-create/route.ts`
- `app/api/subscriptions/[id]/approve/route.ts`
- `app/api/subscriptions/[id]/reject/route.ts`
- `app/api/subscriptions/[id]/revoke/route.ts`
- `app/api/licenses/[id]/reattach/route.ts`
- `components/admin/pending-requests-table.tsx`
- `components/admin/reject-request-dialog.tsx`
- `components/admin/revoke-dialog.tsx`
- `components/admin/user-typeahead.tsx`
- `components/admin/admin-create-subscription-form.tsx`
- `components/admin/reattach-legacy-license-section.tsx`
- `components/admin/subscription-policy-form.tsx`
- `scripts/expire-subscriptions.ts`
- `e2e/admin-creates-user.spec.ts`
- `e2e/user-claims-slot.spec.ts`
- `e2e/user-requests-and-admin-approves.spec.ts`
- `e2e/user-cancels-request.spec.ts`
- `e2e/admin-revokes-subscription.spec.ts`
- `e2e/role-boundary.spec.ts`
- `e2e/helpers/auth.ts`
- `e2e/helpers/seed.ts`
- `playwright.config.ts`
- `.env.test.example`
- `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260508000001_move_policy_fields_to_subscriptions.sql`
- `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260508000002_install_expiry_cron.sql`

### Modified
- `lib/subscription-state.ts` — add `canApprove`, `canReject`, `canRevoke`.
- `lib/subscription-state.test.ts` — extend tests.
- `lib/email.ts` — add `sendSubscriptionGrantedEmail`, `sendSubscriptionRevokedEmail`.
- `lib/email.test.ts` — extend tests.
- `lib/schemas.ts` — add `adminCreateSubscriptionSchema`, `revokeSubscriptionSchema`, `updateSubscriptionPolicySchema`, `reattachLicenseSchema`.
- `lib/schemas.test.ts` — extend tests.
- `lib/users.ts` — add `LEGACY_ADMIN_EMAIL`, `isLegacyAdmin`.
- `lib/users.test.ts` — extend tests.
- `lib/dashboard-data.ts` — drop policy fields from licenses queries (post-migration).
- `app/admin/layout.tsx` — add nav with Requests link + count badge.
- `app/admin/licenses/new/page.tsx` — server-side `redirect('/admin/subscriptions/new')`.
- `app/admin/licenses/[id]/page.tsx` — render `<ReattachLegacyLicenseSection>` if legacy-owned.
- `app/admin/users/[id]/page.tsx` — render `<SubscriptionPolicyForm>` and Revoke button per card.
- `app/api/licenses/route.ts` — delete POST handler (admin-direct insert path).
- `app/api/licenses/[id]/route.ts` — drop `push_interval_seconds` / `propfirm_rule_id` columns from PATCH (post-migration).
- `app/api/subscriptions/[id]/route.ts` — add `PATCH` handler for policy fields.
- `components/admin/user-subscriptions-panel.tsx` — render the policy form + Revoke button.
- `package.json` — add `@playwright/test` dev dep, `pnpm e2e` script, `pnpm expire:subs` script.
- `README.md` — document E2E setup, cron migration, manual expiry trigger.

---

### Task 1: Add `canApprove` / `canReject` / `canRevoke` guards (failing tests)

**Files:**
- Test: `lib/subscription-state.test.ts`
- Modify: `lib/subscription-state.ts`

- [ ] **Step 1: Append tests for the three new guards**

Append to `lib/subscription-state.test.ts`:

```ts
import { canApprove, canReject, canRevoke } from "./subscription-state";

describe("canApprove", () => {
  it("allows pending", () => {
    expect(canApprove({ status: "pending" })).toEqual({ ok: true });
  });
  it("rejects active", () => {
    expect(canApprove({ status: "active" })).toEqual({ ok: false, reason: "not_pending" });
  });
  it("rejects rejected", () => {
    expect(canApprove({ status: "rejected" })).toEqual({ ok: false, reason: "not_pending" });
  });
  it("rejects expired", () => {
    expect(canApprove({ status: "expired" })).toEqual({ ok: false, reason: "not_pending" });
  });
  it("rejects revoked", () => {
    expect(canApprove({ status: "revoked" })).toEqual({ ok: false, reason: "not_pending" });
  });
});

describe("canReject", () => {
  it("allows pending", () => {
    expect(canReject({ status: "pending" })).toEqual({ ok: true });
  });
  it("rejects non-pending statuses", () => {
    for (const s of ["active", "rejected", "expired", "revoked"] as const) {
      expect(canReject({ status: s })).toEqual({ ok: false, reason: "not_pending" });
    }
  });
});

describe("canRevoke", () => {
  it("allows active", () => {
    expect(canRevoke({ status: "active" })).toEqual({ ok: true });
  });
  it("rejects non-active statuses", () => {
    for (const s of ["pending", "rejected", "expired", "revoked"] as const) {
      expect(canRevoke({ status: s })).toEqual({ ok: false, reason: "not_active" });
    }
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (functions not defined)**

```bash
pnpm test -- subscription-state.test.ts
```

Expected: FAIL with `canApprove is not a function` (or similar import error).

---

### Task 2: Implement the three new guards

**Files:**
- Modify: `lib/subscription-state.ts`

- [ ] **Step 1: Append guards to `lib/subscription-state.ts`**

```ts
export function canApprove(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "pending") return { ok: true };
  return { ok: false, reason: "not_pending" };
}

export function canReject(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "pending") return { ok: true };
  return { ok: false, reason: "not_pending" };
}

export function canRevoke(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "not_active" };
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
pnpm test -- subscription-state.test.ts
```

Expected: PASS, all `canApprove` / `canReject` / `canRevoke` cases green.

- [ ] **Step 3: Commit**

```bash
git add lib/subscription-state.ts lib/subscription-state.test.ts
git commit -m "feat(state): add canApprove/canReject/canRevoke guards"
```

---

### Task 3: Add `LEGACY_ADMIN_EMAIL` and `isLegacyAdmin` helper

**Files:**
- Modify: `lib/users.ts`
- Test: `lib/users.test.ts`

- [ ] **Step 1: Append failing test**

Append to `lib/users.test.ts`:

```ts
import { LEGACY_ADMIN_EMAIL, isLegacyAdmin } from "./users";

describe("isLegacyAdmin", () => {
  it("matches the legacy admin email", () => {
    expect(LEGACY_ADMIN_EMAIL).toBe("legacy@copytraderx.local");
    expect(isLegacyAdmin("legacy@copytraderx.local")).toBe(true);
  });
  it("rejects other emails", () => {
    expect(isLegacyAdmin("help.copytraderx@gmail.com")).toBe(false);
    expect(isLegacyAdmin("user@example.com")).toBe(false);
    expect(isLegacyAdmin(null)).toBe(false);
    expect(isLegacyAdmin(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm test -- users.test.ts
```

Expected: FAIL with import error for `LEGACY_ADMIN_EMAIL` / `isLegacyAdmin`.

- [ ] **Step 3: Add the constant and helper**

Append to `lib/users.ts`:

```ts
/**
 * Synthetic legacy-admin email created by the Plan 2 backfill migration.
 * Owns all licenses that pre-date the user-side flow until an admin reattaches
 * each one to a real user. We match by email rather than UUID because the UUID
 * is environment-specific (different across local / staging / prod).
 */
export const LEGACY_ADMIN_EMAIL = "legacy@copytraderx.local";

export function isLegacyAdmin(email: string | null | undefined): boolean {
  return email === LEGACY_ADMIN_EMAIL;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm test -- users.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/users.ts lib/users.test.ts
git commit -m "feat(users): add LEGACY_ADMIN_EMAIL and isLegacyAdmin helper"
```

---

### Task 4: Add `sendSubscriptionGrantedEmail` (failing test)

**Files:**
- Test: `lib/email.test.ts`

- [ ] **Step 1: Append failing test**

Append to `lib/email.test.ts`:

```ts
import { sendSubscriptionGrantedEmail, mockTransport } from "./email";

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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm test -- email.test.ts
```

Expected: FAIL with import error for `sendSubscriptionGrantedEmail`.

---

### Task 5: Implement `sendSubscriptionGrantedEmail` and `sendSubscriptionRevokedEmail`

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/email.test.ts`

- [ ] **Step 1: Implement granted sender**

Append to `lib/email.ts`:

```ts
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
```

- [ ] **Step 2: Append failing test for revoked sender**

```ts
import { sendSubscriptionRevokedEmail } from "./email";

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
```

- [ ] **Step 3: Implement revoked sender**

Append to `lib/email.ts`:

```ts
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test -- email.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/email.test.ts
git commit -m "feat(email): add subscription granted/revoked senders"
```

---

### Task 6: Add admin-create + revoke + policy + reattach schemas (failing tests)

**Files:**
- Test: `lib/schemas.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
import {
  adminCreateSubscriptionSchema,
  revokeSubscriptionSchema,
  updateSubscriptionPolicySchema,
  reattachLicenseSchema,
} from "./schemas";

describe("adminCreateSubscriptionSchema", () => {
  it("accepts a fully populated body", () => {
    const r = adminCreateSubscriptionSchema.safeParse({
      user_id: "11111111-1111-1111-1111-111111111111",
      product: "ctx-live",
      tier: "monthly",
      push_interval_seconds: 10,
      propfirm_rule_id: 5,
      notes: "VIP client",
      send_grant_email: true,
    });
    expect(r.success).toBe(true);
  });
  it("defaults push_interval_seconds=10 and send_grant_email=true", () => {
    const r = adminCreateSubscriptionSchema.safeParse({
      user_id: "11111111-1111-1111-1111-111111111111",
      product: "impulse",
      tier: "yearly",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.push_interval_seconds).toBe(10);
      expect(r.data.send_grant_email).toBe(true);
      expect(r.data.propfirm_rule_id).toBeNull();
      expect(r.data.notes).toBeNull();
    }
  });
  it("rejects bad uuid", () => {
    const r = adminCreateSubscriptionSchema.safeParse({
      user_id: "not-a-uuid",
      product: "impulse",
      tier: "monthly",
    });
    expect(r.success).toBe(false);
  });
  it("rejects unknown product", () => {
    const r = adminCreateSubscriptionSchema.safeParse({
      user_id: "11111111-1111-1111-1111-111111111111",
      product: "nope",
      tier: "monthly",
    });
    expect(r.success).toBe(false);
  });
});

describe("revokeSubscriptionSchema", () => {
  it("accepts an empty object", () => {
    expect(revokeSubscriptionSchema.safeParse({}).success).toBe(true);
  });
  it("rejects extra fields", () => {
    expect(revokeSubscriptionSchema.safeParse({ foo: 1 }).success).toBe(false);
  });
});

describe("updateSubscriptionPolicySchema", () => {
  it("accepts push_interval only", () => {
    expect(
      updateSubscriptionPolicySchema.safeParse({ push_interval_seconds: 30 }).success,
    ).toBe(true);
  });
  it("accepts propfirm_rule_id null", () => {
    expect(
      updateSubscriptionPolicySchema.safeParse({ propfirm_rule_id: null }).success,
    ).toBe(true);
  });
  it("rejects empty body", () => {
    expect(updateSubscriptionPolicySchema.safeParse({}).success).toBe(false);
  });
  it("rejects out-of-range push interval", () => {
    expect(
      updateSubscriptionPolicySchema.safeParse({ push_interval_seconds: 0 }).success,
    ).toBe(false);
    expect(
      updateSubscriptionPolicySchema.safeParse({ push_interval_seconds: 9999 }).success,
    ).toBe(false);
  });
});

describe("reattachLicenseSchema", () => {
  it("accepts a uuid", () => {
    expect(
      reattachLicenseSchema.safeParse({
        target_user_id: "22222222-2222-2222-2222-222222222222",
      }).success,
    ).toBe(true);
  });
  it("rejects bad uuid", () => {
    expect(
      reattachLicenseSchema.safeParse({ target_user_id: "abc" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test -- schemas.test.ts
```

Expected: FAIL — schemas not exported.

---

### Task 7: Implement the new schemas

**Files:**
- Modify: `lib/schemas.ts`

- [ ] **Step 1: Append schemas**

Append at the end of `lib/schemas.ts`:

```ts
// ── Plan 5 admin schemas ─────────────────────────────────────────────────────

export const adminCreateSubscriptionSchema = z
  .object({
    user_id: z.string().uuid(),
    product: productEnum,
    tier: tierEnum,
    push_interval_seconds: z.number().int().min(3).max(60).default(10),
    propfirm_rule_id: z.number().int().positive().nullable().default(null),
    notes: optionalNonEmpty,
    send_grant_email: z.boolean().default(true),
  })
  .strict();

export const revokeSubscriptionSchema = z.object({}).strict();

export const updateSubscriptionPolicySchema = z
  .object({
    push_interval_seconds: z.number().int().min(3).max(60).optional(),
    propfirm_rule_id: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine(
    (obj) => Object.keys(obj).length > 0,
    "Update body cannot be empty",
  );

export const reattachLicenseSchema = z
  .object({
    target_user_id: z.string().uuid(),
  })
  .strict();

export type AdminCreateSubscriptionInput = z.infer<typeof adminCreateSubscriptionSchema>;
export type RevokeSubscriptionInput = z.infer<typeof revokeSubscriptionSchema>;
export type UpdateSubscriptionPolicyInput = z.infer<typeof updateSubscriptionPolicySchema>;
export type ReattachLicenseInput = z.infer<typeof reattachLicenseSchema>;
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
pnpm test -- schemas.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/schemas.ts lib/schemas.test.ts
git commit -m "feat(schemas): add admin-create/revoke/policy/reattach schemas"
```

---

### Task 8: Schema migration — move policy fields to subscriptions

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260508000001_move_policy_fields_to_subscriptions.sql`

> **Coordination note:** This migration changes the columns the EA reads. Before applying it to any environment with a connected EA, ensure the EA-side query has been updated to read `push_interval_seconds` / `propfirm_rule_id` via a join to `subscriptions` rather than directly from `licenses`. The EA repo lives at `~/Documents/development/EA/JSONFX-IMPULSE/`. Coordinate this change in lockstep with the EA team. For local dev, just run the migration.

- [ ] **Step 1: Create the migration file**

```sql
-- 20260508000001_move_policy_fields_to_subscriptions.sql
--
-- Plan 5 (Option A): per-subscription policy fields move from licenses to
-- subscriptions. The EA-side query joins to subscriptions to read these.
--
-- Rollback (apply manually if reverting):
--   alter table public.licenses
--     add column push_interval_seconds integer not null default 10,
--     add column propfirm_rule_id      bigint references public.propfirm_rules(id);
--   update public.licenses l
--     set push_interval_seconds = s.push_interval_seconds,
--         propfirm_rule_id      = s.propfirm_rule_id
--     from public.subscriptions s
--    where l.subscription_id = s.id;
--   alter table public.subscriptions
--     drop column push_interval_seconds,
--     drop column propfirm_rule_id;

alter table public.subscriptions
  add column push_interval_seconds integer,
  add column propfirm_rule_id      bigint references public.propfirm_rules(id);

-- Backfill from licenses (deterministic min() per subscription).
update public.subscriptions s
   set push_interval_seconds = sub.push_interval_seconds,
       propfirm_rule_id      = sub.propfirm_rule_id
  from (
    select subscription_id,
           min(push_interval_seconds) as push_interval_seconds,
           min(propfirm_rule_id)      as propfirm_rule_id
      from public.licenses
     where subscription_id is not null
     group by subscription_id
  ) sub
 where s.id = sub.subscription_id;

-- Apply default for any subscription that has no children yet.
update public.subscriptions
   set push_interval_seconds = 10
 where push_interval_seconds is null;

alter table public.subscriptions
  alter column push_interval_seconds set not null,
  alter column push_interval_seconds set default 10;

-- Drop columns from licenses.
alter table public.licenses
  drop column push_interval_seconds,
  drop column propfirm_rule_id;
```

- [ ] **Step 2: Apply the migration locally**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: migration applied without error. Verify with:

```bash
supabase db reset --linked-no  # only if you want a clean slate; otherwise skip
psql "$LOCAL_DB_URL" -c "\d public.subscriptions" | grep -E "push_interval|propfirm_rule_id"
```

You should see the columns on `subscriptions` and **not** on `licenses`.

- [ ] **Step 3: Update local app `.env` if needed and restart `pnpm dev`**

No env change required; just restart so any cached schema is refreshed.

- [ ] **Step 4: Commit (EA repo)**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260508000001_move_policy_fields_to_subscriptions.sql
git commit -m "feat(db): move push_interval_seconds & propfirm_rule_id to subscriptions"
```

---

### Task 9: Update app code that referenced policy fields on `licenses`

**Files:**
- Modify: `lib/schemas.ts` (`createLicenseSchema`, `updateLicenseSchema`)
- Modify: `lib/dashboard-data.ts` (drop selects of these columns from `licenses`)
- Modify: `app/api/licenses/[id]/route.ts` (remove these fields from PATCH; admin still has /api/subscriptions/[id] for the new home)

- [ ] **Step 1: Drop policy fields from `createLicenseSchema` / `updateLicenseSchema`**

In `lib/schemas.ts`, find `createLicenseSchema` and remove the two fields:

```ts
// BEFORE:
//   push_interval_seconds: z.number().int().min(3).max(60).default(10),
//   propfirm_rule_id: z.number().int().positive().nullable().default(null),

// AFTER: just delete those two lines from the schema.
```

Same for `updateLicenseSchema`. Both schemas keep all other fields untouched.

- [ ] **Step 2: Update tests**

In `lib/schemas.test.ts`, remove any assertions on `push_interval_seconds` / `propfirm_rule_id` for the license schemas. Add a negative case to confirm they're now rejected:

```ts
it("createLicenseSchema rejects push_interval_seconds (moved to subscriptions)", () => {
  const r = createLicenseSchema.safeParse({
    license_key: "IMPX-AAAA-AAAA-AAAA-AAAA",
    mt5_account: 1,
    product: "impulse",
    tier: "monthly",
    intended_account_type: "live",
    push_interval_seconds: 10,
  });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 3: Update `lib/dashboard-data.ts` if it selects these columns**

Open `lib/dashboard-data.ts` and grep for `push_interval_seconds` or `propfirm_rule_id`. If present in any `from("licenses").select(...)`, remove. The dashboard already pulls from `subscriptions` via a separate query, so no replacement needed for the user-side dashboard. Run:

```bash
grep -n "push_interval_seconds\|propfirm_rule_id" lib/dashboard-data.ts
```

If output is empty, no edit needed. If not, remove those tokens from the explicit select lists.

- [ ] **Step 4: Update `app/api/licenses/[id]/route.ts` PATCH handler**

If the PATCH handler currently writes `push_interval_seconds` / `propfirm_rule_id` directly to `licenses`, remove those lines. Direct license edits no longer carry these fields — admins set them at the subscription level via the new `PATCH /api/subscriptions/[id]` (Task 21).

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: all tests pass. Type-check:

```bash
pnpm exec tsc --noEmit
```

Expected: no errors. (If errors surface in `app/api/licenses/route.ts` referring to the dropped columns, those are addressed when that handler is deleted in Task 19.)

- [ ] **Step 6: Commit**

```bash
git add lib/schemas.ts lib/schemas.test.ts lib/dashboard-data.ts app/api/licenses/[id]/route.ts
git commit -m "refactor(licenses): drop policy fields from license schemas/handlers"
```

---

### Task 10: Approve API route + wire `sendRequestApprovedEmail`

**Files:**
- Create: `app/api/subscriptions/[id]/approve/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canApprove } from "@/lib/subscription-state";
import { calculateExpiresAt } from "@/lib/expiry";
import { sendRequestApprovedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: "lookup_failed", details: fetchErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guard = canApprove({ status: sub.status });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const now = new Date();
  const expires = calculateExpiresAt(sub.tier, now);

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({
      status: "active",
      approved_at: now.toISOString(),
      approved_by: session.user.id,
      expires_at: expires.toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) return NextResponse.json({ error: "update_failed", details: updErr.message }, { status: 500 });

  // Look up the user email for the notification.
  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", sub.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendRequestApprovedEmail({
      to: targetUser.email,
      product_label: productDisplayName(sub.product),
      tier_label: tierLabel(sub.tier),
      expires_at: expires.toISOString().slice(0, 10),
    });
  }

  return NextResponse.json({ subscription: updated });
}
```

- [ ] **Step 2: Restart `pnpm dev`, manually verify**

In Supabase Studio, find a `subscriptions` row with `status='pending'`. Note its id. Then:

```bash
# Sign in as admin in the browser, then in the same browser session DevTools:
fetch('/api/subscriptions/<id>/approve', { method: 'POST' }).then(r => r.json()).then(console.log)
```

Expected output: `{ subscription: { ..., status: "active", approved_at: ..., expires_at: ... } }`. Verify in Supabase Studio that status flipped and timestamps populated.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/\[id\]/approve/route.ts
git commit -m "feat(api): admin approve subscription + email notify"
```

---

### Task 11: Reject API route + wire `sendRequestRejectedEmail`

**Files:**
- Create: `app/api/subscriptions/[id]/reject/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canReject } from "@/lib/subscription-state";
import { rejectSubscriptionSchema } from "@/lib/schemas";
import { sendRequestRejectedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = rejectSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: "lookup_failed", details: fetchErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guard = canReject({ status: sub.status });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.rejection_reason,
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) return NextResponse.json({ error: "update_failed", details: updErr.message }, { status: 500 });

  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", sub.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendRequestRejectedEmail({
      to: targetUser.email,
      product_label: productDisplayName(sub.product),
      tier_label: tierLabel(sub.tier),
      rejection_reason: parsed.data.rejection_reason,
    });
  }

  return NextResponse.json({ subscription: updated });
}
```

> **Note:** `rejectSubscriptionSchema` already exists in `lib/schemas.ts` from Plan 4. It expects `{ action: "reject", rejection_reason }`. Adjust the call to include `action: "reject"` if the existing schema requires it. Check `lib/schemas.ts` first; if it does, the Reject UI in Task 14 must include `action: "reject"` in the body.

Adjustment if the existing schema requires `action`:

```ts
const parsed = rejectSubscriptionSchema.safeParse(body);
// If the schema demands action: "reject", clients must send it.
```

- [ ] **Step 2: Manual verify**

```bash
fetch('/api/subscriptions/<id>/reject', {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({ action: 'reject', rejection_reason: 'Not eligible for VIP tier yet' })
}).then(r => r.json()).then(console.log)
```

Expected: `{ subscription: { status: "rejected", rejection_reason: "Not eligible..." } }`.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/\[id\]/reject/route.ts
git commit -m "feat(api): admin reject subscription + email notify"
```

---

### Task 12: Revoke API route

**Files:**
- Create: `app/api/subscriptions/[id]/revoke/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canRevoke } from "@/lib/subscription-state";
import { sendSubscriptionRevokedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data: sub, error: fetchErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: "lookup_failed", details: fetchErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guard = canRevoke({ status: sub.status });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  const { data: updated, error: updErr } = await sb
    .from("subscriptions")
    .update({ status: "revoked" })
    .eq("id", id)
    .select()
    .single();
  if (updErr) return NextResponse.json({ error: "update_failed", details: updErr.message }, { status: 500 });

  // Cascade trigger from Plan 1 §5.5 flips child licenses to revoked automatically.

  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", sub.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendSubscriptionRevokedEmail({
      to: targetUser.email,
      product_label: productDisplayName(sub.product),
      tier_label: tierLabel(sub.tier),
    });
  }

  return NextResponse.json({ subscription: updated });
}
```

- [ ] **Step 2: Manual verify**

Pick an `active` subscription. Call:

```bash
fetch('/api/subscriptions/<id>/revoke', { method: 'POST' }).then(r => r.json()).then(console.log)
```

Expected: status flips to `revoked`. Check that child licenses also flipped via the cascade trigger.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/\[id\]/revoke/route.ts
git commit -m "feat(api): admin revoke subscription + email notify"
```

---

### Task 13: `<RejectRequestDialog>` and `<RevokeDialog>` components

**Files:**
- Create: `components/admin/reject-request-dialog.tsx`
- Create: `components/admin/revoke-dialog.tsx`

- [ ] **Step 1: Create `reject-request-dialog.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function RejectRequestDialog({ subscriptionId }: { subscriptionId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit() {
    if (reason.trim().length === 0) {
      toast.error("Please provide a rejection reason");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reject", rejection_reason: reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Reject failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Request rejected");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Reject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject request</DialogTitle>
          <DialogDescription>
            The user will receive an email with the reason below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Rejection reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Tier not eligible for current account level"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Rejecting…" : "Reject request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `revoke-dialog.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function RevokeDialog({
  subscriptionId,
  productLabel,
  tierLabel,
}: {
  subscriptionId: number;
  productLabel: string;
  tierLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/revoke`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Revoke failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Subscription revoked");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">Revoke</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this subscription?</DialogTitle>
          <DialogDescription>
            Revoking the {productLabel} ({tierLabel}) subscription deactivates all of its
            licenses immediately. The user will be notified by email.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Revoking…" : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors. (If `@/components/ui/textarea` is missing, install via `pnpm dlx shadcn@latest add textarea`.)

- [ ] **Step 4: Commit**

```bash
git add components/admin/reject-request-dialog.tsx components/admin/revoke-dialog.tsx
git commit -m "feat(admin): add reject and revoke dialogs"
```

---

### Task 14: `/admin/requests` page + nav link

**Files:**
- Create: `app/admin/requests/page.tsx`
- Create: `components/admin/pending-requests-table.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Create the pending-requests table component**

```tsx
// components/admin/pending-requests-table.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RejectRequestDialog } from "./reject-request-dialog";
import { toast } from "sonner";

export type PendingRequestRow = {
  id: number;
  user_email: string;
  user_full_name: string | null;
  product_label: string;
  tier_label: string;
  notes: string | null;
  requested_at: string;
};

export function PendingRequestsTable({ rows }: { rows: PendingRequestRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function approve(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Approve failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Request approved");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending requests.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <div>{r.user_full_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{r.user_email}</div>
            </TableCell>
            <TableCell>{r.product_label}</TableCell>
            <TableCell>{r.tier_label}</TableCell>
            <TableCell>{new Date(r.requested_at).toLocaleString()}</TableCell>
            <TableCell className="max-w-[24ch] truncate">{r.notes ?? "—"}</TableCell>
            <TableCell className="text-right space-x-2">
              <Button size="sm" onClick={() => approve(r.id)} disabled={isPending}>Approve</Button>
              <RejectRequestDialog subscriptionId={r.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create the page**

```tsx
// app/admin/requests/page.tsx
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";
import { PendingRequestsTable, type PendingRequestRow } from "@/components/admin/pending-requests-table";

export default async function AdminRequestsPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("subscriptions")
    .select("id, product, tier, notes, requested_at, user_id, users!inner(email, full_name)")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  if (error) {
    return <div className="p-6 text-red-600">Failed to load requests: {error.message}</div>;
  }

  const rows: PendingRequestRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    user_email: r.users.email,
    user_full_name: r.users.full_name,
    product_label: productDisplayName(r.product),
    tier_label: tierLabel(r.tier),
    notes: r.notes,
    requested_at: r.requested_at,
  }));

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Pending requests</h1>
      <PendingRequestsTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 3: Add nav link with count badge to `app/admin/layout.tsx`**

Replace the body of the layout with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, getSupabaseSSR } from "@/lib/supabase/server";
import { extractRole } from "@/lib/role";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  const role = extractRole(session ? { user: session.user as never } : null);
  if (!session) redirect("/login");
  if (role !== "admin") redirect("/dashboard");

  // Pending count for the badge.
  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const pending = count ?? 0;

  return (
    <div>
      <nav className="border-b px-6 py-3 flex gap-4 items-center">
        <Link href="/admin/licenses" className="text-sm">Licenses</Link>
        <Link href="/admin/users" className="text-sm">Users</Link>
        <Link href="/admin/requests" className="text-sm flex items-center gap-1">
          Requests
          {pending > 0 && (
            <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs px-2 py-0.5">
              {pending}
            </span>
          )}
        </Link>
        <Link href="/admin/propfirm-rules" className="text-sm">Propfirm rules</Link>
        <Link href="/admin/settings" className="text-sm">Settings</Link>
      </nav>
      {children}
    </div>
  );
}
```

> **Check:** if `app/admin/layout.tsx` already imports nav from a child layout or already has its own nav, integrate the Requests link rather than duplicating navigation. Read the existing file first to confirm shape.

- [ ] **Step 4: Smoke-test in the browser**

Sign in as admin, navigate to `/admin/requests`. Submit a request as a test user (in another browser), refresh the admin page, confirm:
- The request appears in the table.
- Nav badge shows `1`.
- Click Approve — toast says "Request approved", row disappears, badge updates after refresh.
- Submit another, click Reject, fill in reason, confirm — row disappears, user receives email.

- [ ] **Step 5: Commit**

```bash
git add app/admin/requests/page.tsx components/admin/pending-requests-table.tsx app/admin/layout.tsx
git commit -m "feat(admin): pending requests page + nav badge"
```

---

### Task 15: `<UserTypeahead>` component

**Files:**
- Create: `components/admin/user-typeahead.tsx`
- Create: `app/api/users/search/route.ts`

- [ ] **Step 1: Create the search API**

```ts
// app/api/users/search/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export async function GET(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length === 0) return NextResponse.json({ users: [] });

  const sb = getSupabaseAdmin();
  // ilike on email OR full_name. PostgREST `or` filter syntax.
  const { data, error } = await sb
    .from("users")
    .select("id, email, full_name")
    .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
    .order("email")
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}
```

- [ ] **Step 2: Create the typeahead component**

```tsx
// components/admin/user-typeahead.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

export type UserOption = { id: string; email: string; full_name: string | null };

export function UserTypeahead({
  value,
  onChange,
  placeholder = "Search by email or name…",
}: {
  value: UserOption | null;
  onChange: (u: UserOption | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.email ?? "");
  const [results, setResults] = useState<UserOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || (value && query === value.email)) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const body = await res.json();
      setResults(body.users ?? []);
      setOpen(true);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  function pick(u: UserOption) {
    onChange(u);
    setQuery(u.email);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow">
          {results.map((u) => (
            <li
              key={u.id}
              className="cursor-pointer px-3 py-2 hover:bg-accent"
              onMouseDown={() => pick(u)}
            >
              <div className="text-sm">{u.full_name ?? u.email}</div>
              {u.full_name && <div className="text-xs text-muted-foreground">{u.email}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test**

```bash
# In an admin browser session DevTools:
fetch('/api/users/search?q=help').then(r => r.json()).then(console.log)
```

Expected: `{ users: [{ id, email: "help.copytraderx@gmail.com", full_name: ... }] }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/users/search/route.ts components/admin/user-typeahead.tsx
git commit -m "feat(admin): user typeahead component + search API"
```

---

### Task 16: Admin-direct subscription create API

**Files:**
- Create: `app/api/subscriptions/admin-create/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { adminCreateSubscriptionSchema } from "@/lib/schemas";
import { calculateExpiresAt } from "@/lib/expiry";
import { sendSubscriptionGrantedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";
import { tierLabel } from "@/lib/users";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = adminCreateSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const sb = getSupabaseAdmin();

  // Confirm target user exists.
  const { data: target, error: tErr } = await sb
    .from("users")
    .select("id, email")
    .eq("id", input.user_id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: "lookup_failed", details: tErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const now = new Date();
  const expires = calculateExpiresAt(input.tier, now);

  const { data: created, error: insErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: input.user_id,
      product: input.product,
      tier: input.tier,
      status: "active",
      requested_at: now.toISOString(),
      approved_at: now.toISOString(),
      approved_by: session.user.id,
      expires_at: expires.toISOString(),
      push_interval_seconds: input.push_interval_seconds,
      propfirm_rule_id: input.propfirm_rule_id,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: "insert_failed", details: insErr.message }, { status: 500 });

  if (input.send_grant_email && target.email) {
    void sendSubscriptionGrantedEmail({
      to: target.email,
      product_label: productDisplayName(input.product),
      tier_label: tierLabel(input.tier),
      expires_at: expires.toISOString().slice(0, 10),
      login_url: process.env.PUBLIC_APP_URL
        ? `${process.env.PUBLIC_APP_URL}/login`
        : "/login",
    });
  }

  return NextResponse.json({ subscription: created }, { status: 201 });
}
```

- [ ] **Step 2: Manual verify**

```bash
# As admin in DevTools:
fetch('/api/subscriptions/admin-create', {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({
    user_id: '<some-real-user-uuid>',
    product: 'impulse',
    tier: 'monthly',
    push_interval_seconds: 10,
    propfirm_rule_id: null,
    notes: 'Test grant',
    send_grant_email: false,
  }),
}).then(r => r.json()).then(console.log)
```

Expected: `{ subscription: { ..., status: 'active', approved_at: ..., expires_at: ... } }`.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/admin-create/route.ts
git commit -m "feat(api): admin-direct subscription create"
```

---

### Task 17: Admin subscription create form + page

**Files:**
- Create: `components/admin/admin-create-subscription-form.tsx`
- Create: `app/admin/subscriptions/new/page.tsx`

- [ ] **Step 1: Create the form component**

```tsx
// components/admin/admin-create-subscription-form.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserTypeahead, type UserOption } from "./user-typeahead";
import { toast } from "sonner";

export type PropfirmRuleOption = { id: number; name: string };
const PRODUCTS = [
  { code: "impulse", label: "Impulse" },
  { code: "ctx-core", label: "CTX Core" },
  { code: "ctx-live", label: "CTX Live" },
  { code: "ctx-prop-passer", label: "CTX Prop Passer" },
  { code: "ctx-prop-funded", label: "CTX Prop Funded" },
] as const;
const TIERS = [
  { code: "monthly", label: "Monthly" },
  { code: "quarterly", label: "Quarterly" },
  { code: "yearly", label: "Yearly" },
] as const;

export function AdminCreateSubscriptionForm({ rules }: { rules: PropfirmRuleOption[] }) {
  const router = useRouter();
  const [user, setUser] = useState<UserOption | null>(null);
  const [product, setProduct] = useState<string>("impulse");
  const [tier, setTier] = useState<string>("monthly");
  const [pushInterval, setPushInterval] = useState<number>(10);
  const [ruleId, setRuleId] = useState<string>("none");
  const [notes, setNotes] = useState<string>("");
  const [sendEmail, setSendEmail] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Please pick a user");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/subscriptions/admin-create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          product,
          tier,
          push_interval_seconds: pushInterval,
          propfirm_rule_id: ruleId === "none" ? null : Number(ruleId),
          notes: notes.trim() === "" ? null : notes,
          send_grant_email: sendEmail,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Create failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Subscription created");
      router.push(`/admin/users/${user.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label>User</Label>
        <UserTypeahead value={user} onChange={setUser} />
        <p className="text-xs text-muted-foreground">
          <a href="/admin/users/new" target="_blank" rel="noreferrer" className="underline">
            Create new user in another tab
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <Label>Product</Label>
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRODUCTS.map((p) => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tier</Label>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIERS.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="push-interval">Push interval (seconds)</Label>
        <Input
          id="push-interval"
          type="number"
          min={3}
          max={60}
          value={pushInterval}
          onChange={(e) => setPushInterval(Number(e.target.value))}
        />
      </div>

      <div className="space-y-2">
        <Label>Propfirm rule</Label>
        <Select value={ruleId} onValueChange={setRuleId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(none)</SelectItem>
            {rules.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
        Send "subscription granted" email to user
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create subscription"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the page**

```tsx
// app/admin/subscriptions/new/page.tsx
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminCreateSubscriptionForm } from "@/components/admin/admin-create-subscription-form";

export default async function AdminCreateSubscriptionPage() {
  const sb = getSupabaseAdmin();
  const { data: rules, error } = await sb
    .from("propfirm_rules")
    .select("id, name")
    .order("name");
  if (error) {
    return <div className="p-6 text-red-600">Failed to load rules: {error.message}</div>;
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Create subscription</h1>
      <p className="text-sm text-muted-foreground">
        Provisions an active subscription for a user. The user can claim live + demo slots
        themselves once they sign in.
      </p>
      <AdminCreateSubscriptionForm rules={rules ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test**

In the browser at `/admin/subscriptions/new`:
- Type into the user search; verify dropdown populates.
- Pick a user, fill the form, submit with `send_grant_email` unchecked.
- Verify redirect to `/admin/users/[id]` and the new subscription appears in their card list.

- [ ] **Step 4: Commit**

```bash
git add components/admin/admin-create-subscription-form.tsx app/admin/subscriptions/new/page.tsx
git commit -m "feat(admin): admin-direct subscription create form + page"
```

---

### Task 18: Retire `/admin/licenses/new` (server-side redirect)

**Files:**
- Modify: `app/admin/licenses/new/page.tsx`

- [ ] **Step 1: Replace the page with a redirect**

```tsx
// app/admin/licenses/new/page.tsx
import { redirect } from "next/navigation";

export default function LegacyAdminLicensesNewPage(): never {
  redirect("/admin/subscriptions/new");
}
```

- [ ] **Step 2: Update any inbound link that pointed at `/admin/licenses/new`**

```bash
grep -rn "/admin/licenses/new" app/ components/ | grep -v "page.tsx" | grep -v "\.test\."
```

For each match, change the `href` to `/admin/subscriptions/new`. Common location: any "New license" button on `/admin/licenses` or in the admin nav.

- [ ] **Step 3: Smoke-test**

Visit `/admin/licenses/new` directly; verify it 307s to `/admin/subscriptions/new`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/licenses/new/page.tsx app/admin/licenses/page.tsx components/
git commit -m "refactor(admin): redirect /admin/licenses/new to /admin/subscriptions/new"
```

---

### Task 19: Delete admin-direct POST handler in `app/api/licenses/route.ts`

**Files:**
- Modify: `app/api/licenses/route.ts`

- [ ] **Step 1: Identify the POST handler and delete it**

Open `app/api/licenses/route.ts`. Locate `export async function POST(...)` and delete the entire function. Keep any `GET` handler. Remove now-unused imports (e.g. `legacy@copytraderx.local` lookup, `createLicenseSchema`, anything only the POST used).

- [ ] **Step 2: If the file is now empty, delete it**

```bash
# Inspect remaining content:
cat app/api/licenses/route.ts
```

If only imports remain, delete the file:

```bash
rm app/api/licenses/route.ts
```

If a `GET` handler remains, keep the file with just `GET`.

- [ ] **Step 3: Type-check + run all tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/licenses/route.ts
git commit -m "refactor(api): remove admin-direct license POST (replaced by subscription create)"
```

---

### Task 20: PATCH route for subscription policy fields

**Files:**
- Modify: `app/api/subscriptions/[id]/route.ts`

- [ ] **Step 1: Add a PATCH handler**

Append to `app/api/subscriptions/[id]/route.ts`:

```ts
import { extractRole } from "@/lib/role";
import { updateSubscriptionPolicySchema } from "@/lib/schemas";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = updateSubscriptionPolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: updated, error } = await sb
    .from("subscriptions")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "update_failed", details: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ subscription: updated });
}
```

- [ ] **Step 2: Manual verify**

```bash
fetch('/api/subscriptions/<id>', {
  method: 'PATCH',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({ push_interval_seconds: 30 })
}).then(r => r.json()).then(console.log)
```

Expected: `{ subscription: { ..., push_interval_seconds: 30 } }`.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/\[id\]/route.ts
git commit -m "feat(api): PATCH subscription policy fields"
```

---

### Task 21: `<SubscriptionPolicyForm>` + Revoke button on `/admin/users/[id]`

**Files:**
- Create: `components/admin/subscription-policy-form.tsx`
- Modify: `components/admin/user-subscriptions-panel.tsx`

- [ ] **Step 1: Create the policy form**

```tsx
// components/admin/subscription-policy-form.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type PropfirmRuleOption = { id: number; name: string };

export function SubscriptionPolicyForm({
  subscriptionId,
  initialPushInterval,
  initialRuleId,
  rules,
}: {
  subscriptionId: number;
  initialPushInterval: number;
  initialRuleId: number | null;
  rules: PropfirmRuleOption[];
}) {
  const [push, setPush] = useState(initialPushInterval);
  const [ruleId, setRuleId] = useState<string>(initialRuleId == null ? "none" : String(initialRuleId));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          push_interval_seconds: push,
          propfirm_rule_id: ruleId === "none" ? null : Number(ruleId),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Save failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Policy updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="grid grid-cols-2 gap-3 mt-2">
      <div className="space-y-1">
        <Label htmlFor={`push-${subscriptionId}`} className="text-xs">Push interval</Label>
        <Input
          id={`push-${subscriptionId}`}
          type="number"
          min={3}
          max={60}
          value={push}
          onChange={(e) => setPush(Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Propfirm rule</Label>
        <Select value={ruleId} onValueChange={setRuleId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(none)</SelectItem>
            {rules.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save policy"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Wire into `user-subscriptions-panel.tsx`**

Read `components/admin/user-subscriptions-panel.tsx` first. For each subscription card the panel renders:
- Pass `push_interval_seconds` and `propfirm_rule_id` from the subscription row, plus the list of `rules`, into the new `<SubscriptionPolicyForm>`. Render the form only when `status !== 'pending'`.
- For `status === 'active'` subscriptions, also render `<RevokeDialog subscriptionId={s.id} productLabel={...} tierLabel={...} />`.

The page component (`app/admin/users/[id]/page.tsx`) needs to fetch `propfirm_rules` and pass them to the panel.

Example shape inside the existing panel render (insert near the bottom of each card):

```tsx
{s.status !== "pending" && (
  <SubscriptionPolicyForm
    subscriptionId={s.id}
    initialPushInterval={s.push_interval_seconds}
    initialRuleId={s.propfirm_rule_id}
    rules={rules}
  />
)}
{s.status === "active" && (
  <div className="mt-2">
    <RevokeDialog
      subscriptionId={s.id}
      productLabel={productDisplayName(s.product)}
      tierLabel={tierLabel(s.tier)}
    />
  </div>
)}
```

Add the `rules: PropfirmRuleOption[]` prop to the panel and update `app/admin/users/[id]/page.tsx`:

```tsx
const { data: rules } = await sb.from("propfirm_rules").select("id, name").order("name");
return <UserSubscriptionsPanel subscriptions={subs ?? []} rules={rules ?? []} />;
```

- [ ] **Step 3: Smoke-test**

Visit `/admin/users/[id]` for any user with subscriptions:
- Active card shows policy form + Revoke button.
- Edit push_interval, save → toast, value persists after refresh.
- Click Revoke → confirm → status flips, child licenses revoked, email sent.

- [ ] **Step 4: Commit**

```bash
git add components/admin/subscription-policy-form.tsx components/admin/user-subscriptions-panel.tsx app/admin/users/\[id\]/page.tsx
git commit -m "feat(admin): subscription policy edit + revoke on user detail page"
```

---

### Task 22: Reattach legacy license API

**Files:**
- Create: `app/api/licenses/[id]/reattach/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { reattachLicenseSchema } from "@/lib/schemas";
import { isLegacyAdmin } from "@/lib/users";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const { data: { session } } = await ssr.auth.getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user: session.user as never }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = reattachLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const targetUserId = parsed.data.target_user_id;

  const sb = getSupabaseAdmin();

  // Fetch license + current owner email.
  const { data: lic, error: licErr } = await sb
    .from("licenses")
    .select("id, user_id, subscription_id, product, tier, expires_at, users!inner(email)")
    .eq("id", id)
    .maybeSingle();
  if (licErr) return NextResponse.json({ error: "lookup_failed", details: licErr.message }, { status: 500 });
  if (!lic) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const currentOwnerEmail = (lic as any).users?.email as string | undefined;
  if (!isLegacyAdmin(currentOwnerEmail)) {
    return NextResponse.json({ error: "not_legacy_owned" }, { status: 409 });
  }

  // Ensure target exists.
  const { data: target } = await sb.from("users").select("id").eq("id", targetUserId).maybeSingle();
  if (!target) return NextResponse.json({ error: "target_not_found" }, { status: 404 });

  // Create a new active subscription for the target user.
  const { data: newSub, error: subErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: targetUserId,
      product: lic.product,
      tier: lic.tier,
      status: "active",
      requested_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: session.user.id,
      expires_at: lic.expires_at,
      push_interval_seconds: 10,
      propfirm_rule_id: null,
      notes: "Reattached from legacy backfill",
    })
    .select()
    .single();
  if (subErr) return NextResponse.json({ error: "subscription_insert_failed", details: subErr.message }, { status: 500 });

  // Re-point the license.
  const { data: updatedLic, error: updErr } = await sb
    .from("licenses")
    .update({ subscription_id: newSub.id, user_id: targetUserId })
    .eq("id", id)
    .select()
    .single();
  if (updErr) {
    // Best-effort cleanup of the orphan subscription.
    await sb.from("subscriptions").delete().eq("id", newSub.id);
    return NextResponse.json({ error: "license_update_failed", details: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ license: updatedLic, subscription: newSub });
}
```

- [ ] **Step 2: Manual verify**

Identify a legacy-owned license (`select id from licenses l join users u on u.id = l.user_id where u.email = 'legacy@copytraderx.local' limit 1`). Call:

```bash
fetch('/api/licenses/<id>/reattach', {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({ target_user_id: '<real-user-uuid>' })
}).then(r => r.json()).then(console.log)
```

Expected: `{ license: {...}, subscription: {...} }`. Confirm in Studio that the license now belongs to the new user + new subscription.

- [ ] **Step 3: Commit**

```bash
git add app/api/licenses/\[id\]/reattach/route.ts
git commit -m "feat(api): reattach legacy license to a real user"
```

---

### Task 23: Reattach UI section on `/admin/licenses/[id]`

**Files:**
- Create: `components/admin/reattach-legacy-license-section.tsx`
- Modify: `app/admin/licenses/[id]/page.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/admin/reattach-legacy-license-section.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserTypeahead, type UserOption } from "./user-typeahead";
import { toast } from "sonner";

export function ReattachLegacyLicenseSection({ licenseId }: { licenseId: number }) {
  const [target, setTarget] = useState<UserOption | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit() {
    if (!target) {
      toast.error("Pick a user to reattach to");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/licenses/${licenseId}/reattach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_user_id: target.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Reattach failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("License reattached");
      router.refresh();
    });
  }

  return (
    <section className="border rounded-md p-4 mt-6 bg-amber-50 dark:bg-amber-950/30">
      <h2 className="font-semibold mb-2">Reattach legacy license</h2>
      <p className="text-sm text-muted-foreground mb-3">
        This license currently belongs to the synthetic legacy admin (created during the
        Plan 2 backfill). Pick the real user it should belong to. A new active subscription
        will be created on that user, inheriting the license&rsquo;s expires_at.
      </p>
      <div className="space-y-2">
        <Label>Target user</Label>
        <UserTypeahead value={target} onChange={setTarget} />
      </div>
      <Button onClick={onSubmit} disabled={isPending} className="mt-3">
        {isPending ? "Reattaching…" : "Reattach"}
      </Button>
    </section>
  );
}
```

- [ ] **Step 2: Render the section conditionally on the edit page**

In `app/admin/licenses/[id]/page.tsx`, after fetching the license, also fetch the owner's email and render the section iff it's the legacy admin:

```tsx
import { isLegacyAdmin } from "@/lib/users";
import { ReattachLegacyLicenseSection } from "@/components/admin/reattach-legacy-license-section";

// inside the page component, after fetching `license`:
const { data: owner } = await sb
  .from("users")
  .select("email")
  .eq("id", license.user_id)
  .maybeSingle();
const legacyOwned = isLegacyAdmin(owner?.email);

// render — at the bottom of the page body:
{legacyOwned && <ReattachLegacyLicenseSection licenseId={license.id} />}
```

- [ ] **Step 3: Smoke-test**

Visit `/admin/licenses/[id]` for a known legacy-owned license. Section appears. Pick a user, reattach, verify the section disappears after refresh and the license now belongs to the picked user.

- [ ] **Step 4: Commit**

```bash
git add components/admin/reattach-legacy-license-section.tsx app/admin/licenses/\[id\]/page.tsx
git commit -m "feat(admin): reattach legacy license section on edit page"
```

---

### Task 24: pg_cron daily expiry + manual trigger script

**Files:**
- Create: `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260508000002_install_expiry_cron.sql`
- Create: `scripts/expire-subscriptions.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the cron migration**

```sql
-- 20260508000002_install_expiry_cron.sql
--
-- Daily natural expiry. The trigger from 20260506000005 cascades child
-- licenses automatically, so this single update is enough.
--
-- Rollback: select cron.unschedule('subscriptions-expire-daily');

select cron.schedule(
  'subscriptions-expire-daily',
  '0 0 * * *',
  $$
    update public.subscriptions
       set status = 'expired'
     where status = 'active'
       and expires_at <= now();
  $$
);
```

- [ ] **Step 2: Apply the migration**

```bash
cd ~/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Verify in Supabase Studio → Database → Cron jobs: `subscriptions-expire-daily` listed. (If pg_cron is not available locally, that's expected — local dev uses the manual script. The migration runs on production Supabase Pro+ where pg_cron is enabled.)

- [ ] **Step 3: Create the manual script**

```ts
// scripts/expire-subscriptions.ts
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
config({ path: ".env.local", override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await sb.rpc("expire_due_subscriptions").catch(() => ({ data: null, error: null } as any));
  if (error) {
    console.error("RPC failed; falling back to direct SQL update:", error.message);
  }
  // Fallback: direct update via PostgREST (works without an RPC function defined).
  const now = new Date().toISOString();
  const { data: rows, error: updErr } = await sb
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "active")
    .lte("expires_at", now)
    .select("id");
  if (updErr) {
    console.error("Update failed:", updErr.message);
    process.exit(1);
  }
  console.log(`Expired ${rows?.length ?? 0} subscription(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Add an npm script**

In `package.json` `scripts` block, add:

```json
"expire:subs": "tsx scripts/expire-subscriptions.ts"
```

- [ ] **Step 5: Manual verify**

Set a test subscription's `expires_at` to a past timestamp in Studio. Run:

```bash
pnpm expire:subs
```

Expected: `Expired 1 subscription(s).` Confirm in Studio that status flipped and child licenses cascaded.

- [ ] **Step 6: Commit**

```bash
# In the EA repo:
cd ~/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260508000002_install_expiry_cron.sql
git commit -m "feat(db): pg_cron daily subscription expiry job"

# Back in this repo:
cd ~/Documents/development/copytraderx-license
git add scripts/expire-subscriptions.ts package.json
git commit -m "feat(scripts): manual subscription expiry trigger"
```

---

### Task 25: Playwright install + config

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `.env.test.example`
- Modify: `.gitignore` (add `.env.test`)

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Add the e2e script to `package.json`**

```json
"e2e": "playwright test"
```

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.test" });

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/helpers/seed.ts",
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: "pnpm dev",
        url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
```

- [ ] **Step 4: Create `.env.test.example`**

```env
# Copy to .env.test (gitignored). Point at a DEDICATED test Supabase project.
# NEVER point this at production.
PLAYWRIGHT_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<test-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<test-project-service-role-key>
INITIAL_ADMIN_EMAIL=help.copytraderx@gmail.com
INITIAL_ADMIN_PASSWORD=<test-admin-password>
TEST_USER_EMAIL=e2e-user@example.com
TEST_USER_PASSWORD=<test-user-password>
```

- [ ] **Step 5: Add `.env.test` to `.gitignore`**

```bash
echo ".env.test" >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts .env.test.example .gitignore
git commit -m "chore(e2e): install Playwright + config"
```

---

### Task 26: E2E helpers — seed + auth bypass

**Files:**
- Create: `e2e/helpers/seed.ts`
- Create: `e2e/helpers/auth.ts`

- [ ] **Step 1: Create the seed helper (globalSetup)**

```ts
// e2e/helpers/seed.ts
import { createClient } from "@supabase/supabase-js";

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing test Supabase env vars");

  // Refuse to run against a non-test project as a defensive guard.
  if (!/test|stag|local/i.test(url)) {
    throw new Error(`Refusing to seed against ${url} — URL must contain 'test', 'stag', or 'local'`);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Truncate Plan 1+ tables in dependency order. Service role bypasses RLS.
  for (const table of ["licenses", "subscriptions", "users"]) {
    await sb.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // Seed admin via Auth admin API.
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL!;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD!;
  const { data: existing } = await sb.auth.admin.listUsers();
  const adminAuth = existing.users.find((u) => u.email === adminEmail);
  if (!adminAuth) {
    const { data, error } = await sb.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: "admin" },
    });
    if (error) throw error;
    await sb.from("users").insert({
      id: data.user!.id,
      email: adminEmail,
      role: "admin",
      must_change_password: false,
    });
  }

  // Seed the test user.
  const userEmail = process.env.TEST_USER_EMAIL!;
  const userPassword = process.env.TEST_USER_PASSWORD!;
  const userAuth = existing.users.find((u) => u.email === userEmail);
  if (!userAuth) {
    const { data, error } = await sb.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
      app_metadata: { role: "user" },
    });
    if (error) throw error;
    await sb.from("users").insert({
      id: data.user!.id,
      email: userEmail,
      role: "user",
      must_change_password: false,
    });
  }
}
```

- [ ] **Step 2: Create the auth helper**

```ts
// e2e/helpers/auth.ts
import type { Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

async function getAccessToken(email: string, password: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session.access_token;
}

export async function loginAs(
  ctx: BrowserContext,
  page: Page,
  who: "admin" | "user",
): Promise<void> {
  const email = who === "admin"
    ? process.env.INITIAL_ADMIN_EMAIL!
    : process.env.TEST_USER_EMAIL!;
  const password = who === "admin"
    ? process.env.INITIAL_ADMIN_PASSWORD!
    : process.env.TEST_USER_PASSWORD!;

  // Use the real login form so cookies set by the SSR helper are correct.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/
git commit -m "chore(e2e): seed + auth helpers"
```

---

### Task 27: E2E spec — `role-boundary.spec.ts`

**Files:**
- Create: `e2e/role-boundary.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("anonymous → /login on /admin/* and /dashboard/*", async ({ page }) => {
  await page.goto("/admin/licenses");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("user role cannot reach /admin/*", async ({ page, context }) => {
  await loginAs(context, page, "user");
  await page.goto("/admin/licenses");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("admin role redirected from /dashboard to /admin/licenses", async ({ page, context }) => {
  await loginAs(context, page, "admin");
  await page.goto("/dashboard");
  // Admins viewing /dashboard get bounced to admin home.
  await expect(page).toHaveURL(/\/admin\//);
});
```

- [ ] **Step 2: Run**

```bash
pnpm e2e -- role-boundary
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/role-boundary.spec.ts
git commit -m "test(e2e): role boundary checks"
```

---

### Task 28: E2E spec — `admin-creates-user.spec.ts`

**Files:**
- Create: `e2e/admin-creates-user.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("admin creates a user and sees them in the users list", async ({ page, context }) => {
  await loginAs(context, page, "admin");
  await page.goto("/admin/users/new");
  const stamp = Date.now();
  const email = `created-${stamp}@example.com`;
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/full name/i).fill("E2E Created");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/admin\/users(\/.+)?$/);
  await page.goto("/admin/users");
  await expect(page.getByText(email)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm e2e -- admin-creates-user
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-creates-user.spec.ts
git commit -m "test(e2e): admin creates user"
```

---

### Task 29: E2E spec — `user-claims-slot.spec.ts`

**Files:**
- Create: `e2e/user-claims-slot.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs } from "./helpers/auth";

test("user claims a live slot and sees it on the dashboard", async ({ page, context }) => {
  // Provision an active subscription on the test user via service role.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: u } = await sb.from("users").select("id").eq("email", process.env.TEST_USER_EMAIL!).single();
  await sb.from("subscriptions").insert({
    user_id: u!.id,
    product: "impulse",
    tier: "monthly",
    status: "active",
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    push_interval_seconds: 10,
  });

  await loginAs(context, page, "user");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /add mt5 account/i }).first().click();
  await page.getByLabel(/mt5/i).fill("12345678");
  await page.getByRole("button", { name: /claim/i }).click();
  await expect(page.getByText("12345678")).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm e2e -- user-claims-slot
```

- [ ] **Step 3: Commit**

```bash
git add e2e/user-claims-slot.spec.ts
git commit -m "test(e2e): user claims a slot"
```

---

### Task 30: E2E specs — request/approve, cancel, revoke

**Files:**
- Create: `e2e/user-requests-and-admin-approves.spec.ts`
- Create: `e2e/user-cancels-request.spec.ts`
- Create: `e2e/admin-revokes-subscription.spec.ts`

- [ ] **Step 1: `user-requests-and-admin-approves.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("user requests, admin approves, user sees active subscription", async ({ browser }) => {
  // User submits.
  const userCtx = await browser.newContext();
  const userPage = await userCtx.newPage();
  await loginAs(userCtx, userPage, "user");
  await userPage.goto("/dashboard");
  await userPage.getByRole("button", { name: /request new license/i }).click();
  await userPage.getByLabel(/product/i).selectOption("ctx-live");
  await userPage.getByLabel(/tier/i).selectOption("monthly");
  await userPage.getByRole("button", { name: /submit/i }).click();
  await expect(userPage.getByText(/pending approval/i)).toBeVisible();

  // Admin approves.
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAs(adminCtx, adminPage, "admin");
  await adminPage.goto("/admin/requests");
  await adminPage.getByRole("button", { name: /approve/i }).first().click();
  await expect(adminPage.getByText(/no pending requests/i)).toBeVisible();

  // User sees active.
  await userPage.reload();
  await expect(userPage.getByText(/CTX Live/i)).toBeVisible();
});
```

- [ ] **Step 2: `user-cancels-request.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test("user can cancel a pending request", async ({ context, page }) => {
  await loginAs(context, page, "user");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /request new license/i }).click();
  await page.getByLabel(/product/i).selectOption("impulse");
  await page.getByLabel(/tier/i).selectOption("monthly");
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.getByText(/pending approval/i)).toBeVisible();

  await page.getByRole("button", { name: /cancel request/i }).click();
  await expect(page.getByText(/pending approval/i)).toHaveCount(0);
});
```

- [ ] **Step 3: `admin-revokes-subscription.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs } from "./helpers/auth";

test("admin revokes an active subscription; user sees expired/revoked banner", async ({ browser }) => {
  // Provision an active subscription on the test user.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: u } = await sb.from("users").select("id").eq("email", process.env.TEST_USER_EMAIL!).single();
  const { data: sub } = await sb
    .from("subscriptions")
    .insert({
      user_id: u!.id,
      product: "impulse",
      tier: "monthly",
      status: "active",
      requested_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      push_interval_seconds: 10,
    })
    .select()
    .single();

  // Admin revokes via API.
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAs(adminCtx, adminPage, "admin");
  await adminPage.goto(`/admin/users/${u!.id}`);
  await adminPage.getByRole("button", { name: /revoke/i }).first().click();
  await adminPage.getByRole("button", { name: /^revoke$/i }).click(); // confirm
  await expect(adminPage.getByText(/revoked/i)).toBeVisible();

  // Verify in DB.
  const { data: after } = await sb.from("subscriptions").select("status").eq("id", sub!.id).single();
  expect(after?.status).toBe("revoked");
});
```

- [ ] **Step 4: Run all specs**

```bash
pnpm e2e
```

Expected: all 6 specs pass. If any fail, capture trace, fix the bug or selector, re-run.

- [ ] **Step 5: Commit**

```bash
git add e2e/user-requests-and-admin-approves.spec.ts e2e/user-cancels-request.spec.ts e2e/admin-revokes-subscription.spec.ts
git commit -m "test(e2e): request/approve, cancel, revoke flows"
```

---

### Task 31: README update + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a "Plan 5 ops" section to `README.md`**

Add the following section (place it under "Scripts" or similar):

```markdown
## Subscription expiry

Production runs a daily Supabase pg_cron job (`subscriptions-expire-daily`) at
00:00 UTC that flips `subscriptions.status` from `active` to `expired` once
`expires_at` has passed. The trigger from migration `20260506000005` cascades
the status change to child licenses.

For local development or manual testing, run:

```bash
pnpm expire:subs
```

This connects via the service role key and applies the same SQL.

## End-to-end tests

E2E tests live in `e2e/` and are run with Playwright.

```bash
cp .env.test.example .env.test
# fill in test Supabase project credentials — NEVER use production values
pnpm e2e
```

The suite seeds a known admin + user before each run via `e2e/helpers/seed.ts`.
The seed helper refuses to run unless the Supabase URL contains `test`, `stag`,
or `local`.
```

- [ ] **Step 2: Final test sweep**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm e2e
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Plan 5 ops notes (cron, e2e)"
```

- [ ] **Step 4: Plan-completion summary**

Open this plan file and check off the final box:

- [ ] **Plan complete.** Ready to merge `feat/admin-client-roles` to `main`. Run `/update-kb` to backfill the Obsidian vault.

---

## Verification matrix (run before declaring done)

| Check | Command | Expected |
|---|---|---|
| Unit tests | `pnpm test` | All pass, including 5 new schemas + 3 new guards + 2 new senders |
| Type-check | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm exec eslint .` | No errors |
| E2E | `pnpm e2e` | 6 specs pass |
| Approve flow (manual) | sign in admin → /admin/requests → Approve | status flips, email sent, badge decrements |
| Reject flow (manual) | sign in admin → Reject with reason | status flips, reason stored, email sent |
| Revoke flow (manual) | sign in admin → /admin/users/[id] → Revoke | status flips, child licenses cascaded, email sent |
| Admin-direct create (manual) | /admin/subscriptions/new → fill → Create | redirect to /admin/users/[id], new sub appears, optional email sent |
| Legacy redirect (manual) | visit /admin/licenses/new | 307 to /admin/subscriptions/new |
| Reattach (manual) | visit a legacy-owned license edit page | section visible; reattach moves the license to the picked user with a new subscription |
| Policy edit (manual) | /admin/users/[id] → save policy | row updates, value persists |
| Cron (manual) | `pnpm expire:subs` after setting expires_at to past | row flips to expired, child licenses cascade |
