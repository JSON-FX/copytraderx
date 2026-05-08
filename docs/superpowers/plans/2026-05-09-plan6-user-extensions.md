# Plan 6 — User-Initiated Subscription Extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users request pre-expiry extensions on their `active` subscriptions, admin approves/rejects on the existing `/admin/requests` page, approval extends the source row in place (preserving slots and child licenses) with full audit history.

**Architecture:** New `subscription_extensions` audit table with `pending → approved | rejected` state. New cascade trigger pushes `subscriptions.expires_at` forward to child licenses on extension approval (forward-only). Tier downgrades blocked at schema/API/UI. Auto-reject pending extensions in cron expiry sweep and admin revoke handler (idempotent via `WHERE status='pending'` clause).

**Tech Stack:** Next.js 16 App Router · Supabase (Postgres + RLS + pg_cron) · zod schemas · React 19 + shadcn/ui + Radix Dialog · Jest + ts-jest · nodemailer · Playwright (E2E in Plan 5).

**Spec:** `docs/superpowers/specs/2026-05-09-plan6-user-extensions-design.md` (committed `ccd267c`).

---

## File structure

### EA repo migrations (`/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`)

- `20260509000001_create_subscription_extensions.sql` — table + 4 indexes + CHECK constraints
- `20260509000002_subscription_expires_at_cascade.sql` — trigger function + AFTER UPDATE OF expires_at trigger
- `20260509000003_subscription_extensions_rls.sql` — RLS policies

### App lib (`/Users/jsonse/Documents/development/copytraderx-license/lib/`)

- `types.ts` — EXTEND with `SubscriptionExtension`, `RejectionCode`
- `subscription-state.ts` — EXTEND with `canExtendFrom`, `tierRank`, `canExtendToTier`
- `subscription-state.test.ts` — EXTEND
- `schemas.ts` — EXTEND with `extendSubscriptionRequestSchema` and supporting types
- `schemas.test.ts` — EXTEND
- `email.ts` — EXTEND existing senders with `kind: 'license' | 'extension'` field; add `rejection_code` lookup for auto-reject copy
- `email.test.ts` — EXTEND
- `dashboard-data.ts` — EXTEND to load pending extensions per subscription (single batched query)
- `dashboard-data.test.ts` — EXTEND

### App API routes

- `app/api/extensions/route.ts` — NEW (POST submit)
- `app/api/extensions/[id]/route.ts` — NEW (DELETE cancel)
- `app/api/extensions/[id]/approve/route.ts` — NEW (POST admin approve)
- `app/api/extensions/[id]/reject/route.ts` — NEW (POST admin reject)
- `app/api/subscriptions/[id]/revoke/route.ts` — EXTEND to auto-reject pending extensions

### UI components

- `components/user/extend-dialog.tsx` — NEW
- `components/user/extension-status-line.tsx` — NEW
- `components/user/subscription-card.tsx` — EXTEND (Extend button gate; status line render)
- `components/admin/pending-extensions-table.tsx` — NEW
- `app/admin/requests/page.tsx` — EXTEND (mount PendingExtensionsTable)

### Scripts

- `scripts/expire-subscriptions.ts` — EXTEND with auto-reject sweep step

---

## Task ordering rationale

Tasks 1–3 are SQL migrations; ship them as one push so subsequent tasks can rely on the schema. Tasks 4–6 are pure-lib changes (state guards, schemas, email senders). Tasks 7–9 are API routes (each with tests, top-down: submit → cancel → approve/reject). Task 10 is the cascade-aware dashboard loader. Task 11 wires UI. Task 12 patches revoke handler. Task 13 patches the cron script. Task 14 is final verification.

---

### Task 1: Create `subscription_extensions` table + indexes

**Files:**
- Create: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260509000001_create_subscription_extensions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Plan 6: Subscription extensions — pre-expiry tier change / lifetime extension
-- with full audit history. Approved extensions update the source subscription's
-- expires_at + tier in place; this table captures every request (pending →
-- approved | rejected) with a delta snapshot so audit survives later mutation
-- of the source row.

create table public.subscription_extensions (
  id                  bigserial primary key,
  -- ON DELETE RESTRICT: hard-deleting a subscription with extension history is
  -- forbidden. Audit must outlive the source row.
  subscription_id     bigint  not null references public.subscriptions(id) on delete restrict,
  user_id             uuid    not null references public.users(id) on delete cascade,
  requested_tier      text    not null check (requested_tier in ('monthly','quarterly','yearly')),
  status              text    not null check (status in ('pending','approved','rejected')),
  requested_at        timestamptz not null default now(),
  approved_at         timestamptz,
  approved_by         uuid    references public.users(id),
  -- Split rejection: machine code + human copy. admin_manual stores the
  -- admin's typed reason in rejection_message; auto-reject codes have a
  -- copy lookup in lib/email.ts that also persists to rejection_message.
  rejection_code      text,
  rejection_message   text,
  -- Snapshot at approval time so audit survives later source mutation/revocation.
  old_tier            text,
  new_tier            text,
  old_expires_at      timestamptz,
  new_expires_at      timestamptz,
  notes               text,
  created_at          timestamptz not null default now()
);

create index idx_extensions_user      on public.subscription_extensions(user_id, status);
create index idx_extensions_pending   on public.subscription_extensions(status) where status = 'pending';
create index idx_extensions_source    on public.subscription_extensions(subscription_id, status);

-- Invariant: at most one pending extension per source subscription.
-- INSERT conflicts here surface to the API as 23505 unique_violation; the
-- API maps that to 409 extension_already_pending so the UI can show the
-- recovery flow ("cancel the existing pending first").
create unique index idx_extensions_one_pending_per_source
  on public.subscription_extensions(subscription_id)
  where status = 'pending';

comment on table public.subscription_extensions is
  'Plan 6: pre-expiry extension requests. Approved extensions mutate parent subscription in place; this table is the audit trail.';
```

- [ ] **Step 2: Apply locally and verify**

Run from the EA repo:

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: migration applies cleanly. Verify with:

```bash
supabase db reset --debug 2>&1 | grep -i "subscription_extensions\|error" | head -20
```

(or use the Supabase dashboard to confirm the table + 4 indexes exist).

- [ ] **Step 3: Commit (in EA repo, not the app repo)**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
git add supabase/migrations/20260509000001_create_subscription_extensions.sql
git commit -m "feat(db): subscription_extensions table for Plan 6"
```

---

### Task 2: Cascade trigger — `expires_at` forward-only

**Files:**
- Create: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260509000002_subscription_expires_at_cascade.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Plan 6: When an admin approves an extension and bumps subscriptions.expires_at
-- forward, child licenses should follow. This trigger is intentionally
-- forward-only — admin policy edits that *shrink* expires_at (allowed by
-- Plan 5's <SubscriptionPolicyForm>) do not cascade. If admin wants to
-- shorten a license's expiry, they edit the license directly.
--
-- Fires on a different column than the Plan 5 status-cascade trigger
-- (20260506000005), so trigger ordering is non-overlapping.

create or replace function public.cascade_subscription_expires_at_to_licenses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expires_at is distinct from old.expires_at
     and new.expires_at is not null
     and (old.expires_at is null or new.expires_at > old.expires_at) then
    update public.licenses
       set expires_at = new.expires_at
     where subscription_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_subscription_expires_at_cascade on public.subscriptions;
create trigger trg_subscription_expires_at_cascade
  after update of expires_at on public.subscriptions
  for each row
  execute function public.cascade_subscription_expires_at_to_licenses();

comment on function public.cascade_subscription_expires_at_to_licenses is
  'Plan 6: forward-only cascade — pushes a subscriptions.expires_at increase to all child licenses. Backward shifts (admin edits) are NOT cascaded.';
```

- [ ] **Step 2: Apply locally**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: trigger function and trigger created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260509000002_subscription_expires_at_cascade.sql
git commit -m "feat(db): forward-only expires_at cascade trigger for Plan 6"
```

---

### Task 3: RLS policies for `subscription_extensions`

**Files:**
- Create: `/Users/jsonse/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/20260509000003_subscription_extensions_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Plan 6: RLS for subscription_extensions. Service role bypasses RLS, so
-- server-rendered admin flows are unaffected. These policies protect any
-- future direct-from-browser query (e.g. real-time).

alter table public.subscription_extensions enable row level security;

-- User reads own extensions.
create policy extensions_self_select on public.subscription_extensions
  for select to authenticated
  using (user_id = auth.uid());

-- User inserts own pending. The status check in the with-check expression is
-- belt-and-braces; the API also enforces it via extendSubscriptionRequestSchema.
create policy extensions_self_insert_pending on public.subscription_extensions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.subscriptions s
       where s.id = subscription_id
         and s.user_id = auth.uid()
         and s.status = 'active'
    )
  );

-- User cancels own pending.
create policy extensions_self_cancel_pending on public.subscription_extensions
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- Admin: full.
create policy extensions_admin_all on public.subscription_extensions
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Apply locally**

```bash
cd /Users/jsonse/Documents/development/EA/JSONFX-IMPULSE
supabase db push
```

Expected: 4 policies created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260509000003_subscription_extensions_rls.sql
git commit -m "feat(db): RLS for subscription_extensions"
```

---

### Task 4: Extend `lib/types.ts` + state guards

**Files:**
- Modify: `lib/types.ts` (append at end)
- Modify: `lib/subscription-state.ts` (append at end)
- Test: `lib/subscription-state.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `lib/subscription-state.test.ts`:

```ts
import {
  canExtendFrom,
  canExtendToTier,
  tierRank,
} from "./subscription-state";

describe("canExtendFrom", () => {
  test.each([
    ["pending", false, "subscription_not_active"],
    ["active", true, undefined],
    ["rejected", false, "subscription_not_active"],
    ["expired", false, "subscription_not_active"],
    ["revoked", false, "subscription_not_active"],
  ] as const)("status=%s → ok=%s", (status, ok, reason) => {
    const r = canExtendFrom({ status });
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("tierRank", () => {
  test("orders monthly < quarterly < yearly", () => {
    expect(tierRank.monthly).toBeLessThan(tierRank.quarterly);
    expect(tierRank.quarterly).toBeLessThan(tierRank.yearly);
  });
});

describe("canExtendToTier", () => {
  // 9-cell table: source × requested.
  test.each([
    ["monthly", "monthly", true],
    ["monthly", "quarterly", true],
    ["monthly", "yearly", true],
    ["quarterly", "monthly", false],
    ["quarterly", "quarterly", true],
    ["quarterly", "yearly", true],
    ["yearly", "monthly", false],
    ["yearly", "quarterly", false],
    ["yearly", "yearly", true],
  ] as const)("source=%s requested=%s → ok=%s", (source, requested, ok) => {
    const r = canExtendToTier(source, requested);
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe("tier_downgrade_not_allowed");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test lib/subscription-state.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Append to `lib/subscription-state.ts`**

```ts
import type { LicenseTier } from "./types";

export const tierRank = { monthly: 1, quarterly: 2, yearly: 3 } as const;

export function canExtendFrom(s: { status: SubscriptionStatus }): GuardResult {
  if (s.status === "active") return { ok: true };
  return { ok: false, reason: "subscription_not_active" };
}

export function canExtendToTier(
  sourceTier: LicenseTier,
  requestedTier: LicenseTier,
): GuardResult {
  if (tierRank[requestedTier] >= tierRank[sourceTier]) return { ok: true };
  return { ok: false, reason: "tier_downgrade_not_allowed" };
}
```

(Add `import type { LicenseTier } from "./types";` to the existing import block if not already present.)

- [ ] **Step 4: Append to `lib/types.ts`**

```ts
// ── Plan 6: subscription extensions ──────────────────────────────────────────

export type SubscriptionExtensionStatus = "pending" | "approved" | "rejected";

export type RejectionCode =
  | "source_expired_before_approval"
  | "source_revoked_before_approval"
  | "admin_manual";

export interface SubscriptionExtension {
  id: number;
  subscription_id: number;
  user_id: string;
  requested_tier: LicenseTier;
  status: SubscriptionExtensionStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_code: RejectionCode | null;
  rejection_message: string | null;
  old_tier: LicenseTier | null;
  new_tier: LicenseTier | null;
  old_expires_at: string | null;
  new_expires_at: string | null;
  notes: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test lib/subscription-state.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/subscription-state.ts lib/subscription-state.test.ts
git commit -m "feat(state): add canExtendFrom, tierRank, canExtendToTier guards"
```

---

### Task 5: Extend `lib/schemas.ts` with `extendSubscriptionRequestSchema`

**Files:**
- Modify: `lib/schemas.ts` (append at end)
- Test: `lib/schemas.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `lib/schemas.test.ts`:

```ts
import { extendSubscriptionRequestSchema } from "./schemas";

describe("extendSubscriptionRequestSchema", () => {
  test("accepts valid body", () => {
    const r = extendSubscriptionRequestSchema.safeParse({
      subscription_id: 1,
      requested_tier: "yearly",
    });
    expect(r.success).toBe(true);
  });

  test("rejects non-positive subscription_id", () => {
    const r = extendSubscriptionRequestSchema.safeParse({
      subscription_id: 0,
      requested_tier: "monthly",
    });
    expect(r.success).toBe(false);
  });

  test("rejects unknown tier", () => {
    const r = extendSubscriptionRequestSchema.safeParse({
      subscription_id: 1,
      requested_tier: "weekly",
    });
    expect(r.success).toBe(false);
  });

  test("accepts optional notes", () => {
    const r = extendSubscriptionRequestSchema.safeParse({
      subscription_id: 1,
      requested_tier: "monthly",
      notes: "thanks",
    });
    expect(r.success).toBe(true);
  });

  test("strips empty-string notes to null", () => {
    const r = extendSubscriptionRequestSchema.safeParse({
      subscription_id: 1,
      requested_tier: "monthly",
      notes: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notes).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test lib/schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `lib/schemas.ts`**

After the existing `// ── Plan 5 admin schemas ──` block, append:

```ts
// ── Plan 6: subscription extensions ──────────────────────────────────────────

export const extendSubscriptionRequestSchema = z
  .object({
    subscription_id: z.number().int().positive(),
    requested_tier: tierEnum,
    notes: optionalNonEmpty,
  })
  .strict();

export const rejectExtensionSchema = z
  .object({
    rejection_message: z.string().min(1).max(500),
  })
  .strict();

export type ExtendSubscriptionRequestInput = z.infer<typeof extendSubscriptionRequestSchema>;
export type RejectExtensionInput = z.infer<typeof rejectExtensionSchema>;
```

- [ ] **Step 4: Run tests**

Run: `pnpm test lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/schemas.ts lib/schemas.test.ts
git commit -m "feat(schemas): extendSubscriptionRequestSchema + rejectExtensionSchema"
```

---

### Task 6: Extend email senders with `kind` field + auto-reject copy lookup

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/email.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `lib/email.test.ts`:

```ts
import {
  sendRequestSubmittedEmail,
  sendRequestApprovedEmail,
  sendRequestRejectedEmail,
  rejectionCopyFor,
  mockTransport,
} from "./email";

describe("kind field on senders", () => {
  beforeEach(() => mockTransport.reset());

  test("sendRequestSubmittedEmail with kind='extension' uses [Extension] subject prefix", async () => {
    await sendRequestSubmittedEmail(
      {
        to: "admin@example.com",
        user_email: "u@example.com",
        product_label: "Impulse",
        tier_label: "yearly",
        notes: null,
        kind: "extension",
      },
      mockTransport,
    );
    expect(mockTransport.sent[0].subject).toMatch(/^\[Extension\]/);
  });

  test("sendRequestSubmittedEmail with kind='license' (default) uses [New License] prefix", async () => {
    await sendRequestSubmittedEmail(
      {
        to: "admin@example.com",
        user_email: "u@example.com",
        product_label: "Impulse",
        tier_label: "monthly",
        notes: null,
      },
      mockTransport,
    );
    expect(mockTransport.sent[0].subject).toMatch(/^\[New License\]/);
  });

  test("sendRequestApprovedEmail with kind='extension' mentions extension", async () => {
    await sendRequestApprovedEmail(
      {
        to: "u@example.com",
        product_label: "Impulse",
        tier_label: "yearly",
        expires_at: "2027-05-09",
        kind: "extension",
      },
      mockTransport,
    );
    expect(mockTransport.sent[0].text).toMatch(/extension/i);
  });

  test("sendRequestRejectedEmail kind='extension' uses extension copy", async () => {
    await sendRequestRejectedEmail(
      {
        to: "u@example.com",
        product_label: "Impulse",
        tier_label: "yearly",
        rejection_reason: "manual reason",
        kind: "extension",
      },
      mockTransport,
    );
    expect(mockTransport.sent[0].text).toMatch(/extension/i);
    expect(mockTransport.sent[0].text).toMatch(/manual reason/);
  });
});

describe("rejectionCopyFor", () => {
  test("source_expired_before_approval", () => {
    expect(rejectionCopyFor("source_expired_before_approval")).toMatch(/expired/i);
  });

  test("source_revoked_before_approval", () => {
    expect(rejectionCopyFor("source_revoked_before_approval")).toMatch(/revoked/i);
  });

  test("admin_manual returns null (caller uses stored message verbatim)", () => {
    expect(rejectionCopyFor("admin_manual")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test lib/email.test.ts`
Expected: FAIL (kind field not on type, rejectionCopyFor not exported).

- [ ] **Step 3: Modify `lib/email.ts`**

Find `RequestSubmittedEmailInput`, `RequestApprovedEmailInput`, `RequestRejectedEmailInput` and the matching senders. Replace each with:

```ts
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

// ── Plan 6: rejection-code → user-facing copy lookup ────────────────────────

import type { RejectionCode } from "./types";

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
```

(Move the `import type { RejectionCode }` to the top of the file with the other imports; it's shown inline above for clarity.)

- [ ] **Step 4: Run tests**

Run: `pnpm test lib/email.test.ts`
Expected: PASS. Pre-existing tests in this file should still pass — the new `kind` field is optional with a `"license"` default that preserves old behavior except for the subject prefix change. **If pre-existing tests assert specific subject text, update them to expect `[New License]` prefix.**

- [ ] **Step 5: Run full test suite to catch any subject-text regressions**

Run: `pnpm test`
Expected: PASS. Fix any subject-text assertions that drift.

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/email.test.ts
git commit -m "feat(email): add kind field + rejectionCopyFor lookup for Plan 6"
```

---

### Task 7: API — `POST /api/extensions` (user submits)

**Files:**
- Create: `app/api/extensions/route.ts`

This task ships the route only; integration tests run against the live dev DB after Task 14. (The repo doesn't have an in-process API test harness; we follow the same convention as Plans 4–5 which test routes manually + via Playwright.)

- [ ] **Step 1: Create `app/api/extensions/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extendSubscriptionRequestSchema } from "@/lib/schemas";
import { canExtendFrom, canExtendToTier } from "@/lib/subscription-state";
import { sendRequestSubmittedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = extendSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { subscription_id, requested_tier, notes } = parsed.data;
  const sb = getSupabaseAdmin();

  const { data: source, error: sourceErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status")
    .eq("id", subscription_id)
    .maybeSingle();
  if (sourceErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: sourceErr.message },
      { status: 500 },
    );
  }
  if (!source || source.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const activeGuard = canExtendFrom({ status: source.status });
  if (!activeGuard.ok) {
    return NextResponse.json({ error: activeGuard.reason }, { status: 409 });
  }

  const tierGuard = canExtendToTier(source.tier, requested_tier);
  if (!tierGuard.ok) {
    return NextResponse.json({ error: tierGuard.reason }, { status: 422 });
  }

  const { data: inserted, error: insertErr } = await sb
    .from("subscription_extensions")
    .insert({
      subscription_id,
      user_id: user.id,
      requested_tier,
      status: "pending",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    // 23505 = unique_violation → idx_extensions_one_pending_per_source.
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "extension_already_pending" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "insert_failed", details: insertErr.message },
      { status: 500 },
    );
  }

  const adminTo = process.env.INITIAL_ADMIN_EMAIL;
  if (adminTo) {
    void sendRequestSubmittedEmail({
      to: adminTo,
      user_email: user.email ?? "(unknown)",
      product_label: productDisplayName(source.product),
      tier_label: requested_tier,
      notes: notes ?? null,
      kind: "extension",
    });
  } else {
    console.warn("[api/extensions] INITIAL_ADMIN_EMAIL not set; skipping admin notification");
  }

  return NextResponse.json({ extension: inserted }, { status: 201 });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/extensions/route.ts
git commit -m "feat(api): POST /api/extensions — user submits extension request"
```

---

### Task 8: API — `DELETE /api/extensions/[id]` (user cancels)

**Files:**
- Create: `app/api/extensions/[id]/route.ts`

- [ ] **Step 1: Create the file**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const isAdmin = extractRole({ user }) === "admin";

  const sb = getSupabaseAdmin();
  const { data: ext, error: fetchErr } = await sb
    .from("subscription_extensions")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: fetchErr.message },
      { status: 500 },
    );
  }
  if (!ext) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Owner OR admin.
  if (!isAdmin && ext.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (ext.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  const { error: delErr } = await sb
    .from("subscription_extensions")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "delete_failed", details: delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/extensions/[id]/route.ts
git commit -m "feat(api): DELETE /api/extensions/[id] — cancel pending extension"
```

---

### Task 9: API — admin approve + reject

**Files:**
- Create: `app/api/extensions/[id]/approve/route.ts`
- Create: `app/api/extensions/[id]/reject/route.ts`

- [ ] **Step 1: Create `approve/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { canExtendFrom, canExtendToTier } from "@/lib/subscription-state";
import { calculateExpiresAt } from "@/lib/expiry";
import {
  sendRequestApprovedEmail,
  sendRequestRejectedEmail,
  rejectionCopyFor,
} from "@/lib/email";
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
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();

  const { data: ext, error: extErr } = await sb
    .from("subscription_extensions")
    .select("id, subscription_id, user_id, requested_tier, status")
    .eq("id", id)
    .maybeSingle();
  if (extErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: extErr.message },
      { status: 500 },
    );
  }
  if (!ext) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ext.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  const { data: source, error: srcErr } = await sb
    .from("subscriptions")
    .select("id, user_id, product, tier, status, expires_at")
    .eq("id", ext.subscription_id)
    .maybeSingle();
  if (srcErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: srcErr.message },
      { status: 500 },
    );
  }
  if (!source) {
    return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  }

  const activeGuard = canExtendFrom({ status: source.status });
  if (!activeGuard.ok) {
    // Auto-reject the extension to keep audit clean.
    await sb
      .from("subscription_extensions")
      .update({
        status: "rejected",
        rejection_code: "source_revoked_before_approval",
        rejection_message: rejectionCopyFor("source_revoked_before_approval")!,
      })
      .eq("id", id)
      .eq("status", "pending");
    return NextResponse.json({ error: "source_not_active" }, { status: 409 });
  }

  const tierGuard = canExtendToTier(source.tier, ext.requested_tier);
  if (!tierGuard.ok) {
    return NextResponse.json({ error: tierGuard.reason }, { status: 422 });
  }

  const oldExpiresAt = source.expires_at ? new Date(source.expires_at) : new Date();
  const newExpiresAt = calculateExpiresAt(ext.requested_tier, oldExpiresAt);

  if (newExpiresAt.getTime() <= Date.now()) {
    // Race: source effectively expired between request and approve. Auto-reject.
    await sb
      .from("subscription_extensions")
      .update({
        status: "rejected",
        rejection_code: "source_expired_before_approval",
        rejection_message: rejectionCopyFor("source_expired_before_approval")!,
      })
      .eq("id", id)
      .eq("status", "pending");
    const { data: targetUser } = await sb
      .from("users")
      .select("email")
      .eq("id", ext.user_id)
      .maybeSingle();
    if (targetUser?.email) {
      void sendRequestRejectedEmail({
        to: targetUser.email,
        product_label: productDisplayName(source.product),
        tier_label: tierLabel(ext.requested_tier),
        rejection_reason: rejectionCopyFor("source_expired_before_approval")!,
        kind: "extension",
      });
    }
    return NextResponse.json({ error: "source_expired_before_approval" }, { status: 409 });
  }

  // Step 1: bump source row, gated on still-active.
  const { data: updatedSrc, error: srcUpdErr } = await sb
    .from("subscriptions")
    .update({
      expires_at: newExpiresAt.toISOString(),
      tier: ext.requested_tier,
    })
    .eq("id", source.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (srcUpdErr) {
    return NextResponse.json(
      { error: "update_failed", details: srcUpdErr.message },
      { status: 500 },
    );
  }
  if (!updatedSrc) {
    return NextResponse.json({ error: "concurrent_modification" }, { status: 409 });
  }

  // Step 2: stamp audit row.
  const { data: stampedExt, error: stampErr } = await sb
    .from("subscription_extensions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      old_tier: source.tier,
      new_tier: ext.requested_tier,
      old_expires_at: source.expires_at,
      new_expires_at: newExpiresAt.toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (stampErr || !stampedExt) {
    // Audit stamp failed AFTER source bump committed. Surface the error;
    // operator must hand-reconcile the audit row. Rare — only happens if
    // another concurrent writer flipped the audit row's status in the
    // ~ms between the two updates.
    return NextResponse.json(
      { error: "audit_stamp_failed", details: stampErr?.message ?? "no_pending_row" },
      { status: 500 },
    );
  }

  // Email user. Failures logged inside lib/email and never thrown.
  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", ext.user_id)
    .maybeSingle();
  if (targetUser?.email) {
    void sendRequestApprovedEmail({
      to: targetUser.email,
      product_label: productDisplayName(source.product),
      tier_label: tierLabel(ext.requested_tier),
      expires_at: newExpiresAt.toISOString().slice(0, 10),
      kind: "extension",
    });
  }

  return NextResponse.json({ extension: stampedExt });
}
```

- [ ] **Step 2: Create `reject/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { extractRole } from "@/lib/role";
import { rejectExtensionSchema } from "@/lib/schemas";
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
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (extractRole({ user }) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = rejectExtensionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();

  const { data: ext, error: extErr } = await sb
    .from("subscription_extensions")
    .select("id, subscription_id, user_id, requested_tier, status")
    .eq("id", id)
    .maybeSingle();
  if (extErr) {
    return NextResponse.json(
      { error: "lookup_failed", details: extErr.message },
      { status: 500 },
    );
  }
  if (!ext) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ext.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  const { data: updated, error: updErr } = await sb
    .from("subscription_extensions")
    .update({
      status: "rejected",
      rejection_code: "admin_manual",
      rejection_message: parsed.data.rejection_message,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: "update_failed", details: updErr?.message ?? "no_pending_row" },
      { status: 500 },
    );
  }

  const { data: source } = await sb
    .from("subscriptions")
    .select("product")
    .eq("id", ext.subscription_id)
    .maybeSingle();
  const { data: targetUser } = await sb
    .from("users")
    .select("email")
    .eq("id", ext.user_id)
    .maybeSingle();
  if (source && targetUser?.email) {
    void sendRequestRejectedEmail({
      to: targetUser.email,
      product_label: productDisplayName(source.product),
      tier_label: tierLabel(ext.requested_tier),
      rejection_reason: parsed.data.rejection_message,
      kind: "extension",
    });
  }

  return NextResponse.json({ extension: updated });
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/extensions/[id]/approve/route.ts app/api/extensions/[id]/reject/route.ts
git commit -m "feat(api): admin approve + reject for subscription extensions"
```

---

### Task 10: Dashboard data — load pending extensions per subscription

**Files:**
- Modify: `lib/types.ts` (extend `DashboardSubscription`)
- Modify: `lib/dashboard-data.ts`
- Test: `lib/dashboard-data.test.ts` (append)

- [ ] **Step 1: Update `DashboardSubscription` in `lib/types.ts`**

Replace the existing interface:

```ts
export interface DashboardSubscription {
  subscription: Subscription;
  liveLicense: License | null;
  demoLicense: License | null;
  pendingExtension: SubscriptionExtension | null; // Plan 6
}
```

- [ ] **Step 2: Write the failing test**

Append to `lib/dashboard-data.test.ts`:

```ts
import { groupByProduct } from "./dashboard-data";
import type { DashboardSubscription } from "./types";

describe("groupByProduct preserves pendingExtension", () => {
  test("attaches pendingExtension through the projection", () => {
    const sub: DashboardSubscription = {
      subscription: {
        id: 1,
        user_id: "u",
        product: "impulse",
        tier: "monthly",
        status: "active",
        requested_at: "2026-01-01T00:00:00Z",
        approved_at: "2026-01-01T00:00:00Z",
        approved_by: "a",
        expires_at: "2026-06-01T00:00:00Z",
        rejection_reason: null,
        notes: null,
        created_at: "2026-01-01T00:00:00Z",
        push_interval_seconds: 10,
        propfirm_rule_id: null,
      },
      liveLicense: null,
      demoLicense: null,
      pendingExtension: {
        id: 99,
        subscription_id: 1,
        user_id: "u",
        requested_tier: "yearly",
        status: "pending",
        requested_at: "2026-05-09T00:00:00Z",
        approved_at: null,
        approved_by: null,
        rejection_code: null,
        rejection_message: null,
        old_tier: null,
        new_tier: null,
        old_expires_at: null,
        new_expires_at: null,
        notes: null,
        created_at: "2026-05-09T00:00:00Z",
      },
    };
    const groups = groupByProduct([sub]);
    expect(groups[0].subscriptions[0].pendingExtension?.id).toBe(99);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm test lib/dashboard-data.test.ts`
Expected: FAIL (type error — pre-existing tests build `DashboardSubscription` literals without `pendingExtension`).

- [ ] **Step 4: Update `lib/dashboard-data.ts`**

Replace the `getDashboardData` function body's projection step. The full function:

```ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PRODUCT_CODES } from "./products";
import type { Product } from "./products";
import type {
  DashboardProductGroup,
  DashboardSubscription,
  License,
  Subscription,
  SubscriptionExtension,
} from "./types";

const STATUS_ORDER: Record<Subscription["status"], number> = {
  active: 0,
  pending: 1,
  expired: 2,
  revoked: 3,
  rejected: 4,
};

export async function getDashboardData(
  userId: string,
): Promise<DashboardSubscription[]> {
  const sb = getSupabaseAdmin();

  const { data: subs, error: subsErr } = await sb
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (subsErr) throw new Error(`subscriptions_fetch_failed: ${subsErr.message}`);
  if (!subs || subs.length === 0) return [];

  const subIds = subs.map((s) => s.id);
  const { data: lics, error: licErr } = await sb
    .from("licenses")
    .select("*")
    .in("subscription_id", subIds);

  if (licErr) throw new Error(`licenses_fetch_failed: ${licErr.message}`);

  // Plan 6: load pending extensions for these subs in one batch.
  const { data: exts, error: extErr } = await sb
    .from("subscription_extensions")
    .select("*")
    .in("subscription_id", subIds)
    .eq("status", "pending");

  if (extErr) throw new Error(`extensions_fetch_failed: ${extErr.message}`);

  const bySub = new Map<number, { live: License | null; demo: License | null }>();
  for (const sub of subs) bySub.set(sub.id, { live: null, demo: null });
  for (const lic of (lics ?? []) as License[]) {
    const slot = bySub.get(lic.subscription_id);
    if (!slot) continue;
    if (lic.intended_account_type === "live") slot.live = lic;
    if (lic.intended_account_type === "demo") slot.demo = lic;
  }

  const extBySub = new Map<number, SubscriptionExtension>();
  for (const e of (exts ?? []) as SubscriptionExtension[]) {
    // Unique-pending-per-source index ensures at most one row per sub.
    extBySub.set(e.subscription_id, e);
  }

  const out: DashboardSubscription[] = subs.map((sub) => ({
    subscription: sub as Subscription,
    liveLicense: bySub.get(sub.id)!.live,
    demoLicense: bySub.get(sub.id)!.demo,
    pendingExtension: extBySub.get(sub.id) ?? null,
  }));

  out.sort((a, b) => {
    const da = STATUS_ORDER[a.subscription.status];
    const db = STATUS_ORDER[b.subscription.status];
    if (da !== db) return da - db;
    return new Date(b.subscription.created_at).getTime() - new Date(a.subscription.created_at).getTime();
  });

  return out;
}

export function groupByProduct(
  items: DashboardSubscription[],
): DashboardProductGroup[] {
  const byProduct = new Map<Product, DashboardSubscription[]>();
  for (const item of items) {
    const code = item.subscription.product;
    const arr = byProduct.get(code);
    if (arr) arr.push(item);
    else byProduct.set(code, [item]);
  }
  const out: DashboardProductGroup[] = [];
  for (const code of PRODUCT_CODES) {
    const subs = byProduct.get(code);
    if (subs && subs.length > 0) out.push({ product: code, subscriptions: subs });
  }
  return out;
}
```

- [ ] **Step 5: Update pre-existing dashboard-data tests**

Open `lib/dashboard-data.test.ts`. Any test that constructs a `DashboardSubscription` literal needs `pendingExtension: null` added. Add it.

- [ ] **Step 6: Run tests**

Run: `pnpm test lib/dashboard-data.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/dashboard-data.ts lib/dashboard-data.test.ts
git commit -m "feat(dashboard): load pending extensions per subscription"
```

---

### Task 11: User UI — Extend dialog + status line + card wiring

**Files:**
- Create: `components/user/extend-dialog.tsx`
- Create: `components/user/extension-status-line.tsx`
- Modify: `components/user/subscription-card.tsx`

- [ ] **Step 1: Create `components/user/extend-dialog.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tierRank } from "@/lib/subscription-state";
import type { LicenseTier } from "@/lib/types";

const TIER_OPTIONS: { value: LicenseTier; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export function ExtendDialog({
  sourceSubscriptionId,
  productDisplay,
  sourceTier,
  disabled = false,
}: {
  sourceSubscriptionId: number;
  productDisplay: string;
  sourceTier: LicenseTier;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<LicenseTier>(sourceTier);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const allowedTiers = useMemo(
    () => TIER_OPTIONS.filter((t) => tierRank[t.value] >= tierRank[sourceTier]),
    [sourceTier],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/extensions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription_id: sourceSubscriptionId,
          requested_tier: tier,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (body.error === "extension_already_pending") {
          setError("You already have a pending extension. Cancel it first from the card.");
        } else {
          setError(body.error ?? "Could not submit extension.");
        }
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>Extend</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend {productDisplay}</DialogTitle>
          <DialogDescription>
            Extend the existing subscription in place. Your slots and licenses are preserved.
            You can keep the same tier or upgrade — downgrades are not allowed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <p className="text-sm font-medium">{productDisplay}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tier">Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as LicenseTier)}>
              <SelectTrigger id="tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedTiers.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit extension"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `components/user/extension-status-line.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatExpiry } from "@/lib/expiry";
import type { SubscriptionExtension } from "@/lib/types";

export function ExtensionStatusLine({
  extension,
}: {
  extension: SubscriptionExtension;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/extensions/${extension.id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(`Could not cancel: ${body.error ?? r.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between rounded-md border border-dashed p-3 text-sm">
      <div className="text-muted-foreground">
        Extension pending — <span className="font-medium">{extension.requested_tier}</span> — submitted {formatExpiry(extension.requested_at)}
      </div>
      <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
        {busy ? "Cancelling…" : "Cancel"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Modify `components/user/subscription-card.tsx`**

Replace the file with:

```tsx
import { Badge } from "@/components/ui/badge";
import { productDisplayName } from "@/lib/products";
import { formatExpiry } from "@/lib/expiry";
import type { DashboardSubscription } from "@/lib/types";
import { SlotCard } from "./slot-card";
import { CancelRequestButton } from "./cancel-request-button";
import { RenewDialog } from "./renew-dialog";
import { ExtendDialog } from "./extend-dialog";
import { ExtensionStatusLine } from "./extension-status-line";

export function SubscriptionCard({
  data,
  compact = false,
}: {
  data: DashboardSubscription;
  compact?: boolean;
}) {
  const sub = data.subscription;
  const productDisplay = productDisplayName(sub.product);
  const isPending = sub.status === "pending";
  const isActive = sub.status === "active";
  const canRenew = sub.status === "expired" || sub.status === "revoked";
  const hasPendingExtension = data.pendingExtension !== null;

  return (
    <div className={compact ? "space-y-3" : "rounded-lg border bg-card p-4"}>
      {compact ? (
        <div className="mb-3 flex justify-end">
          <Badge
            variant={isActive ? "default" : isPending ? "secondary" : "outline"}
            className="whitespace-nowrap"
          >
            {sub.status}
            {` · ${sub.tier}`}
            {sub.expires_at ? ` · expires ${formatExpiry(sub.expires_at)}` : ""}
          </Badge>
        </div>
      ) : (
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">{productDisplay}</h3>
            <p className="text-sm text-muted-foreground">
              {sub.tier}
              {sub.expires_at ? ` — expires ${formatExpiry(sub.expires_at)}` : ""}
            </p>
          </div>
          <Badge variant={isActive ? "default" : isPending ? "secondary" : "outline"}>
            {sub.status}
          </Badge>
        </div>
      )}

      {isPending ? (
        <div className="flex items-center justify-between rounded-md border-dashed border p-3">
          <p className="text-sm text-muted-foreground">
            Awaiting admin approval.
            {sub.notes ? ` Note: ${sub.notes}` : ""}
          </p>
          <CancelRequestButton subscriptionId={sub.id} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SlotCard
            subscriptionId={sub.id}
            intendedType="live"
            productDisplay={productDisplay}
            license={data.liveLicense}
            canClaim={isActive}
          />
          <SlotCard
            subscriptionId={sub.id}
            intendedType="demo"
            productDisplay={productDisplay}
            license={data.demoLicense}
            canClaim={isActive}
          />
        </div>
      )}

      {isActive ? (
        <div className="mt-3 flex justify-end">
          <ExtendDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
            disabled={hasPendingExtension}
          />
        </div>
      ) : null}

      {data.pendingExtension ? (
        <ExtensionStatusLine extension={data.pendingExtension} />
      ) : null}

      {canRenew ? (
        <div className="mt-3 flex justify-end">
          <RenewDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
          />
        </div>
      ) : null}

      {sub.status === "rejected" && sub.rejection_reason ? (
        <p className="mt-3 text-sm text-destructive">Rejected: {sub.rejection_reason}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + run all tests**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/user/extend-dialog.tsx components/user/extension-status-line.tsx components/user/subscription-card.tsx
git commit -m "feat(ui): ExtendDialog + ExtensionStatusLine on dashboard cards"
```

---

### Task 12: Admin UI — pending extensions table on `/admin/requests`

**Files:**
- Create: `components/admin/pending-extensions-table.tsx`
- Modify: `app/admin/requests/page.tsx`

- [ ] **Step 1: Create `components/admin/pending-extensions-table.tsx`**

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RejectExtensionDialog } from "./reject-extension-dialog";

export type PendingExtensionRow = {
  id: number;
  user_email: string;
  user_full_name: string | null;
  product_label: string;
  source_tier: string;
  source_expires_at: string | null;
  requested_tier: string;
  notes: string | null;
  requested_at: string;
};

export function PendingExtensionsTable({ rows }: { rows: PendingExtensionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function approve(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/extensions/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Approve failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Extension approved");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending extensions.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Current</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Submitted</TableHead>
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
            <TableCell>
              <div>{r.source_tier}</div>
              <div className="text-xs text-muted-foreground">
                {r.source_expires_at ? `expires ${new Date(r.source_expires_at).toLocaleDateString()}` : "—"}
              </div>
            </TableCell>
            <TableCell className="font-medium">{r.requested_tier}</TableCell>
            <TableCell>{new Date(r.requested_at).toLocaleString()}</TableCell>
            <TableCell className="max-w-[24ch] truncate">{r.notes ?? "—"}</TableCell>
            <TableCell className="text-right space-x-2">
              <Button size="sm" onClick={() => approve(r.id)} disabled={isPending}>Approve</Button>
              <RejectExtensionDialog extensionId={r.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create `components/admin/reject-extension-dialog.tsx`**

This mirrors `components/admin/reject-request-dialog.tsx`. Copy the same shape but POSTs to `/api/extensions/[id]/reject` and uses field name `rejection_message`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RejectExtensionDialog({ extensionId }: { extensionId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/extensions/${extensionId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rejection_message: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Reject failed: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("Extension rejected");
      setOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Reject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject extension</DialogTitle>
          <DialogDescription>
            Provide a reason. The user will see this message in the rejection email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (1–500 chars)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              minLength={1}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Modify `app/admin/requests/page.tsx`**

Read the existing page first:

```bash
cat app/admin/requests/page.tsx
```

Then add a fetch for pending extensions and mount the table below the existing `<PendingRequestsTable>`. The data shape needed by `PendingExtensionsTable` requires joining `subscription_extensions` with `subscriptions` and `users`. Append after the existing requests fetch:

```ts
import { tierLabel } from "@/lib/users";
import { productDisplayName } from "@/lib/products";
import {
  PendingExtensionsTable,
  type PendingExtensionRow,
} from "@/components/admin/pending-extensions-table";

// inside the page component, after fetching pending requests:
const sb = getSupabaseAdmin();
const { data: rawExtensions } = await sb
  .from("subscription_extensions")
  .select(
    "id, requested_tier, notes, requested_at, " +
      "subscription:subscriptions(product, tier, expires_at, user_id), " +
      "user:users(email, full_name)"
  )
  .eq("status", "pending")
  .order("requested_at", { ascending: true });

const extensionRows: PendingExtensionRow[] = (rawExtensions ?? []).map((r: any) => ({
  id: r.id,
  user_email: r.user?.email ?? "(unknown)",
  user_full_name: r.user?.full_name ?? null,
  product_label: productDisplayName(r.subscription?.product),
  source_tier: tierLabel(r.subscription?.tier),
  source_expires_at: r.subscription?.expires_at ?? null,
  requested_tier: tierLabel(r.requested_tier),
  notes: r.notes,
  requested_at: r.requested_at,
}));

// inside the rendered JSX, after <PendingRequestsTable rows={...} />:
<section className="mt-8">
  <h2 className="mb-2 text-lg font-semibold">Pending extensions</h2>
  <PendingExtensionsTable rows={extensionRows} />
</section>
```

Adapt the literal JSX to match the existing page's structure (add the section in the right place; preserve any `<Suspense>`/server-component wrappers).

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/pending-extensions-table.tsx components/admin/reject-extension-dialog.tsx app/admin/requests/page.tsx
git commit -m "feat(admin): pending extensions table on /admin/requests"
```

---

### Task 13: Patch revoke handler — auto-reject pending extensions

**Files:**
- Modify: `app/api/subscriptions/[id]/revoke/route.ts`

- [ ] **Step 1: Add the auto-reject step**

After the existing `update subscriptions` block (current line 45–55) and before the `targetUser` email lookup, insert:

```ts
import { rejectionCopyFor } from "@/lib/email";
// (add to the imports at the top alongside sendSubscriptionRevokedEmail)

// After the subscriptions update succeeds, auto-reject any pending extensions
// on this source. Idempotent via WHERE status='pending' clause — safe even if
// the cron sweep also fires on the same source.
const { error: extRejectErr } = await sb
  .from("subscription_extensions")
  .update({
    status: "rejected",
    rejection_code: "source_revoked_before_approval",
    rejection_message: rejectionCopyFor("source_revoked_before_approval")!,
  })
  .eq("subscription_id", id)
  .eq("status", "pending");
if (extRejectErr) {
  console.error(
    `[api/subscriptions/${id}/revoke] auto-reject extensions failed:`,
    extRejectErr.message,
  );
  // Don't fail the revoke — admin's primary intent (revoke the subscription)
  // succeeded. Log for follow-up.
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/subscriptions/[id]/revoke/route.ts
git commit -m "feat(api): auto-reject pending extensions on subscription revoke"
```

---

### Task 14: Patch cron expiry script + final integration verification

**Files:**
- Modify: `scripts/expire-subscriptions.ts`

- [ ] **Step 1: Modify the script**

Replace the body of `main()` so the auto-reject step runs after the expire step, scoped to subscriptions that just flipped:

```ts
async function main() {
  const now = new Date().toISOString();

  const { data: rows, error } = await sb
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("status", "active")
    .lte("expires_at", now)
    .select("id");
  if (error) {
    console.error("Update failed:", error.message);
    process.exit(1);
  }
  const expiredIds = (rows ?? []).map((r) => r.id);
  console.log(`Expired ${expiredIds.length} subscription(s).`);

  if (expiredIds.length > 0) {
    // Plan 6: auto-reject pending extensions whose source just expired.
    // Idempotent via status='pending' clause — safe if the revoke handler
    // also fires on any of these.
    const { data: rejected, error: extErr } = await sb
      .from("subscription_extensions")
      .update({
        status: "rejected",
        rejection_code: "source_expired_before_approval",
        rejection_message:
          "Your subscription expired before we could approve your extension. Submit a fresh renewal from your dashboard.",
      })
      .in("subscription_id", expiredIds)
      .eq("status", "pending")
      .select("id");
    if (extErr) {
      console.error("Auto-reject extensions failed:", extErr.message);
    } else {
      console.log(`Auto-rejected ${rejected?.length ?? 0} pending extension(s).`);
    }
  }
}
```

(The script can't import from `lib/email.ts` because the lib uses `@/` path aliases; we duplicate the copy string here. If you've set up tsx with path aliases, swap to the import.)

- [ ] **Step 2: Run the script in dry-run mode (optional)**

Run: `pnpm expire:subs`
Expected: completes without error; reports counts.

- [ ] **Step 3: Run all tests**

Run: `pnpm test && pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 4: Manual integration walk (browser)**

With the dev server running:

```bash
pnpm dev
```

Walk the flow end-to-end:

1. As an admin, create an active subscription for a test user (from `/admin/users` or `/admin/subscriptions/new`).
2. Sign in as the test user. On `/dashboard`, find the active card. **Verify** the **Extend** button appears.
3. Click Extend → choose `yearly` → submit. **Verify** the dialog closes and the card now shows *"Extension pending — yearly — submitted YYYY-MM-DD"* with a Cancel button.
4. Click Cancel. **Verify** the line disappears and Extend re-enables.
5. Submit again. Sign in as admin → `/admin/requests`. **Verify** the *Pending extensions* section shows the row.
6. Click Approve. **Verify** the user's dashboard now shows the new `expires_at`. **Verify** any child licenses on that subscription have the same `expires_at` (check via `/admin/users/[id]` policy form or DB).
7. Submit another extension. From the admin user-detail page, **Revoke** the subscription. **Verify** the pending extension flips to `rejected` with `rejection_code='source_revoked_before_approval'`.
8. Check email transport (mock or SMTP) for the four mail events: submitted, approved, rejected (admin manual), rejected (auto on revoke).

- [ ] **Step 5: Commit**

```bash
git add scripts/expire-subscriptions.ts
git commit -m "feat(scripts): auto-reject pending extensions on cron expiry"
```

---

## Self-review notes

- All 13 spec sections (1–13) map to tasks: §4 + §5 → Tasks 1–3; §5.7 + §8 → Task 4; schemas → Task 5; §6.6 + email → Task 6; §6.1 → Task 7; §6.2 → Task 8; §6.3 + §5.3 → Task 9; §6.4 + dashboard data → Task 10; §6.1 / §6.4 UI → Task 11; admin UI → Task 12; §6.5 → Tasks 13 + 14.
- Edge cases addressed:
  - #1 (forward-only cascade) — Task 2 trigger predicate
  - #2 (auto-reject idempotency) — Tasks 13 + 14 use `WHERE status='pending'`
  - #3 (UI surfaces "pending exists" recovery) — Task 11 ExtendDialog error mapping
  - #4 (transaction guard on source-active) — Task 9 `.eq("status","active")` rowcount check
  - #5 (forward-only expiry) — Task 9 `newExpiresAt > now()` guard with auto-reject path
  - #8 (trigger ordering) — Task 2 fires on `expires_at` only, doesn't collide with Plan 5 status trigger
  - #11 (downgrade enforcement) — Task 4 helpers, Task 5 schema, Task 7 API, Task 9 backstop, Task 11 UI hides invalid tiers
  - #14 (rejection email copy) — Task 6 `rejectionCopyFor` lookup
- No placeholders, no "implement later" steps. Every code-bearing step shows full code.
- Type names consistent across tasks: `SubscriptionExtension`, `RejectionCode`, `EmailKind`, `ExtendSubscriptionRequestInput`.
- Migration files are committed in the EA repo; app-code commits are in this repo. Tasks 1–3 explicitly `cd` into the EA repo.
