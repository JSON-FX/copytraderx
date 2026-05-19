import type { Deal, OrderRow } from "@/lib/types";
import { humanizeOrderState, humanizeOrderType } from "./order-display";

export type ExportKind = "trades" | "orders";
export type ExportFormat = "csv" | "json";

export interface TradeExportRow {
  ticket: number;
  mt5_account: number;
  ea_source: string;
  symbol: string;
  side: string;
  volume: number;
  open_time: string;
  open_price: number;
  close_time: string;
  close_price: number;
  sl: number | null;
  tp: number | null;
  profit: number;
  commission: number;
  swap: number;
  pips: number;
  comment: string | null;
  magic: number | null;
}

export interface OrderExportRow {
  ticket: number;
  mt5_account: number;
  ea_source: string;
  symbol: string;
  type: string;
  type_label: string;
  state: string;
  state_label: string;
  volume_initial: number;
  volume_current: number;
  price_open: number | null;
  price_current: number | null;
  sl: number | null;
  tp: number | null;
  time_setup: string;
  time_done: string | null;
  comment: string | null;
  magic: number | null;
}

export function computePips(d: Pick<Deal, "open_price" | "close_price" | "symbol" | "side">): number {
  const factor = d.symbol.endsWith("JPY") ? 100 : 10_000;
  const diff = (d.close_price - d.open_price) * factor;
  return d.side === "buy" ? diff : -diff;
}

export function dealToExportRow(d: Deal): TradeExportRow {
  return {
    ticket: d.ticket,
    mt5_account: d.mt5_account,
    ea_source: d.ea_source,
    symbol: d.symbol,
    side: d.side,
    volume: d.volume,
    open_time: d.open_time,
    open_price: d.open_price,
    close_time: d.close_time,
    close_price: d.close_price,
    sl: d.sl,
    tp: d.tp,
    profit: d.profit,
    commission: d.commission,
    swap: d.swap,
    pips: computePips(d),
    comment: d.comment,
    magic: d.magic,
  };
}

export function orderToExportRow(o: OrderRow): OrderExportRow {
  return {
    ticket: o.ticket,
    mt5_account: o.mt5_account,
    ea_source: o.ea_source,
    symbol: o.symbol,
    type: o.type,
    type_label: humanizeOrderType(o.type).label,
    state: o.state,
    state_label: humanizeOrderState(o.state).label,
    volume_initial: o.volume_initial,
    volume_current: o.volume_current,
    price_open: o.price_open,
    price_current: o.price_current,
    sl: o.sl,
    tp: o.tp,
    time_setup: o.time_setup,
    time_done: o.time_done,
    comment: o.comment,
    magic: o.magic,
  };
}

export const TRADE_COLUMNS: readonly (keyof TradeExportRow)[] = [
  "ticket", "mt5_account", "ea_source", "symbol", "side", "volume",
  "open_time", "open_price", "close_time", "close_price",
  "sl", "tp", "profit", "commission", "swap", "pips", "comment", "magic",
];

export const ORDER_COLUMNS: readonly (keyof OrderExportRow)[] = [
  "ticket", "mt5_account", "ea_source", "symbol",
  "type", "type_label", "state", "state_label",
  "volume_initial", "volume_current", "price_open", "price_current",
  "sl", "tp", "time_setup", "time_done", "comment", "magic",
];

// UTF-8 byte-order mark so Excel auto-detects encoding on open.
export const CSV_BOM = "﻿";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV<T>(
  rows: readonly T[],
  columns: readonly (keyof T)[],
): string {
  const header = columns.map((c) => csvCell(String(c))).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c])).join(",")).join("\r\n");
  return rows.length > 0 ? `${header}\r\n${body}\r\n` : `${header}\r\n`;
}

export function toJSON<T>(rows: readonly T[]): string {
  return JSON.stringify(rows, null, 2);
}

export function serializeTrades(deals: readonly Deal[], format: ExportFormat): string {
  const rows = deals.map(dealToExportRow);
  return format === "csv" ? CSV_BOM + toCSV(rows, TRADE_COLUMNS) : toJSON(rows);
}

export function serializeOrders(orders: readonly OrderRow[], format: ExportFormat): string {
  const rows = orders.map(orderToExportRow);
  return format === "csv" ? CSV_BOM + toCSV(rows, ORDER_COLUMNS) : toJSON(rows);
}

export function contentType(format: ExportFormat): string {
  return format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
}

export function exportFilename(
  mt5_account: number,
  kind: ExportKind,
  format: ExportFormat,
  from: string | null,
  to: string | null,
): string {
  const ext = format === "csv" ? "csv" : "json";
  if (!from && !to) return `${mt5_account}-${kind}-all.${ext}`;
  const fromDate = from ? from.slice(0, 10) : "start";
  const toDate = to ? to.slice(0, 10) : "now";
  return `${mt5_account}-${kind}-${fromDate}_to_${toDate}.${ext}`;
}
