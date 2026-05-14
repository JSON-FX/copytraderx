# Dashboard Filter Toolbar — Design

- **Date:** 2026-05-14
- **Status:** Approved (brainstorm complete)
- **Scope:** Pure frontend feature on `/dashboard`. Builds on `2026-05-14-dashboard-card-grid-design.md`. No backend, no API, no schema changes.
- **Supersedes:** N/A. Extends `DashboardCardGrid`.

## 1. Problem

The dashboard now renders subscriptions as cards in a Current/Past partition. As a user accumulates subscriptions across products and renewal cycles, the flat grid becomes harder to slice:

- They may want to focus on a single product (e.g., only CTX Live).
- They may want to find subs that need attention (empty slots to claim).
- They may want to see what's expiring soonest, regardless of product.
- They may want to pull past subs into the main grid for cross-cutting views.

Today, all of this is fixed: status partition is hardcoded, sort is hardcoded, and the past section is collapsed-only.

## 2. Decisions

| Question | Decision |
|---|---|
| Filter placement | **Inline toolbar above the card grid**, always visible. Four chips, one per dimension. |
| Product filter | **Multi-select popover** with one checkbox per product the user has ≥1 sub for. Default: all checked. Each row shows a count: `CTX Live (3)`. |
| Status filter | **Multi-select popover**. Options: Active, Pending, Past (Past = revoked + expired + rejected combined). Default: Active + Pending checked, Past unchecked. |
| Slot filter | **Single-select dropdown**. Options: Any (default) · Has empty slot · All slots filled. |
| Sort | **Single-select dropdown**. Options: Status (active first → product → created_at desc) · Expires soonest (`expires_at` asc, nulls last) · Recently created (`created_at` desc). Default: Status. |
| Chip label | Reflects current selection: `All products` / `CTX Live` / `2 products` / `Product: 2 selected`. Same pattern for Status. Solid fill / colored dot when the chip deviates from default. |
| Clear all | A `× Clear all` link appears to the right of the toolbar only when any chip differs from default. Resets to defaults. |
| Past section coexistence | The collapsible Past section **only renders when the Status filter is at its default** (Active + Pending checked, Past unchecked). Once the user toggles "Past" on in the filter, past cards merge into the main grid (sorted alongside current cards) and the separate Past section is hidden. Once they uncheck "Past" again, the section returns. |
| Banner | The existing "N past subscriptions available to renew" banner follows the Past section: visible only when the Past section is rendered. When Past is filter-controlled, the banner hides. |
| Persistence | Filter state stored in `localStorage` under key `dashboard.filters.v1`. Survives reload, not cross-device. Read on first client render. |
| URL sync | Not implemented. The dashboard isn't shareable and URL clutter outweighs the benefit. |
| Empty results | When filters match zero cards, replace the grid with a small inline note: *"No subscriptions match these filters."* with a `Clear filters` button. |
| Reduce-motion | Popover/Select animations respect the user's `prefers-reduced-motion`. Radix primitives do this by default. |

## 3. Non-goals

- Free-text search.
- Saved filter presets / named views.
- Filter state in the URL.
- "More like this" filter shortcuts on individual cards.
- Filter state synced across devices.
- New sub-statuses or schema changes.

## 4. Architecture

### 4.1 Components

```
components/user/
├─ dashboard-card-grid.tsx              (MODIFIED — owns filter state, renders toolbar + grid)
├─ dashboard-filter-toolbar.tsx         (NEW — the four chips)
├─ dashboard-filter-product-chip.tsx    (NEW — Product multi-select popover)
├─ dashboard-filter-status-chip.tsx     (NEW — Status multi-select popover)
├─ dashboard-filter-slots-chip.tsx      (NEW — Slots single-select dropdown)
└─ dashboard-filter-sort-chip.tsx       (NEW — Sort single-select dropdown)

lib/
└─ dashboard-filters.ts                 (NEW — pure functions: applyFilters, sortItems, defaults, localStorage codec)

components/ui/
├─ popover.tsx                          (NEW — shadcn primitive, added via `pnpm dlx shadcn@latest add popover`)
└─ checkbox.tsx                         (NEW — shadcn primitive, added via `pnpm dlx shadcn@latest add checkbox`)
```

The four chip components are separated rather than one mega-component because each has slightly different interaction shape (multi-select with counts vs. single-select with options), and they'll be easier to read/test independently.

### 4.2 Filter state shape

`lib/dashboard-filters.ts` defines:

```ts
export type SortKey = "status" | "expires-soonest" | "recently-created";

export type SlotFilter = "any" | "has-empty" | "all-filled";

export interface FilterState {
  products: Product[];                  // empty array means "all"
  statuses: ("active" | "pending" | "past")[];   // checked statuses
  slots: SlotFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  products: [],                         // [] = all products
  statuses: ["active", "pending"],      // Past unchecked
  slots: "any",
  sort: "status",
};
```

`products: []` represents "all products" rather than enumerating every code, so the default state is stable as a user gains new products.

### 4.3 Filter application

```ts
export function applyFilters(
  items: DashboardSubscription[],
  state: FilterState,
): DashboardSubscription[]
```

Steps:
1. **Status:** keep items whose `subscription.status` belongs to a checked group. `active` group = `active`; `pending` group = `pending`; `past` group = `expired | revoked | rejected`.
2. **Product:** if `state.products.length > 0`, keep items whose `subscription.product` is in the list.
3. **Slots:** for `has-empty`, keep items with `liveLicense === null || demoLicense === null`. For `all-filled`, keep items with both licenses. For `any`, pass through. Items in past statuses are unaffected (pass through) since slot state is meaningless on terminal subs.

### 4.4 Sort

```ts
export function sortItems(items: DashboardSubscription[], sort: SortKey): DashboardSubscription[]
```

- `status`: existing comparator (status rank → product rank → created_at desc).
- `expires-soonest`: `expires_at` ascending; `null` (typical for pending) sorts last.
- `recently-created`: `created_at` descending.

### 4.5 Past section coexistence

`DashboardCardGrid` partitions filtered+sorted items based on filter state:

- **Default Status state** (`Active + Pending` checked, `Past` unchecked):
  - Main grid = filtered Current items (active + pending).
  - Past section renders below, collapsed, populated with **unfiltered** past items (filter doesn't apply to the collapsed section — it's a historical reference, not part of the filter view).
  - Banner shows past count.
- **Past added to Status** (`Past` checked alongside other statuses):
  - All filtered items render in one main grid, sorted together.
  - Past section is not rendered.
  - Banner is not rendered.
- **Past only** (`Past` checked, Active + Pending unchecked):
  - Same as above: one main grid of past items only.

This preserves today's "Past is tucked away by default" behavior while letting a user surface past cards into the main view on demand.

### 4.6 Persistence

- On first client mount, `useEffect` reads `localStorage["dashboard.filters.v1"]`. If present and valid JSON matching the `FilterState` shape, hydrate; else use `DEFAULT_FILTERS`.
- Every state change writes the new value back to `localStorage`.
- Validation rejects unknown keys and falls back to defaults silently (no toast).

### 4.7 Chip labels

Helper `labelFor(state, dim, allOptions)` returns the visible chip text:

| Dimension | Default label | Non-default label |
|---|---|---|
| Product | `All products` | `CTX Live` (1) · `2 products` (2+) |
| Status | `Status: Active, Pending` | `Status: Active` (1) · `Status: 3 selected` (3+) |
| Slots | `Slots` | `Slots: has empty` · `Slots: all filled` |
| Sort | `Sort: Status` | `Sort: Expires soonest` · `Sort: Recently created` |

Chips get a small filled-dot prefix when the value diverges from `DEFAULT_FILTERS`. The Sort chip never shows a dot because Sort has no "off" state — it's always set to *something*; the dot semantic is "non-default", and Sort's default `Status` is still a distinct value but doesn't qualify as "filtered." Treat Sort's dot as appearing only when sort != `status`.

### 4.8 Empty results

Three empty-grid cases, handled distinctly to avoid misleading messages:

1. **`items.length === 0`** (user has no subs at all) — handled at `app/dashboard/page.tsx` level by the existing zero-items hint. Toolbar isn't rendered.
2. **Filtered result empty, filter is at default state, and the user has past subs only** — fall back to the existing "No active subscriptions." inline note from the previous card-grid design. The collapsible Past section renders below as before. No "Clear filters" CTA (it would do nothing useful since filter is already at default).
3. **Filtered result empty AND filter is non-default** — render:
   ```
   No subscriptions match these filters.
   [ Clear filters ]
   ```
   The "Clear filters" button resets filter state to `DEFAULT_FILTERS`. Past section visibility follows the post-reset state.

## 5. UI specification

### Toolbar

- Flex row, `gap-2`, wraps on narrow viewports.
- Each chip is a shadcn `Button` variant `outline` size `sm` with a trailing `ChevronDown` icon.
- Filled-dot indicator: an 8×8 colored dot prepended when the chip is non-default.
- `× Clear all` is a `Button` variant `ghost` size `sm`, right-aligned via `ml-auto`.
- Below the toolbar, before the first card section, render a one-line summary like `Showing 5 of 8 subscriptions` (only when any filter is non-default).

### Popover (Product, Status)

- `Popover` content `align="start"` `sideOffset={4}`.
- Width: `w-56` for Product, `w-44` for Status.
- Body: a vertical list of `<label>` rows, each containing a Checkbox + label text + count (for Product).
- A `Select all` / `Clear` row at the top of Product popover (small text buttons).
- Esc closes the popover; click outside closes.

### Dropdown (Slots, Sort)

- shadcn `Select` (already in the kit). Single-line.

## 6. Behavior details

- Filter changes apply **immediately** — no Apply button.
- When the Status filter changes such that the Past section toggles on/off, the transition is just a re-render (no animation).
- The renew banner button "View past subscriptions" still works when the section is rendered (i.e., only in default Status state).
- Sorting only affects the main grid. The Past section, when rendered, uses its existing `created_at desc` sort.
- The Slot filter does NOT apply to past items (slot state is moot for terminal subs).

## 7. Files touched

**New:**
- `components/user/dashboard-filter-toolbar.tsx`
- `components/user/dashboard-filter-product-chip.tsx`
- `components/user/dashboard-filter-status-chip.tsx`
- `components/user/dashboard-filter-slots-chip.tsx`
- `components/user/dashboard-filter-sort-chip.tsx`
- `lib/dashboard-filters.ts`
- `components/ui/popover.tsx` (via shadcn CLI)
- `components/ui/checkbox.tsx` (via shadcn CLI)

**Modified:**
- `components/user/dashboard-card-grid.tsx` — owns `filterState`, renders the toolbar above the grid, applies filters/sort, conditionally renders the Past section.
- `components/ui/badge.tsx` — add `success` / `warning` / `danger` variants (§10).
- `components/user/subscription-card.tsx` — update `headerStatusVariant` to return the new variants per the §10 mapping.

**Removed:** none.

## 8. Risks / open notes

- **shadcn primitive install** — both `popover` and `checkbox` need adding before any chip can be implemented. Plan should include `pnpm dlx shadcn@latest add popover checkbox` as the first step.
- **localStorage SSR mismatch** — filter state must default to `DEFAULT_FILTERS` on first SSR render to avoid hydration mismatch; client effect rehydrates from localStorage post-mount. Acceptable: brief flash on hard reload, no flicker on client-side navigation.
- **No tests** — same posture as the prior dashboard refactor. Visual walkthrough on `json.alanano@gmail.com` is the verification gate.

## 9. Rollout

Single PR, single feature branch off `main`. No flag. Revert path is `git revert` of one PR. Sanity-check on the reference test account.

## 10. Bundled tweak: status badge colors

Independent of the filter toolbar, the card-header status badges need a clearer color palette. Currently they all collapse onto shadcn Badge's existing variants (`default` / `secondary` / `outline` / `destructive`), which produces three near-identical outlined badges for terminal statuses and a generic dark badge for Active. Ship the new palette in the same PR as the filter toolbar.

### 10.1 Target palette

| Header status | Background | Text | Border | shadcn variant strategy |
|---|---|---|---|---|
| Active | `bg-emerald-600` (`dark:bg-emerald-600`) | white | none | New `success` variant |
| No slots claimed | `bg-background` (white in light, page bg in dark) | `text-foreground` | `border-border` | Existing `outline` variant |
| Pending | `bg-amber-500` (`dark:bg-amber-500`) | `text-amber-950` | none | New `warning` variant |
| Rejected | `bg-red-600` (`dark:bg-red-600`) | white | none | New `danger` variant |
| Revoked | `bg-red-600` (`dark:bg-red-600`) | white | none | New `danger` variant (same as Rejected) |
| Expired | `bg-muted` | `text-muted-foreground` | none | New `muted` variant (or stays as `outline` — see §10.3) |

### 10.2 Implementation approach

Extend `components/ui/badge.tsx`'s `badgeVariants` (cva config) with three new variants — `success`, `warning`, `danger` — and reuse the existing `outline` variant for No-slots-claimed. Sample additions:

```ts
success: "bg-emerald-600 text-white [a]:hover:bg-emerald-600/90",
warning: "bg-amber-500 text-amber-950 [a]:hover:bg-amber-500/90",
danger:  "bg-red-600 text-white [a]:hover:bg-red-600/90",
```

Update `subscription-card.tsx`'s `headerStatusVariant` helper to return the new variant strings:

| `HeaderStatus` | Returned variant |
|---|---|
| `active` | `success` |
| `no-slots` | `outline` |
| `pending` | `warning` |
| `rejected` | `danger` |
| `revoked` | `danger` |
| `expired` | `outline` |

The helper's return type updates to include the new union members.

### 10.3 Notes

- **Dark mode**: emerald-600, amber-500, and red-600 all read well on both light and dark backgrounds, so no `dark:` variants are required beyond the explicit `dark:bg-…` mirrors above (kept for clarity in case theme tokens change later).
- **Expired vs Revoked**: currently both are visually identical outline badges. The new palette pushes Revoked (red) clearly apart from Expired (outline gray). This is intentional — Revoked is an admin action, Expired is passive time-out, and the colors should reflect that.
- **No semantic change**: the badge text and `HeaderStatus` mapping in `subscription-card.tsx:deriveHeaderStatus` is unchanged. Only the color presentation is updated.
- **Accessibility**: emerald-600 on white (and red-600 on white) both meet WCAG AA contrast for non-text UI (3:1) and AAA for the white-on-color body (≥7:1).
