# Dashboard Card Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/dashboard` slot-per-row table with a responsive card-per-subscription grid, partitioned into a Current section (active + pending) and a collapsed Past Subscriptions section (revoked + expired + rejected).

**Architecture:** Pure frontend refactor. `<DashboardCardGrid>` (new client component) replaces `<DashboardTable>`. It partitions `DashboardSubscription[]` into two buckets and renders `<SubscriptionCard>` for each, with the past bucket wrapped in a controlled `<details>` element. No data-layer, API, or schema changes.

**Tech Stack:** Next.js 16 (App Router), React (server-side fetched, client-side card grid), Tailwind CSS, shadcn UI components (`Card`, `Badge`, `Button`), `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-05-14-dashboard-card-grid-design.md`

**File map:**

| File | Action | Responsibility |
|---|---|---|
| `components/user/subscription-card-slots.tsx` | Create | Render LIVE + DEMO slot rows for one subscription |
| `components/user/subscription-card.tsx` | Create | Render one full subscription card (header, body, notices, footer) |
| `components/user/dashboard-card-grid.tsx` | Create | Partition items into current/past, render grid + collapsible past section |
| `components/shared/expired-banner.tsx` | Modify | Update copy + add click-to-open-past button |
| `app/dashboard/page.tsx` | Modify | Replace `<DashboardTable>` with `<DashboardCardGrid>` |
| `components/user/dashboard-table.tsx` | Delete | Replaced by the card grid |

---

## Task 1: Build `<SubscriptionCardSlots>`

**Files:**
- Create: `components/user/subscription-card-slots.tsx`

Smallest unit first. Renders the LIVE + DEMO rows of a single subscription. Slot action behavior mirrors today's `SlotActions` in `components/user/dashboard-table.tsx:172-262`.

- [ ] **Step 1: Create the component file**

Write `components/user/subscription-card-slots.tsx`:

```tsx
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LicenseKeyCell } from "./license-key-cell";
import { ClaimSlotDialog } from "./claim-slot-dialog";
import { productDisplayName } from "@/lib/products";
import type {
  DashboardSubscription,
  License,
  SubscriptionStatus,
} from "@/lib/types";

type SlotType = "live" | "demo";

interface SlotRowProps {
  subStatus: SubscriptionStatus;
  subscriptionId: number;
  product: DashboardSubscription["subscription"]["product"];
  slotType: SlotType;
  license: License | null;
}

function slotPrimaryAction({
  subStatus,
  subscriptionId,
  product,
  slotType,
  license,
}: SlotRowProps) {
  // Filled, active slot on an active sub → primary "Open journal".
  if (
    license &&
    license.status === "active" &&
    subStatus === "active"
  ) {
    return (
      <Button asChild size="sm" variant="default">
        <Link href={`/dashboard/licenses/${license.id}`}>Open journal</Link>
      </Button>
    );
  }
  // Filled slot on an active sub but license is revoked/expired:
  // history-only, outline button.
  if (license && subStatus === "active") {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/licenses/${license.id}`}>Open journal</Link>
      </Button>
    );
  }
  // Filled slot on a revoked/expired sub → outline, history-only.
  if (
    license &&
    (subStatus === "revoked" || subStatus === "expired")
  ) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/licenses/${license.id}`}>Open journal</Link>
      </Button>
    );
  }
  // Empty slot, sub still active → Claim.
  if (!license && subStatus === "active") {
    return (
      <ClaimSlotDialog
        subscriptionId={subscriptionId}
        intendedType={slotType}
        productDisplay={productDisplayName(product)}
      />
    );
  }
  // Empty slot on terminal sub → nothing.
  return <span className="text-muted-foreground text-xs">—</span>;
}

function SlotRow(props: SlotRowProps) {
  const { license, slotType, subStatus } = props;
  const isLicenseDegradedOnActiveSub =
    license &&
    subStatus === "active" &&
    license.status !== "active";

  return (
    <div className="border-t border-border/60 px-4 py-2.5 text-sm first:border-t-0">
      <div className="grid grid-cols-[3rem_minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {slotType}
        </span>
        {license ? (
          <span className="truncate font-mono text-sm">{license.mt5_account}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground">— empty —</span>
        )}
        {license ? (
          <LicenseKeyCell licenseKey={license.license_key} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <div className="justify-self-end">{slotPrimaryAction(props)}</div>
      </div>
      {isLicenseDegradedOnActiveSub ? (
        <p className="ml-12 mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          License {license.status} — contact admin if unexpected
        </p>
      ) : null}
    </div>
  );
}

export function SubscriptionCardSlots({
  item,
}: {
  item: DashboardSubscription;
}) {
  const sub = item.subscription;
  return (
    <div>
      <SlotRow
        subStatus={sub.status}
        subscriptionId={sub.id}
        product={sub.product}
        slotType="live"
        license={item.liveLicense}
      />
      <SlotRow
        subStatus={sub.status}
        subscriptionId={sub.id}
        product={sub.product}
        slotType="demo"
        license={item.demoLicense}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 3: Commit**

```bash
git add components/user/subscription-card-slots.tsx
git commit -m "feat(dashboard): add SubscriptionCardSlots component"
```

---

## Task 2: Build `<SubscriptionCard>`

**Files:**
- Create: `components/user/subscription-card.tsx`
- Reads: `components/user/extension-status-line.tsx` (used as-is)

One card per `DashboardSubscription`. Header + body (slots / pending message / rejected reason) + optional extension notice + footer.

- [ ] **Step 1: Create the component file**

Write `components/user/subscription-card.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { productDisplayName } from "@/lib/products";
import { formatExpiry } from "@/lib/expiry";
import { SubscriptionCardSlots } from "./subscription-card-slots";
import { ExtensionStatusLine } from "./extension-status-line";
import { RenewDialog } from "./renew-dialog";
import { ExtendDialog } from "./extend-dialog";
import { CancelRequestButton } from "./cancel-request-button";
import type { DashboardSubscription } from "@/lib/types";

type Mode = "current" | "past";

type HeaderStatus =
  | "active"
  | "no-slots"
  | "pending"
  | "rejected"
  | "expired"
  | "revoked";

function deriveHeaderStatus(item: DashboardSubscription): HeaderStatus {
  const sub = item.subscription;
  if (sub.status === "active") {
    return item.liveLicense || item.demoLicense ? "active" : "no-slots";
  }
  return sub.status;
}

function headerStatusLabel(s: HeaderStatus): string {
  switch (s) {
    case "active":
      return "Active";
    case "no-slots":
      return "No slots claimed";
    case "pending":
      return "Pending";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
  }
}

function headerStatusVariant(s: HeaderStatus):
  | "default"
  | "secondary"
  | "outline"
  | "destructive" {
  if (s === "active") return "default";
  if (s === "pending") return "secondary";
  if (s === "rejected") return "destructive";
  return "outline";
}

function headerDateLine(item: DashboardSubscription): string {
  const sub = item.subscription;
  const tier = sub.tier; // monthly | quarterly | yearly
  switch (sub.status) {
    case "active":
      return `${tier} · expires ${formatExpiry(sub.expires_at)}`;
    case "pending":
      return `${tier} · requested ${formatExpiry(sub.requested_at)}`;
    case "expired":
      return `${tier} · expired ${formatExpiry(sub.expires_at)}`;
    case "revoked":
      return `${tier} · expired ${formatExpiry(sub.expires_at)}`;
    case "rejected":
      return `${tier} · requested ${formatExpiry(sub.requested_at)}`;
  }
}

export function SubscriptionCard({
  item,
  mode,
}: {
  item: DashboardSubscription;
  mode: Mode;
}) {
  const sub = item.subscription;
  const headerStatus = deriveHeaderStatus(item);
  const productDisplay = productDisplayName(sub.product);
  const showSlots =
    sub.status === "active" ||
    sub.status === "revoked" ||
    sub.status === "expired";

  return (
    <Card
      size="sm"
      className={mode === "past" ? "bg-muted/30" : undefined}
      data-status={sub.status}
    >
      <CardHeader className="border-b pb-3">
        <CardTitle>{productDisplay}</CardTitle>
        <CardDescription className="capitalize">
          {headerDateLine(item)}
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Badge variant={headerStatusVariant(headerStatus)}>
            {headerStatusLabel(headerStatus)}
          </Badge>
        </div>
      </CardHeader>

      {showSlots ? (
        <SubscriptionCardSlots item={item} />
      ) : sub.status === "pending" ? (
        <CardContent className="text-xs/relaxed text-muted-foreground">
          Waiting for admin approval. You&apos;ll be able to claim a slot once
          it&apos;s approved.
        </CardContent>
      ) : sub.status === "rejected" ? (
        <CardContent>
          <div className="rounded-none border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {sub.rejection_reason
              ? `Rejected: ${sub.rejection_reason}`
              : "Request rejected."}
          </div>
        </CardContent>
      ) : null}

      {item.pendingExtension ? (
        <div className="px-4">
          <ExtensionStatusLine extension={item.pendingExtension} />
        </div>
      ) : null}

      <CardFooter className="justify-end gap-2 bg-muted/30">
        {sub.status === "active" ? (
          <ExtendDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
            disabled={item.pendingExtension !== null}
          />
        ) : null}
        {sub.status === "pending" ? (
          <CancelRequestButton subscriptionId={sub.id} />
        ) : null}
        {sub.status === "expired" || sub.status === "revoked" ? (
          <RenewDialog
            sourceSubscriptionId={sub.id}
            productDisplay={productDisplay}
            sourceTier={sub.tier}
          />
        ) : null}
        {sub.status === "rejected" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : null}
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/user/subscription-card.tsx
git commit -m "feat(dashboard): add SubscriptionCard component"
```

---

## Task 3: Build `<DashboardCardGrid>`

**Files:**
- Create: `components/user/dashboard-card-grid.tsx`

Client component. Partitions items, sorts each bucket, renders the grid plus a controlled `<details>` for the Past section. Owns the open/close state used by `ExpiredBanner`.

- [ ] **Step 1: Create the component file**

Write `components/user/dashboard-card-grid.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRODUCT_CODES } from "@/lib/products";
import { SubscriptionCard } from "./subscription-card";
import { ExpiredBanner } from "@/components/shared/expired-banner";
import type {
  DashboardSubscription,
  SubscriptionStatus,
} from "@/lib/types";

const CURRENT_STATUSES: SubscriptionStatus[] = ["active", "pending"];
const PAST_STATUSES: SubscriptionStatus[] = ["expired", "revoked", "rejected"];

const currentStatusRank: Record<"active" | "pending", number> = {
  active: 0,
  pending: 1,
};

function sortCurrent(items: DashboardSubscription[]): DashboardSubscription[] {
  const productRank = new Map<string, number>(
    PRODUCT_CODES.map((p, i) => [p, i]),
  );
  return [...items].sort((a, b) => {
    const sa =
      currentStatusRank[a.subscription.status as "active" | "pending"] ?? 99;
    const sb =
      currentStatusRank[b.subscription.status as "active" | "pending"] ?? 99;
    if (sa !== sb) return sa - sb;
    const pa = productRank.get(a.subscription.product) ?? 99;
    const pb = productRank.get(b.subscription.product) ?? 99;
    if (pa !== pb) return pa - pb;
    return (
      new Date(b.subscription.created_at).getTime() -
      new Date(a.subscription.created_at).getTime()
    );
  });
}

function sortPast(items: DashboardSubscription[]): DashboardSubscription[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.subscription.created_at).getTime() -
      new Date(a.subscription.created_at).getTime(),
  );
}

export function DashboardCardGrid({
  items,
}: {
  items: DashboardSubscription[];
}) {
  const { current, past, renewableCount } = useMemo(() => {
    const cur: DashboardSubscription[] = [];
    const pst: DashboardSubscription[] = [];
    for (const item of items) {
      if (CURRENT_STATUSES.includes(item.subscription.status)) {
        cur.push(item);
      } else if (PAST_STATUSES.includes(item.subscription.status)) {
        pst.push(item);
      }
    }
    const renewable = pst.filter(
      (i) =>
        i.subscription.status === "expired" ||
        i.subscription.status === "revoked",
    ).length;
    return {
      current: sortCurrent(cur),
      past: sortPast(pst),
      renewableCount: renewable,
    };
  }, [items]);

  // When current is empty but past is non-empty, expand by default so the
  // user doesn't land on a visually empty page.
  const [pastOpen, setPastOpen] = useState(
    current.length === 0 && past.length > 0,
  );
  const pastRef = useRef<HTMLDetailsElement | null>(null);

  function openPastFromBanner() {
    setPastOpen(true);
    requestAnimationFrame(() => {
      pastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-6">
      {renewableCount > 0 ? (
        <ExpiredBanner
          count={renewableCount}
          onOpenPast={openPastFromBanner}
        />
      ) : null}

      {current.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {current.map((item) => (
            <SubscriptionCard
              key={item.subscription.id}
              item={item}
              mode="current"
            />
          ))}
        </div>
      ) : past.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          No active subscriptions.
        </p>
      ) : null}

      {past.length > 0 ? (
        <details
          ref={pastRef}
          open={pastOpen}
          onToggle={(e) => setPastOpen(e.currentTarget.open)}
          id="past-subscriptions"
          className="group"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 py-2 text-sm font-semibold text-foreground/80 hover:text-foreground">
            <span>Past subscriptions</span>
            <span className="inline-flex h-5 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground/70">
              {past.length}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Revoked, expired, or rejected. You can still renew expired or
            revoked subs, or re-open the journal of historic licenses.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {past.map((item) => (
              <SubscriptionCard
                key={item.subscription.id}
                item={item}
                mode="past"
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS. (`ExpiredBanner` will error about the new `onOpenPast` prop — that's expected and fixed in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add components/user/dashboard-card-grid.tsx
git commit -m "feat(dashboard): add DashboardCardGrid with collapsible Past section"
```

---

## Task 4: Update `<ExpiredBanner>` with click-to-expand

**Files:**
- Modify: `components/shared/expired-banner.tsx`

Add `onOpenPast` prop, change copy from "Use the Renew button…" to point at the Past section, and render a button that calls the callback.

- [ ] **Step 1: Rewrite the file**

Replace the contents of `components/shared/expired-banner.tsx` with:

```tsx
"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExpiredBanner({
  count,
  onOpenPast,
}: {
  count: number;
  onOpenPast?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-yellow-300/60 bg-yellow-50 p-3 text-yellow-900 dark:border-yellow-700/60 dark:bg-yellow-950/40 dark:text-yellow-200">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm">
          {count} past subscription{count === 1 ? "" : "s"} available to renew.
        </p>
      </div>
      {onOpenPast ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenPast}
        >
          View past subscriptions
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify no other callers break**

Run: `grep -rn "ExpiredBanner" --include="*.tsx" --include="*.ts" app components`
Expected: only two hits — the new export in `components/shared/expired-banner.tsx` and the import inside `components/user/dashboard-card-grid.tsx`. The previous direct usage in `app/dashboard/page.tsx` is removed in Task 5; that call site never passed `onOpenPast`, and the new prop is optional, so any intermediate state still type-checks.

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/shared/expired-banner.tsx
git commit -m "feat(banner): expired banner toggles Past Subscriptions section"
```

---

## Task 5: Wire `app/dashboard/page.tsx` and delete the old table

**Files:**
- Modify: `app/dashboard/page.tsx`
- Delete: `components/user/dashboard-table.tsx`

The page becomes thinner — the banner moves *inside* `<DashboardCardGrid>` (because the grid owns the past-open state), so `page.tsx` only needs to pass `items`.

- [ ] **Step 1: Rewrite `app/dashboard/page.tsx`**

Replace the contents with:

```tsx
import { redirect } from "next/navigation";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardCardGrid } from "@/components/user/dashboard-card-grid";
import { RequestLicenseDialog } from "@/components/user/request-license-dialog";

export default async function DashboardPage() {
  const sb = await getSupabaseSSR();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const items = await getDashboardData(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My subscriptions</h1>
        <RequestLicenseDialog />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any subscriptions yet. Click &quot;Request New License&quot; to get started, or contact your admin.
          </p>
        </div>
      ) : (
        <DashboardCardGrid items={items} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old table component**

Run: `git rm components/user/dashboard-table.tsx`
Expected: file removed; no remaining imports (verified in next step).

- [ ] **Step 3: Verify no stale imports**

Run: `grep -rn "dashboard-table\|DashboardTable" --include="*.ts" --include="*.tsx" app components lib`
Expected: zero hits.

- [ ] **Step 4: Type-check + build**

Run: `pnpm tsc --noEmit`
Expected: PASS.

Run: `pnpm next build` (optional but recommended on this task — confirms the App Router page assembles cleanly).
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx components/user/dashboard-table.tsx
git commit -m "feat(dashboard): swap subscriptions table for card grid"
```

---

## Task 6: Manual verification

**Files:** none modified — this task is verification only.

The spec defers test coverage to manual visual walkthrough (`docs/superpowers/specs/2026-05-14-dashboard-card-grid-design.md` §11). Verify every card state on the dev server before declaring done.

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`
Open: `http://copytraderx.lan/dashboard` (or `http://localhost:3000/dashboard` if you don't use the local hosts alias).

- [ ] **Step 2: Sign in as the reference test user**

Sign in as `json.alanano@gmail.com` (the account in the bug report — known to have multiple Impulse and CTX Live subscriptions across active, revoked, and empty states).

- [ ] **Step 3: Verify the Current section**

Confirm visually:
- Each subscription is one card (not two rows).
- Product name appears in the header, not repeated per slot.
- Status badges in the header read: `Active`, `No slots claimed`, or `Pending` for current subs.
- Filled slot rows show MT5 account + license key chip + "Open journal" button.
- Empty slot rows show "— empty —" + "Claim slot" button on active subs.
- An active sub with a pending extension shows the amber `ExtensionStatusLine` notice above the footer, with its Cancel button working.

- [ ] **Step 4: Verify the Past section**

Confirm visually:
- A `Past subscriptions (N)` divider is rendered below the main grid, **collapsed** by default.
- Clicking the divider expands it; the chevron rotates.
- The yellow banner at the top reads "<N> past subscriptions available to renew."
- Clicking "View past subscriptions" in the banner expands the section AND smooth-scrolls it into view.
- Inside the past section: revoked / expired cards show a `Renew` button in the footer; rejected cards show no Renew but display the rejection reason in a red block.
- Past cards have a slightly muted background.

- [ ] **Step 5: Verify the renew round-trip**

Click `Renew` on a revoked card. Confirm the dialog opens, submits, and `router.refresh()` results in:
- A new "Pending" card appearing at the top of the Current section.
- The original revoked card still present in the Past section.

- [ ] **Step 6: Verify empty edge cases**

If feasible, test or visually inspect:
- A test account with zero subscriptions → existing "no subscriptions" hint renders, no banner, no Past section.
- A test account with **only past** subscriptions → main grid replaced with "No active subscriptions.", Past section expanded by default, banner visible.

- [ ] **Step 7: Verify responsive layout**

Resize the browser:
- ≥ 1280px: 3 columns.
- 768–1279px: 2 columns.
- < 768px: 1 column. Cards stay readable; slot rows wrap action button when too narrow.

- [ ] **Step 8: Final type-check + lint**

Run: `pnpm tsc --noEmit`
Run: `pnpm lint` (if configured)
Expected: both PASS.

- [ ] **Step 9: Commit only if anything was tweaked**

If the verification surfaced visual issues (e.g., spacing, overflow, alignment) and you adjusted styling, commit those fixes:

```bash
git add components/user/
git commit -m "fix(dashboard): visual polish from manual verification"
```

If no changes were needed, skip this step.

---

## Self-review (run before handing off)

- **Spec coverage:**
  - Architecture / components (§4) → Tasks 1, 2, 3, 5.
  - Card anatomy / states (§5) → Tasks 2 (header + body) and 1 (slots).
  - Slot action mapping (§6) → Task 1 (`slotPrimaryAction`).
  - ExpiredBanner change (§7) → Task 4.
  - Empty states (§8) → Task 3 (`current.length === 0` branch, default `pastOpen`) + Task 5 (`items.length === 0` page-level branch).
  - Responsive behavior (§9) → Task 3 (`md:grid-cols-2 xl:grid-cols-3`) + Task 6 step 7 verification.
  - File touches (§10) → Tasks 1, 2, 3, 4, 5 cover exactly the listed files.
- **Placeholders:** none — every code block is complete.
- **Type consistency:** `DashboardSubscription`, `SubscriptionStatus`, and component prop shapes are imported from `@/lib/types` and used uniformly. `SubscriptionCard` takes `{ item, mode }` and is called with that exact shape in Task 3. `ExpiredBanner` takes `{ count, onOpenPast? }` and is called with both props in Task 3. `SubscriptionCardSlots` takes `{ item }` and is invoked with that shape in Task 2.
