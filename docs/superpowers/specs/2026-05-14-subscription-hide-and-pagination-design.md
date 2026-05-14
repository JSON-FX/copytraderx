# Subscription Hide + Dashboard Pagination — Design

- **Date:** 2026-05-14
- **Status:** Approved (brainstorm complete)
- **Scope:** Backend (schema migration + API) + frontend (`/dashboard` + admin subscription views).
- **Builds on:** `2026-05-14-dashboard-card-grid-design.md`, `2026-05-14-dashboard-filter-toolbar-design.md`.

## 1. Problem

Two related dashboard improvements:

1. **Past clutter.** Users accumulate revoked / expired / rejected subscriptions over time. Today they all sit in the collapsible Past section with no way to remove individual entries. A user with many past subs across multiple products can't curate the view.
2. **Page overflow.** The card grid renders all matching items at once. For a user with 20+ subscriptions across products, scrolling the page becomes unwieldy.

This spec adds a per-subscription **Hide** action (soft delete, user-owned) and **pagination** (6 cards per page) on both the main grid and the Past section.

## 2. Decisions

| Question | Decision |
|---|---|
| Soft or hard delete? | **Soft delete.** Add nullable `hidden_at timestamptz` column on `subscriptions`. License keys stay unique; admin retains full audit trail; reversible. |
| Scope of hideable statuses | All three past statuses: `expired`, `revoked`, `rejected`. Active and pending subs are not hideable. |
| Can a user unhide? | Yes, via a `Show H hidden` toggle inside the Past section. |
| Banner count | Excludes hidden subs from `renewableCount`. If user hides their only revoked sub, the yellow "N past subscriptions available to renew" banner disappears. |
| Admin visibility | Admin sees every row regardless of `hidden_at`. Rows hidden by the user get a small inline indicator (`EyeOff` icon + tooltip "Hidden by user · <relative date>"). No new tabs or filters on the admin side. |
| Hidden + filter toolbar | Hidden subs do **not** appear in the main grid even when the Status filter includes "Past." The Past section's `Show H hidden` toggle is the only path to surface them. Rationale: hidden = "out of sight," separate from filter narrowing. |
| Cards per page | `CARDS_PER_PAGE = 6`. |
| Pagination scope | Both main grid and Past section paginate independently. |
| Pagination controls | Compact `← Prev   Page X of N   Next →` row centered below each paginated grid. Hidden entirely when `totalPages <= 1`. |
| Pagination persistence | Not persisted. Filter and "Show hidden" state stay in localStorage; pagination resets per session. |
| Page clamping | Current page clamps to `[1, totalPages]` on every render — no explicit reset-to-1 on filter change. |
| Status transitions while hidden | `hidden_at` is preserved if the sub status changes (e.g., admin un-revokes back to active — theoretical, not in current state machine). Dashboard ignores `hidden_at` for non-past statuses, so active/pending always render even if a stale `hidden_at` is set. |
| Confirmation on Hide | No modal. Show a `toast.success("Hidden. Click 'Show hidden' to bring it back.")` after the API call returns ok. |
| Confirmation on Unhide | No toast. Card reappears in place. |

## 3. Non-goals

- Hard delete from the user dashboard (the existing `/api/subscriptions/[id]` DELETE stays scoped to `pending` only, used by Cancel-request).
- Admin "force-hide" or "unhide on user's behalf."
- Per-license hiding (sub-level only — licenses inherit visibility from their parent sub).
- Auto-archive after N days.
- Bulk hide / unhide.
- Pagination URL parameters or share links.
- New "Hidden" status group in the filter toolbar.
- Cross-device sync of pagination state.
- Schema changes to `licenses`.

## 4. Architecture

### 4.1 Data model

One SQL migration:

```sql
alter table public.subscriptions
  add column hidden_at timestamptz;

create index idx_subscriptions_user_visible
  on public.subscriptions(user_id)
  where hidden_at is null;

comment on column public.subscriptions.hidden_at is
  'When set, the user has hidden this subscription from their dashboard. Null = visible. Admin sees regardless. Only respected by client when status is in (expired, revoked, rejected).';
```

- Nullable, no default → existing rows keep visibility (`hidden_at = null`).
- Partial index covers the hot-path "user dashboard query" since most rows are visible.
- Non-destructive migration.

### 4.2 API

**`POST /api/subscriptions/[id]/hide`**

Sets `hidden_at = now()`. Guards:
- Authenticated user owns the subscription (`user_id = auth.uid()`).
- `sub.status ∈ {expired, revoked, rejected}`. Otherwise → 409 `not_hideable`.
- If `hidden_at` already non-null → idempotent 200 with the unchanged row.

Response: `{ subscription }` (full row including the new `hidden_at`).

**`DELETE /api/subscriptions/[id]/hide`**

Sets `hidden_at = null`. Guards:
- Authenticated user owns the subscription.
- No status check — unhiding always works.
- Already null → idempotent 200.

Response: `{ subscription }`.

The existing `DELETE /api/subscriptions/[id]` (hard delete, gated to `pending`) is **untouched**.

### 4.3 Data layer

`lib/dashboard-data.ts:getDashboardData(userId)`:
- Continues to fetch ALL subs for the user (no DB-level filter on `hidden_at`).
- The projection result `DashboardSubscription` now carries `hidden_at` through its `subscription` field.

`lib/types.ts`:
- Add `hidden_at: string | null` to the `Subscription` interface.

`lib/subscription-state.ts`:
- New guard:
  ```ts
  export function canHide(s: { status: SubscriptionStatus; hidden_at: string | null }): GuardResult {
    if (s.hidden_at !== null) return { ok: false, reason: "already_hidden" };
    if (s.status === "expired" || s.status === "revoked" || s.status === "rejected") return { ok: true };
    return { ok: false, reason: "not_hideable" };
  }
  ```

### 4.4 Filter integration

`applyFilters` in `lib/dashboard-filters.ts` does **not** know about `hidden_at`. Hidden filtering happens one layer up in `DashboardCardGrid`:

1. Partition `items` into visible (`hidden_at === null`) and hidden (`hidden_at !== null`).
2. Pass only `visible` through `applyFilters` → `sortItems` for the main grid.
3. Past section uses the existing `pastUnfiltered` logic, but split into `pastVisible` (always rendered when section open) and `pastHidden` (rendered only when `Show hidden` toggle is on).

The Status filter's "include Past" branch operates on `visible` only. Hidden subs never enter the main grid through filtering.

## 5. User dashboard UI

### 5.1 Card footer

`components/user/subscription-card.tsx` footer additions:

- For past statuses with `hidden_at === null`: render a `Hide` ghost button alongside `Renew` (or alone, if status is rejected).
- For past statuses with `hidden_at !== null`: render an `Unhide` ghost button alongside the existing actions.

Click handlers call the new API endpoints, then `router.refresh()`. Optimistic update is out of scope — the refresh latency is acceptable.

### 5.2 Past section header

`components/user/dashboard-card-grid.tsx`:

Current header: `Past subscriptions (N) ▾` with chevron.

New header layout:
```
Past subscriptions (N)  ·  Show H hidden  ▾
```

- `Show H hidden` is a small inline `<button>` (text-only, muted). Visible only when `H > 0`.
- Clicking it toggles a transient state `showHiddenPast: boolean` (default false). State is **not** persisted to localStorage — refreshing the page collapses the hidden view back.
- When on, the toggle text becomes `Hide H hidden` and the hidden cards render below the visible past cards in the same grid (slightly more muted styling via additional opacity / background).

### 5.3 Banner

`ExpiredBanner` now receives a `renewableCount` that excludes hidden subs. The `DashboardCardGrid` computes:

```ts
const renewableCount = pastUnfiltered
  .filter((i) => i.subscription.hidden_at === null)
  .filter((i) => i.subscription.status === "expired" || i.subscription.status === "revoked")
  .length;
```

### 5.4 Toast

After a successful `POST /hide`, fire `toast.success("Hidden. Click 'Show hidden' to bring it back.")`. After unhide, no toast — the card reappearing is feedback enough.

## 6. Admin UI

`/admin/requests` and any other admin page that renders subscription rows (`/admin/licenses`, the subscription list inside a user detail page if present) get one change:

- For rows with `hidden_at !== null`, render a small `EyeOff` lucide icon (size `h-3 w-3`) inline with the row title. Wrap in a shadcn `Tooltip` whose content reads: `Hidden by user · <relative date>` (e.g., "Hidden by user · 3 days ago"). Use `date-fns`'s `formatDistanceToNow` for the relative date.
- No filter / tab change. Admin sees the row in the normal list, with the indicator as decoration.
- Sorting / pagination on admin pages is untouched.

If admin pages already render multiple list views, the indicator goes wherever the subscription "title" cell lives — one small addition per row template.

## 7. Pagination

### 7.1 Constants

In `lib/dashboard-filters.ts` (the shared client-side dashboard logic module):

```ts
export const CARDS_PER_PAGE = 6;
```

### 7.2 State

`DashboardCardGrid` owns two new client-state counters:

```ts
const [mainPage, setMainPage] = useState(1);
const [pastPage, setPastPage] = useState(1);
```

Neither is persisted to localStorage. Pagination is per-session view state.

### 7.3 Computation

Every render:

```ts
const mainTotalPages = Math.max(1, Math.ceil(sortedMain.length / CARDS_PER_PAGE));
const mainCurrentPage = Math.min(mainPage, mainTotalPages);
const mainSlice = sortedMain.slice(
  (mainCurrentPage - 1) * CARDS_PER_PAGE,
  mainCurrentPage * CARDS_PER_PAGE,
);
```

Clamping at render time means a filter that narrows results from page 3 to 1 page naturally lands the user on page 1 — no explicit reset effect needed.

Past section computes its slice the same way against the `pastVisible + (showHiddenPast ? pastHidden : [])` array.

### 7.4 Control component

New file `components/user/dashboard-pagination.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2 text-sm text-muted-foreground">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Prev
      </Button>
      <span>
        Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
```

### 7.5 Placement

- Main grid: `<DashboardPagination>` renders directly below the main card grid.
- Past section: `<DashboardPagination>` renders inside the `<details>` block, after the past card grid (and below the hidden-card grid when `showHiddenPast` is on).

## 8. Edge cases

- **Hide an already-hidden sub** → idempotent 200, no toast on the client (skip the toast).
- **Unhide an already-visible sub** → idempotent 200, no UI change.
- **Status transitions while hidden** (admin un-revokes): `hidden_at` persists. The dashboard renders the sub regardless of `hidden_at` because it's no longer in a hideable status. If admin later re-revokes, the sub jumps back into the Past section's hidden bucket. Conservative: server never auto-clears `hidden_at`.
- **Renew a hidden sub** → the `Renew` button still exists on hidden cards inside the "Show hidden" view, behavior unchanged. The new pending sub appears in the main grid (visible by default).
- **Filter narrows results below current page** → page clamps to the new last page.
- **All past subs hidden + Past section empty** → the section header collapses to `Past subscriptions (0) · Show H hidden`, which is awkward. Refine: when the visible past count is 0 but `H > 0`, default-expand the section AND default `showHiddenPast = true` on initial mount. (Mirrors the "current empty → past expanded" rule from the prior dashboard design.)
- **Race condition**: user hides on tab A while tab B is open on the same dashboard. Tab B sees the stale `hidden_at = null` until `router.refresh()`. Acceptable — single-user concurrent tabs are rare.
- **Hidden sub appears in admin export / CSV (if any)**: out of scope — admin export, if it exists, continues to include everything; that's correct behavior.

## 9. Files touched

**Migration (new):**
- A new `*_subscriptions_hidden_at.sql` migration file in whichever folder this project's Supabase migrations live (the `copytraderx-license` repo doesn't host the migrations directly — they live in the sibling Supabase project, e.g. `~/Documents/development/EA/JSONFX-IMPULSE/supabase/migrations/`, as referenced by other plans like `2026-05-06-roles-subscriptions-schema.md`). Implementation plan must confirm the exact path before writing the file.

**Backend (new + modified):**
- `app/api/subscriptions/[id]/hide/route.ts` — new, exports `POST` and `DELETE` handlers.
- `lib/dashboard-data.ts` — propagate `hidden_at` in the `DashboardSubscription` projection (no query filter change).
- `lib/types.ts` — add `hidden_at: string | null` to `Subscription`.
- `lib/subscription-state.ts` — add `canHide` guard.

**Frontend — user dashboard:**
- `components/user/subscription-card.tsx` — render `Hide` / `Unhide` button in the footer when applicable.
- `components/user/dashboard-card-grid.tsx` — partition visible vs hidden, "Show hidden" toggle, pagination state + slicing, render `<DashboardPagination>` in both places. Update `renewableCount` to exclude hidden.
- `components/user/dashboard-pagination.tsx` — new component (full code in §7.4).
- `lib/dashboard-filters.ts` — add `CARDS_PER_PAGE = 6` constant.

**Frontend — admin:**
Pages that currently render subscription rows (confirmed via `grep "subscriptions" app/admin/ --include="*.tsx"`):
- `app/admin/requests/page.tsx` — the requests / pending-subscriptions list. Primary location for the indicator.
- `app/admin/users/[id]/page.tsx` — user detail page that lists that user's subscriptions.
- `app/admin/licenses/[id]/journal/page.tsx` and `app/admin/licenses/new/page.tsx` — these reference subscriptions in passing for license context; the `EyeOff` indicator only needs to appear where a sub row is the primary visible entity (the first two paths). Implementation plan should confirm.

Add the `EyeOff` indicator to subscription rows in those pages.

## 10. Rollout

Single feature branch off `main`. Single PR. Migration ships in the same PR (admin runs `supabase db push` before merging the code, per existing project workflow). No flag. Revert path: `git revert` of the PR, then a follow-up migration to drop the `hidden_at` column if necessary.

Manual verification on the reference test account (`json.alanano@gmail.com`) before merge:
- Hide a revoked sub → card disappears, toast appears, banner count drops.
- Show hidden → card reappears with `Unhide` button. Click → returns to default view.
- Hidden sub doesn't appear in the main grid when "Past" is added to the Status filter.
- Admin view still shows the row with the `EyeOff` indicator.
- Force a page count > 1 (low CARDS_PER_PAGE on the test account or temporarily lower the constant) and verify Prev/Next + clamp behavior.

## 11. Risks / open notes

- **Migration coordination**: code shipping before `supabase db push` runs will reference a column that doesn't exist → 500s on the dashboard. Standard project workflow: migration runs first, then code. Plan should call this out as a deploy step.
- **Index value**: the partial index `idx_subscriptions_user_visible` is light; current dashboard queries don't filter on `hidden_at` server-side, so the index is mostly future-proofing. Acceptable.
- **No tests for the hide round-trip API**: existing project pattern relies on manual verification for these flows. If TDD coverage is desired in the implementation plan, jest tests for `canHide` in `lib/subscription-state.test.ts` are cheap to add (~10 lines, follow the existing `canCancel` test pattern).
