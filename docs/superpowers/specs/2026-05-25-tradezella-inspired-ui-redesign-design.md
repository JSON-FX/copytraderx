# Tradezella-Inspired UI Redesign

**Date:** 2026-05-25
**Scope:** User-facing frontend — navigation, dashboard, prop firm management, subscription management relocation. Admin UI untouched.

## Motivation

The current user-facing UI uses header-based navigation with a subscription card grid as the landing page. Users must navigate back to `/dashboard` to switch between accounts, and the overall layout doesn't match the professional trading-platform feel that competitors like Tradezella deliver. This redesign replaces the shell with a sidebar-based layout, adds an inline account switcher, introduces an adaptive dashboard, and provides a cross-account prop firm management view.

## Design Decisions

| Area | Decision |
|------|----------|
| Navigation | Full sidebar with grouped sections, always-dark sidebar |
| Account Switcher | Grouped by subscription, dropdown in sidebar |
| Dashboard | Adaptive: Objective-First for prop firm accounts, KPI+Chart for live/personal |
| Prop Firm Management | Table overview with aggregate summary strip |
| Landing page | Replace My Subscriptions — land on last-used account dashboard |
| Subscription management | Moves to Settings > Subscriptions |
| Theme | Keep light/dark toggle, sidebar always dark |
| Mobile | Collapsible sidebar → icon rail → hamburger drawer |

---

## 1. App Shell & Sidebar Navigation

### Layout

```
┌──────────────────────────────────────────────┐
│ ┌──────────┐ ┌──────────────────────────────┐│
│ │  Sidebar  │ │       Content Area           ││
│ │  (always  │ │   (light/dark toggle)        ││
│ │   dark)   │ │                              ││
│ │  220px    │ │                              ││
│ │  fixed    │ │                              ││
│ └──────────┘ └──────────────────────────────┘│
└──────────────────────────────────────────────┘
```

### Sidebar Anatomy (top to bottom)

1. **Logo block** — CTX icon (32px rounded square, green gradient) + "CopyTraderX" title + "License Manager" subtitle. Separated by `border-bottom`.
2. **Account Switcher card** — Shows active account name, MT5 number, slot type (Live/Demo), product badge, status badge. Click opens grouped dropdown overlay. See Section 2.
3. **Nav Section: Main** — label "MAIN" in muted uppercase
   - Dashboard
   - Journal
   - Calendar
   - Performance
4. **Nav Section: Account** — label "ACCOUNT" in muted uppercase
   - Objectives
   - Prop Firms
   - Propfirm Rules
   - Settings
5. **Footer** — User email (truncated with tooltip), theme toggle icon, logout button. Separated by `border-top`.

### Sidebar Behavior

- Fixed 220px width on desktop (≥1024px).
- Active nav item: green left border (3px) + subtle green background tint (`rgba(45,170,71,0.12)`).
- Nav items that require an account selection (Dashboard, Journal, Calendar, Performance, Objectives) are disabled/dimmed with `pointer-events: none` and reduced opacity until an account is chosen.
- Prop Firms, Settings are always accessible (cross-account or no-account views).

### Route Structure

```
Old                              New
───                              ───
/dashboard                  →    /dashboard
                                 (redirects to /dashboard/[lastUsedId]
                                  or shows "select an account" prompt)

/dashboard/licenses/[id]    →    /dashboard/[id]              (Dashboard)
  tab: overview             →    (content absorbed into Dashboard + Journal)
  tab: trades               →    /dashboard/[id]/journal      (Journal)
  tab: calendar             →    /dashboard/[id]/calendar     (Calendar)
  tab: performance          →    /dashboard/[id]/performance  (Performance)
  tab: orders               →    /dashboard/[id]/journal      (merged into Journal)
  tab: objectives           →    /dashboard/[id]/objectives   (Objectives)

/dashboard/propfirm-rules   →    /dashboard/propfirm-rules    (unchanged)
/dashboard/settings         →    /dashboard/settings           (Preferences)
(new)                       →    /dashboard/settings/subscriptions
(new)                       →    /dashboard/prop-firms         (cross-account)
```

### Account Context

The `[id]` in the URL is the license ID (same as today). Selecting an account in the switcher navigates to `/dashboard/[id]` and updates the sidebar highlight. The selected account ID is stored in localStorage (`ctx.activeAccountId`) so page refresh preserves context.

---

## 2. Account Switcher Dropdown

### Trigger

Click the account switcher card in the sidebar. Opens a popover/overlay anchored to the card.

### Dropdown Structure

1. **Search bar** — Filters accounts by name, MT5 number, or product. Only rendered if user has 4+ accounts.
2. **Active subscriptions** — Grouped by subscription:
   - **Group header:** Product name + subscription label (e.g., "CTX Prop Passer · FTMO 50K") in muted uppercase small text.
   - **Slot rows:** Live and Demo slots as separate clickable items:
     - Green dot (claimed) or dashed-border dot (empty)
     - Text: "Live · MT5 #1234567" or "Demo · Empty slot"
     - Currently selected item shows a checkmark
   - Clicking an empty slot opens the existing `claim-slot-dialog.tsx`.
   - Clicking a claimed slot navigates to `/dashboard/[id]` and closes the dropdown.
3. **Past subscriptions** — Collapsed by default, expandable via "Past subscriptions (N)" toggle. Shows expired/revoked subscriptions dimmed. Still clickable to view historical journal data (read-only).
4. **Footer link** — "Manage Subscriptions" → `/dashboard/settings/subscriptions`.

### Data Source

Fetched server-side in the sidebar layout component. Uses the same query pattern as `dashboard-data.ts` but restructured to group by subscription with nested licenses.

### First-Time State

On login with no stored `ctx.activeAccountId`: content area shows a centered prompt — "Select an account to get started" with an arrow pointing toward the sidebar account switcher. No dashboard data loaded.

---

## 3. Adaptive Dashboard

### Route

`/dashboard/[id]` — default landing page when an account is selected.

### Detection Logic

Check if the license's subscription has a propfirm rule assigned:
- **Has propfirm rule** → Objective-First layout
- **No propfirm rule** → KPI + Chart layout

No user toggle. Automatic based on account type.

### Layout A — KPI + Chart (Live/Personal Accounts)

```
┌─────────────────────────────────────────────────────┐
│ Dashboard                      [Last 7 days ▼] [$ ▼]│
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ Net P&L  │ │ Win Rate │ │ Max DD   │ │ Equity   ││
│ │ +$2,450  │ │  68.4%   │ │  -2.1%   │ │ $52,450  ││
│ │ ▲12.4%   │ │ 19W·8L   │ │          │ │          ││
│ │ [spark]  │ │ [bar]    │ │          │ │          ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                      │
│ ┌──────────────────────────────────────────────────┐│
│ │ Equity Curve            [Balance] [Equity]       ││
│ └──────────────────────────────────────────────────┘│
│                                                      │
│ ┌─────────────────────┐ ┌─────────────────────────┐│
│ │ Recent Trades (5)   │ │ This Week (mini cal)    ││
│ └─────────────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Components:**
- **4 KPI cards** — Each shows: label (muted uppercase), value (large bold), secondary info (change %, W/L count), micro-visualization (sparkline for P&L, win/loss bar for Win Rate, progress bar for Drawdown and Equity).
- **Equity curve chart** — Recharts line chart. Reuses existing `equity-chart.tsx` with restyling to match the new dark card aesthetic. Balance (solid green) and Equity (dashed blue) toggle.
- **Recent Trades** — Last 3–5 closed deals. Each row: side+symbol (colored), P&L amount. Click row navigates to Journal page.
- **Weekly calendar mini** — 5-day heatmap (Mon–Fri). Color intensity = daily P&L magnitude. Green = profit, red = loss, neutral = no trades. Data from `account_snapshots_daily`.
- **Top-right controls:** Date range dropdown (Today, Last 7 days, Last 30 days, This month, All time). PnL display mode toggle ($ / %).

### Layout B — Objective-First (Prop Firm Accounts)

```
┌─────────────────────────────────────────────────────┐
│ Dashboard                                    [$ ▼]  │
│                                                      │
│ ┌──────────────────────────────────────────────────┐│
│ │ ✦ CHALLENGE PROGRESS              [ON TRACK]    ││
│ │ FTMO 50K · Phase 1                               ││
│ │                                                   ││
│ │ Profit Target  ████████░░░░░  $2,450 / $5,000    ││
│ │ Daily Loss     ██░░░░░░░░░░░  -$320 / -$2,500    ││
│ │ Total Loss     ████░░░░░░░░░  -$1,050 / -$5,000  ││
│ │                                                   ││
│ │ 📅 Trading Days: 8/10 min    ⏰ Days Left: 22    ││
│ └──────────────────────────────────────────────────┘│
│                                                      │
│ ┌──────────────┐ ┌────────────────────────────────┐│
│ │ Net P&L      │ │ Equity Curve                   ││
│ │ +$2,450      │ │ ~~~ (with target dashed line)  ││
│ ├──────────────┤ │                                ││
│ │ Win Rate     │ │                                ││
│ │ 68.4%        │ │                                ││
│ ├──────────────┤ └────────────────────────────────┘│
│ │ Equity       │                                   │
│ │ $52,450      │                                   │
│ └──────────────┘                                   │
│                                                      │
│ ┌──────────────────────────────────────────────────┐│
│ │ Recent Trades                                     ││
│ └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Components:**
- **Challenge progress hero card** — Gradient border/background. Status badge: ON TRACK (green), WATCH (amber), BREACH (red). Three progress bars for each objective (profit target, daily loss, total loss) with current/limit values. Trading days counter + days remaining. Reuses data logic from existing `lib/journal/objectives.ts`.
- **2-column layout below:** Stacked KPI cards (Net P&L, Win Rate, Equity) on the left. Equity curve with profit target as a horizontal dashed line on the right.
- **Recent Trades list** at the bottom.

### Shared Components (Both Layouts)

- `KpiCard` — Configurable: label, value, secondary text, micro-viz type (sparkline | bar | progress)
- `EquityCurveChart` — Restyled from existing `equity-chart.tsx`
- `RecentTradesList` — New component, pulls from deals query
- `WeeklyCalendarMini` — New component, pulls from daily snapshots
- `DateRangeSelector` — New component, dropdown with preset ranges
- `ChallengeProgressHero` — New component, uses objective evaluation logic

### Content Redistribution from Current Tabs

The current Overview tab contained hero stats, recent trades, and open positions. With the redesign:

- **Hero stats (balance, equity, floating P/L, drawdown)** → Absorbed into the Dashboard KPI cards.
- **Recent trades** → Shown on the Dashboard as the RecentTradesList widget.
- **Open positions** → Shown on the Journal page alongside the trades table.

The **Journal page** (`/dashboard/[id]/journal`) combines:
- Closed trades table (from current Trades tab) — filterable, sortable, paginated
- Open positions table (from current Overview tab) — shown above trades when positions exist
- Pending/live orders table (from current Orders tab) — shown in a collapsible section below trades

This merges the three data-table views into one page. The Journal page uses the same polling logic from `journal-shell.tsx` to keep positions and orders live.

---

## 4. Prop Firm Management Page

### Route

`/dashboard/prop-firms` — accessible without an account selected (cross-account view). Listed under "Account" section in sidebar.

### Data Source

Fetches all licenses where the subscription's product is a prop firm type (CTX Prop Passer, CTX Prop Funded) and has a propfirm rule assigned. Aggregates metrics across all accounts server-side.

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Prop Firms                    [All Firms ▼] [Active ▼]│
│                                                      │
│ ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌────────┐│
│ │ Total P&L │ │Avg WinRate│ │  Active  │ │ Funded ││
│ │  +$4,820  │ │   62.1%   │ │    3     │ │   1    ││
│ └───────────┘ └───────────┘ └──────────┘ └────────┘│
│                                                      │
│ ┌──────────────────────────────────────────────────┐│
│ │ Account    Status   P&L     DD    Progress  Days ││
│ ├──────────────────────────────────────────────────┤│
│ │ FTMO 50K  ON TRACK +$2,450 -2.1%  ████░░   8/30 ││
│ │ MFF 100K  FUNDED   +$3,200 -1.8%    —      45   ││
│ │ Apex 25K  WATCH    +$1,800 -3.4%  ██████  15/60 ││
│ │ FTMO 100K BREACHED -$4,200 -8.4%    —     12/30 ││
│ └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Summary Strip

4 aggregate KPI cards:
- **Total P&L** — Sum across all active + funded prop accounts
- **Avg Win Rate** — Weighted average across active + funded
- **Active** — Count of accounts with status ON TRACK or WATCH
- **Funded** — Count of accounts with FUNDED status

Excludes breached/expired from P&L and win rate aggregation.

### Filters

- **Firm dropdown** — Filter by prop firm name (derived from subscription label / propfirm rule name). Default: "All Firms".
- **Status dropdown** — Active (on track + watch), Funded, Breached, All. Default: Active.

### Table Columns

| Column | Content |
|--------|---------|
| Account | Prop firm name + MT5 number + phase info (subtitle) |
| Status | Badge: ON TRACK (green), WATCH (amber), FUNDED (blue), BREACHED (red) |
| P&L | Net P&L with color (green positive, red negative) |
| Drawdown | Current max drawdown % with color coding |
| Progress | Mini progress bar showing profit target % completion. Dash for funded. |
| Days | Trading days / max days (challenges), or total active days (funded) |

### Table Behavior

- Sortable by any column. Default: status priority (WATCH first, then ON TRACK, FUNDED, BREACHED).
- Click a row → navigates to `/dashboard/[id]` (switches active account).
- Breached/expired rows: faded to 40% opacity, sorted to bottom.
- Hover state on rows for clickability affordance.

### Status Derivation

Reuses existing objective evaluation logic from `lib/journal/objectives.ts`:
- **ON TRACK** — All objectives within safe range (<70% of limit)
- **WATCH** — Any objective at ≥70% of its limit
- **FUNDED** — Product is CTX Prop Funded
- **BREACHED** — Any objective exceeded its limit, or subscription is revoked/expired

---

## 5. Subscription Management

### Route

`/dashboard/settings/subscriptions` — nested under the Settings page.

### Purpose

Houses actions previously on the subscription card grid: claim slots, extend, renew, cancel requests.

### Layout

Table with one row per subscription:

| Column | Content |
|--------|---------|
| Subscription | Product name + subscription label |
| Status | Active, Pending, Expired, Revoked, Rejected badge |
| Live Slot | MT5 number or "Empty" with Claim button |
| Demo Slot | MT5 number or "Empty" with Claim button |
| Expires | Date + relative text ("12 days left") |
| Actions | Extend / Renew / Cancel request (contextual per status) |

### Behavior

- Claim button opens existing `claim-slot-dialog.tsx`.
- Extend/Renew trigger existing request flows.
- Past subscriptions shown below a collapsible "Past" divider.

### Settings Page Structure

- `/dashboard/settings` — Preferences tab (PnL display mode, existing form)
- `/dashboard/settings/subscriptions` — Subscriptions tab (new)

Tab navigation within the settings page to switch between the two.

---

## 6. Mobile Responsiveness

### Breakpoints

| Breakpoint | Sidebar | Content |
|------------|---------|---------|
| Desktop ≥1024px | Full 220px sidebar | Beside sidebar |
| Tablet 768–1023px | 56px icon rail, expands on hover as overlay | Full width |
| Mobile <768px | Hidden, hamburger in top bar opens slide-out drawer | Full width |

### Sidebar Responsive Behavior

- **Icon rail (tablet):** Shows icons only for nav items. Hovering expands to full width as an overlay (doesn't push content). Account switcher shows account initials — click expands full dropdown.
- **Mobile drawer:** Thin top bar (48px) with hamburger (left), CTX logo (center), account switcher mini (right — MT5 number chip, tappable to open switcher). Hamburger opens shadcn `Sheet` component with full sidebar content.

### Content Area Adaptations

- KPI cards: 4 columns → 2 columns (tablet) → 1 column stacked (mobile)
- Equity curve chart: full width at all sizes
- Recent trades + calendar mini: side-by-side → stacked on tablet/mobile
- Prop Firms table: horizontal scroll on mobile with sticky first column (Account)
- Challenge progress hero: progress bars stack vertically on mobile

---

## 7. Components Inventory

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AppSidebar` | `components/sidebar/app-sidebar.tsx` | Main sidebar shell with logo, nav sections, footer |
| `AccountSwitcher` | `components/sidebar/account-switcher.tsx` | Dropdown with grouped subscriptions |
| `SidebarNavItem` | `components/sidebar/sidebar-nav-item.tsx` | Individual nav link with icon, label, active state |
| `KpiCard` | `components/dashboard/kpi-card.tsx` | Configurable metric card with micro-viz |
| `ChallengeProgressHero` | `components/dashboard/challenge-progress-hero.tsx` | Objective progress card for prop firm dashboard |
| `RecentTradesList` | `components/dashboard/recent-trades-list.tsx` | Last N closed trades |
| `WeeklyCalendarMini` | `components/dashboard/weekly-calendar-mini.tsx` | 5-day P&L heatmap |
| `DateRangeSelector` | `components/dashboard/date-range-selector.tsx` | Preset date range dropdown |
| `PropFirmTable` | `components/prop-firms/prop-firm-table.tsx` | Cross-account table with sortable columns |
| `PropFirmSummaryStrip` | `components/prop-firms/prop-firm-summary-strip.tsx` | 4 aggregate KPI cards |
| `SubscriptionManagementTable` | `components/settings/subscription-management-table.tsx` | Subscription CRUD table |
| `MobileTopBar` | `components/sidebar/mobile-top-bar.tsx` | Hamburger + logo + account mini for <768px |

### Modified Components

| Component | Changes |
|-----------|---------|
| `equity-chart.tsx` | Restyle to match dark card aesthetic, add target line support |
| `objective-card.tsx` | Extract evaluation logic for reuse in ChallengeProgressHero |
| `claim-slot-dialog.tsx` | No logic changes, just triggered from new locations |
| `dashboard-nav.tsx` | Replaced by AppSidebar (delete) |
| `journal-shell.tsx` | Remove tab navigation — tabs become routes. Keep polling logic. |
| `journal-header.tsx` | Simplify — account info now in sidebar, header becomes page title only |

### Deleted Components

| Component | Reason |
|-----------|--------|
| `dashboard-card-grid.tsx` | Replaced by adaptive dashboard |
| `subscription-card.tsx` | Replaced by subscription management table |
| `subscription-card-slots.tsx` | Replaced by subscription management table |
| `dashboard-filter-toolbar.tsx` | No longer needed (no card grid) |
| `dashboard-filter-*.tsx` (all chips) | No longer needed |
| `dashboard-pagination.tsx` | No longer needed |
| `dashboard-nav.tsx` | Replaced by AppSidebar |

---

## 8. Theming

- **Sidebar:** Always dark — uses hardcoded dark palette (`bg-[#111827]`, slate/gray text) regardless of theme setting.
- **Content area:** Respects the existing `next-themes` light/dark toggle.
- **Theme toggle:** Moves from the old header to the sidebar footer.
- **Existing OKLCh variables** in `globals.css` continue to drive the content area. No changes to the color system — just the sidebar gets its own fixed dark palette.

---

## Out of Scope

- Admin UI changes (admin keeps current header nav and layout)
- Journal sub-page internals (Calendar, Performance, Objectives keep their existing component logic — only their wrapper changes from tab panels to route pages). The Journal page itself merges Trades + Orders + Open Positions but reuses the existing table components.
- Propfirm rules CRUD pages (unchanged)
- Data fetching / polling architecture (unchanged)
- Trade replay, playbooks, manual trade entry, or other Tradezella features that don't map to CTX's EA-driven model
