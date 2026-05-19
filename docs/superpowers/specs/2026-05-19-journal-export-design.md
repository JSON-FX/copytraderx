# Journal Trades & Orders Export — Design

**Date:** 2026-05-19
**Status:** Draft
**Scope:** Admin-facing CSV / JSON export for the per-license journal's Trades tab and Orders tab.

## Problem

Today the per-license journal (`/dashboard/licenses/[id]`) renders Trades and Orders in browser-only tables. There is no way to pull the raw rows out for offline analysis (Excel, spreadsheets, ad-hoc scripts). The admin wants exports they can re-open in any tool, scoped to a date window they pick at export time — independent of the Range chip used for on-screen browsing.

## Goals

- Export the Trades and Orders datasets as **CSV** or **JSON**.
- Let the user pick a date range at export time: presets (Today, This Week, This Month, Last 7d, Last 30d, All time) **and** a custom From/To.
- Server-side query so "All time" or historical custom ranges are not limited by the in-memory Range scope.
- Filenames that describe the account + range + kind so multiple exports don't collide.

## Non-goals

- Multi-account / cross-license exports.
- Streaming or chunked download for very large datasets (current account sizes are well under 10k rows; ship simple, revisit if needed).
- Scheduling / emailing exports.
- Including the in-page filter chips (symbol / side / outcome). Export is scoped by **date only**; if we want filter passthrough later it's a small additive change.

## UX

A new `Export` button appears on the right side of the filter row, alongside the search input on both **Trades** and **Orders** tabs.

Clicking it opens a modal (`Dialog`) titled "Export Trades" or "Export Orders" with:

1. **Date range** — preset chips:
   - `Today` · `This Week` · `This Month` · `Last 7d` · `Last 30d` · `All time` · `Custom`
   - When `Custom` is selected: two date inputs (`From` / `To`), inclusive day boundaries in UTC.
   - All other presets resolve to a `from` / `to` pair at submit time using the user's local date for "Today/This Week/This Month" and UTC midnight-relative windows for "Last Nd". (Implementation detail: presets compute `from` / `to` purely in the client, then send those ISO timestamps to the server.)
2. **Format** — segmented toggle: `CSV` / `JSON`. CSV is the default.
3. Primary `Export` button and a `Cancel` button.

On submit:
- The dialog calls the server route with `kind`, `format`, optional `from` / `to`.
- Browser receives the file as an attachment download.
- Dialog closes.

Validation: if `Custom` is selected with `from > to`, the Export button is disabled and a short inline message explains why. Empty selection (`Custom` with no dates filled) defaults to `All time`.

## Server route

`GET /api/journal/[mt5_account]/export`

Query parameters:
- `kind` — required, one of `trades` | `orders`.
- `format` — required, one of `csv` | `json`.
- `from` — optional, ISO 8601 timestamp (inclusive).
- `to` — optional, ISO 8601 timestamp (inclusive).

Behavior:
- Authz uses the existing `ensureJournalAccess(mt5_account)` — admin or owner of the license tied to that mt5_account.
- For trades, filters `close_time` between `from` and `to`. For orders, filters `time_setup` between `from` and `to`. Each bound is applied only if present.
- Returns the file body with:
  - `Content-Type: text/csv; charset=utf-8` for CSV, `application/json; charset=utf-8` for JSON.
  - `Content-Disposition: attachment; filename="<filename>"`.
  - CSV body prefixed with UTF-8 BOM (`﻿`) so Excel auto-detects encoding.

Filenames:
- `<mt5_account>-<kind>-<from-date>_to_<to-date>.<ext>` when at least one bound is present.
- `<mt5_account>-<kind>-all.<ext>` when neither bound is present.

Dates in filenames use `YYYY-MM-DD` (UTC date of the timestamp).

## Data shape

### Trades CSV / JSON fields

In order, raw values (no currency formatting, no percent signs, ISO 8601 timestamps):

`ticket`, `mt5_account`, `ea_source`, `symbol`, `side`, `volume`, `open_time`, `open_price`, `close_time`, `close_price`, `sl`, `tp`, `profit`, `commission`, `swap`, `pips`, `comment`, `magic`

`pips` is computed (`(close - open) × (10000 or 100 for JPY) × sign`) so analysts don't have to reconstruct it.

### Orders CSV / JSON fields

`ticket`, `mt5_account`, `ea_source`, `symbol`, `type`, `type_label`, `state`, `state_label`, `volume_initial`, `volume_current`, `price_open`, `price_current`, `sl`, `tp`, `time_setup`, `time_done`, `comment`, `magic`

`type_label` and `state_label` are the humanized strings from `humanizeOrderType` / `humanizeOrderState` so a non-technical reader of the export can still tell `order_type_buy_stop` from `order_type_sell`.

### CSV serialization rules

- Comma separator, CRLF line endings.
- Header row first.
- `null` becomes the empty cell.
- Numbers are emitted with full precision (no rounding); whatever JS `String(n)` produces.
- Strings containing `,`, `"`, `\r`, `\n` are wrapped in double quotes; embedded `"` doubled.
- Timestamps are the raw ISO 8601 strings from the DB.

### JSON serialization

Pretty-printed array of objects (`JSON.stringify(rows, null, 2)`). Field names match the CSV columns.

## Architecture

```
[Trades/Orders table] → [Export button] → [ExportDialog]
                                           ↓ window.location = URL with query params
[GET /api/journal/:mt5_account/export] → [ensureJournalAccess]
                                       → [getDealsByRange / getOrdersByRange]
                                       → [serializeCsv / serializeJson]
                                       → [Response with attachment headers]
```

Files (new unless noted):

- `lib/journal/export.ts` — pure serializers + field mappers. No imports of React, Next, or Supabase. Tested with unit tests.
- `lib/journal/queries.ts` (edit) — add `getDealsByRange(mt5_account, from?, to?)` and `getOrdersByRange(mt5_account, from?, to?)`.
- `app/api/journal/[mt5_account]/export/route.ts` — route handler.
- `components/journal/export-dialog.tsx` — reusable dialog. Takes `kind`, `mt5_account`, default open state.
- `components/journal/tables/trades-table.tsx` (edit) — render the Export button + dialog.
- `components/journal/tables/orders-table.tsx` (edit) — same.

The `ExportDialog` is a thin client component. It does not call `fetch` directly; on submit it builds the URL and navigates with `window.location.assign(url)` so the browser handles the download. This avoids buffering the file in JS and works for arbitrarily-large responses.

## Error handling

- Server: malformed `kind`/`format` → 400 JSON `{error: "bad_request"}`. Failed query → 500 JSON `{error: "server_error"}`. Authz failures use the existing pattern (`401` / `403` / `404`).
- Client: the dialog disables Export while validation fails (custom range with `from > to`). On navigation failure there is nothing to surface beyond what the browser shows; the download is fire-and-forget.

## Testing

- Unit: `lib/journal/export.ts`
  - CSV escaping (commas, quotes, newlines in `comment`).
  - Null handling (empty cell, JSON `null`).
  - Trades pips computation.
  - JPY symbol pips factor.
- Unit: queries — covered indirectly by route tests.
- Route: build a mocked Supabase client (the project already has `jest-mocks/`); assert correct table + `gte` / `lte` filters and content-disposition headers.
- Manual: confirm both formats open correctly in Excel and a plain text viewer; confirm "All time" includes rows beyond the current Range chip; confirm filename format.

## Open questions

None — proceeding with the decisions above.
