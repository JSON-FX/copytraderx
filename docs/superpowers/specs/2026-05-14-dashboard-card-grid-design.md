# Dashboard Card Grid — Design

- **Date:** 2026-05-14
- **Status:** Approved (brainstorm complete)
- **Scope:** Pure frontend refactor of `/dashboard`. No backend, no API, no schema changes.
- **Supersedes:** The slot-per-row table layout in `components/user/dashboard-table.tsx`.

## 1. Problem

The current `/dashboard` table renders **two rows per subscription** (one for the LIVE slot, one for the DEMO slot), plus extra "summary" rows for pending/rejected subs. For users with multiple subscriptions in the same product — common after one or more renewals — the result is hard to scan:

- The same product name (e.g. "CTX Live") repeats across many rows.
- The "↳" continuation glyph on demo rows is unclear.
- Empty slots get full rows showing `— — —`, taking the same vertical weight as filled slots.
- Subscription-level state (Active / Revoked / Expired / Rejected / Pending) and slot-level state (filled / empty, license active / revoked) share one "Status" column with shifting meaning.
- Revoked / expired / rejected subscriptions accumulate inline with active ones. Because `Renew` creates a *new pending sub* without modifying the source (`app/api/subscriptions/renew/route.ts:53-63`), every renew cycle leaves another stale row behind.

The reference account (json.alanano@gmail.com) shows this clearly: Impulse and CTX Live each appear multiple times across active and revoked states.

## 2. Decisions

| Question | Decision |
|---|---|
| Row layout | Replace the table with a **responsive card grid**. One card per subscription. |
| Slot rendering | Slots live **inside** the card body (LIVE then DEMO), not as sibling rows. |
| Subscription grouping | Cards split into two sections: **Current** (active + pending) and **Past subscriptions** (expired + revoked + rejected). |
| Past section default | **Collapsed by default** via `<details>` element. Header shows count: `Past subscriptions (N)`. |
| Past banner | Existing `ExpiredBanner` is repurposed: text becomes "N past subscriptions are available to renew" with a button that opens + scrolls to the past section. Banner suppressed when past section is empty. |
| Renew button | Stays on `revoked` and `expired` past cards. **Not** on `rejected` (backend rejects: `canRenewFrom` returns `not_renewable` for rejected; rejected users must use Request New License). |
| Sorting (Current) | status (active → pending) → product canonical order → `created_at` desc — same as today within scope. |
| Sorting (Past) | `created_at` desc — terminal states don't need status-sort within section. |
| Sub-level status badge | Shown in the card header. Values: `Active`, `No slots claimed`, `Pending`, `Rejected`, `Expired`, `Revoked`. |
| Slot-level status | Inline within the slot row only when it diverges from the sub (e.g., active sub with a revoked license). No separate badge per slot. |
| Extension-pending indicator | Renders as an inline notice between the slots and the action footer of the affected card. Replaces `ExtensionStatusLine`'s table-cell rendering with a card-fit equivalent. |
| Rejected reason | Renders as a red-tinted block in the card body. |
| Backend changes | None. All existing API contracts (`/api/subscriptions/renew`, `/api/extensions/*`, claim/extend/cancel) unchanged. |
| Removed code | `flattenRows`, `SlotRow`/`SummaryRow`/`Row` types, `deriveSlotStatus` helper. Card layout doesn't need slot-row flattening. |

## 3. Non-goals

- No new sub-statuses or schema changes.
- No "dismiss / archive" action on past subs — would risk hiding a renewable item.
- No filter or search controls on the dashboard.
- No pagination — list grows linearly with the user's history.
- No bulk renew.
- No changes to the journal view, extend flow, claim flow, or any admin pages.
- No new responsive breakpoints beyond what `auto-fill / minmax` provides.

## 4. Architecture

### 4.1 Components

```
app/dashboard/page.tsx
└─ <DashboardCardGrid items={…} />          (NEW — replaces <DashboardTable>)
   ├─ partitions items → { current, past }
   ├─ renders <SubscriptionCard> for each current item
   └─ renders <details> wrapping past <SubscriptionCard>s, collapsed by default

components/user/
├─ dashboard-card-grid.tsx                  (NEW)
├─ subscription-card.tsx                    (NEW — renders one card given DashboardSubscription)
├─ subscription-card-slots.tsx              (NEW — the LIVE/DEMO slot block)
├─ extension-status-line.tsx                (KEEP — restyled for card use; same component)
├─ license-key-cell.tsx                     (KEEP — unchanged)
├─ claim-slot-dialog.tsx                    (KEEP — unchanged)
├─ renew-dialog.tsx                         (KEEP — unchanged)
├─ extend-dialog.tsx                        (KEEP — unchanged)
├─ cancel-request-button.tsx                (KEEP — unchanged)
└─ dashboard-table.tsx                      (REMOVED)

components/shared/
└─ expired-banner.tsx                       (MODIFIED — copy + click-to-expand behavior)
```

### 4.2 Data flow

Unchanged: `app/dashboard/page.tsx` still calls `getDashboardData(user.id)` and passes the resulting `DashboardSubscription[]` into the grid component. `DashboardCardGrid` does all partitioning client-side from that array; no extra fetches.

### 4.3 Partitioning

```ts
const current = items.filter(i =>
  i.subscription.status === "active" || i.subscription.status === "pending"
);
const past = items.filter(i =>
  i.subscription.status === "expired"
  || i.subscription.status === "revoked"
  || i.subscription.status === "rejected"
);
```

Sort `current` using the same comparator as today (status → product rank → created_at desc, restricted to {active, pending}). Sort `past` by `created_at desc`.

### 4.4 Layout

Grid container:

```tsx
<div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
  {…}
</div>
```

Each card is a flex column. Header → optional slot list / pending message / rejected reason → optional extension-pending notice → action footer.

## 5. Card anatomy

### 5.1 Header (always)

- Left: EA display name (`productDisplayName(sub.product)`) in semibold; below it, `tier · expires/requested/expired <date>` in muted small text. Date label varies by status:
  - active / empty-active → `expires <formatExpiry(expires_at)>`
  - pending → `requested <formatExpiry(created_at)>`
  - expired / revoked → `expired <formatExpiry(expires_at)>`
  - rejected → `rejected <formatExpiry(updated_at)>` (admin set rejection date)
- Right: sub-level `StatusBadge`. Values map:
  - `active` + ≥1 license → "Active"
  - `active` + 0 licenses → "No slots claimed"
  - `pending` → "Pending"
  - `rejected` → "Rejected"
  - `expired` → "Expired"
  - `revoked` → "Revoked"

### 5.2 Body — depends on sub status

**Active / Expired / Revoked:**
A `<SubscriptionCardSlots>` block with two slot rows (LIVE, DEMO). Each row:
- Slot label (`LIVE` or `DEMO`, uppercase muted)
- MT5 account number (mono) — or `— empty —` muted
- `<LicenseKeyCell>` (chip + copy) — or `—` muted
- Slot primary action (see §6)

If a license on an active sub has `license.status ∈ {revoked, expired}`, render a small inline warning beneath that slot's row: `License revoked` / `License expired`.

**Pending:**
No slot list. Short message: *"Waiting for admin approval. You'll be able to claim a slot once it's approved."*

**Rejected:**
No slot list. Red-tinted block with the `rejection_reason` if present, falling back to *"Request rejected."*

### 5.3 Inline notices (between body and footer)

- **Extension pending** (only on the affected card, when `pendingExtension !== null`): renders `<ExtensionStatusLine>` with card-fit styling (margin, dashed border, amber tint). Internal behavior — DELETE call + router.refresh — unchanged.

### 5.4 Footer — sub-level actions

| Sub status | Footer buttons |
|---|---|
| active | `Extend` (disabled if `pendingExtension !== null`) |
| pending | `Cancel request` (ghost) |
| expired / revoked | `Renew` |
| rejected | — (empty footer, hidden if no actions) |

## 6. Slot action mapping

Same rules as today's `SlotActions`, just rendered inside the slot row instead of in an "Actions" table cell:

| Sub status | License | Slot action |
|---|---|---|
| active | filled + active | `Open journal` (primary) |
| active | filled + revoked/expired | `Open journal` (outline, history-only) |
| active | empty | `Claim slot` (outline) |
| expired / revoked | filled | `Open journal` (outline, history-only) |
| expired / revoked | empty | — |
| pending / rejected | — | (no slots rendered) |

## 7. ExpiredBanner change

`components/shared/expired-banner.tsx`:

- Count source unchanged: number of `expired | revoked` subs (rejected currently excluded; keep that — rejected is a different message context).
- Copy: *"<N> past subscriptions are available to renew."*
- Action: a `<button>` that calls `document.getElementById("past-subscriptions")?.scrollIntoView({behavior:"smooth"})` and toggles the `<details>` open via a controlled `open` state lifted into `DashboardCardGrid`.
- Hidden entirely when `count === 0`.

Implementation detail: since the banner needs to toggle the `<details>`, lift the open/close state into `DashboardCardGrid` (a `"use client"` component) and pass an `onOpenPast` callback into `ExpiredBanner`.

## 8. Empty states

- Zero items total → existing empty hint stays unchanged.
- Zero current, non-zero past → main grid hidden; past section rendered **expanded by default** (otherwise the user lands on a blank page). Banner present.
- Zero past, non-zero current → past section + banner not rendered.

## 9. Responsive behavior

- `< 768px`: 1 column.
- `768-1279px`: 2 columns.
- `≥ 1280px`: 3 columns.

Card internals stack the slot grid (`grid-template-columns: auto 1fr auto auto`) to keep slot label / MT5 / key / action aligned on a single row down to ~340px wide. Below that the slot row wraps the action onto a second line.

## 10. Files touched

**New:**
- `components/user/dashboard-card-grid.tsx`
- `components/user/subscription-card.tsx`
- `components/user/subscription-card-slots.tsx`

**Modified:**
- `app/dashboard/page.tsx` — swap `<DashboardTable>` import for `<DashboardCardGrid>`.
- `components/shared/expired-banner.tsx` — copy + click-to-expand behavior.
- `components/user/extension-status-line.tsx` — restyle for card placement (margin / spacing only; logic unchanged).

**Removed:**
- `components/user/dashboard-table.tsx` (full deletion).

## 11. Risks / open notes

- **License-level revoked indicator** is a new visual element. Confirmed by reading `lib/dashboard-data.ts`: `license.status` is already on each `License` row, so no data work required.
- **No data migration** — purely UI.
- **Tests** — no existing tests for `DashboardTable` were found in the repo. Implementation plan should decide whether to add component tests for `SubscriptionCard` covering each status branch, or to verify visually only. Default recommendation: skip unit tests; verify via dev-server walkthrough across the same test accounts used today (`json.alanano@gmail.com`).

## 12. Rollout

Single PR, single commit (or small commit sequence). No flag. No staged rollout — the change is contained, the data layer is untouched, and a revert is `git revert` of a single PR. Sanity-check on `json.alanano@gmail.com` and one all-active test account before merging.
