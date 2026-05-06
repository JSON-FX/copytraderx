import type { Product } from "./products";

export type LicenseStatus = "active" | "revoked" | "expired";
export type LicenseTier = "monthly" | "quarterly" | "yearly";

export type AccountType = "demo" | "live" | "contest";

export interface License {
  id: number;
  license_key: string;
  mt5_account: number;
  product: Product;
  status: LicenseStatus;
  tier: LicenseTier | null;
  expires_at: string | null;            // ISO 8601 or null (null = not yet activated)
  activated_at: string | null;          // ISO 8601 or null (null = never activated)
  customer_email: string | null;
  purchase_date: string | null;
  last_validated_at: string | null;
  broker_name: string | null;
  account_type: AccountType | null;     // "demo" | "live" | "contest" — reported by EA
  intended_account_type: AccountType | null;
  notes: string | null;
  created_at: string;
  push_interval_seconds: number;        // 3-60, default 10
  propfirm_rule_id: number | null;      // FK to propfirm_rules
}

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "rejected"
  | "expired"
  | "revoked";

export interface Subscription {
  id: number;
  user_id: string;
  product: Product;
  tier: LicenseTier;
  status: SubscriptionStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
}

/** Derived "display" status: revoked > expired (date-based) > active. */
export type DisplayStatus = "active" | "revoked" | "expired";

/** Liveness state — derived from activated_at + last_validated_at + status. */
export type LivenessState =
  | "revoked"
  | "expired"
  | "not_activated"
  | "online"
  | "stale"
  | "offline";

// ── Journal types ────────────────────────────────────────────────────────────

// EaSource is the same set as Product. Kept as an alias so existing journal
// types continue to compile.
export type EaSource = Product;

export type TradeSide = "buy" | "sell";

export interface AccountSnapshotCurrent {
  mt5_account: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number | null;
  floating_pnl: number;
  drawdown_pct: number;
  leverage: number;
  currency: string;
  server: string | null;
  pushed_at: string;
}

export interface AccountSnapshotDaily {
  mt5_account: number;
  trade_date: string;     // YYYY-MM-DD UTC
  balance_close: number;
  equity_close: number;
  daily_pnl: number;
}

export interface Position {
  mt5_account: number;
  ticket: number;
  ea_source: EaSource;
  symbol: string;
  side: TradeSide;
  volume: number;
  open_price: number;
  current_price: number;
  sl: number | null;
  tp: number | null;
  profit: number;
  swap: number;
  commission: number;
  open_time: string;
  comment: string | null;
  magic: number | null;
}

export interface Deal {
  mt5_account: number;
  ticket: number;
  ea_source: EaSource;
  symbol: string;
  side: TradeSide;
  volume: number;
  open_price: number;
  close_price: number;
  sl: number | null;
  tp: number | null;
  open_time: string;
  close_time: string;
  profit: number;
  commission: number;
  swap: number;
  comment: string | null;
  magic: number | null;
}

export interface OrderRow {
  mt5_account: number;
  ticket: number;
  ea_source: EaSource;
  symbol: string;
  type: string;
  state: string;
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

export type DailyLossType = "money" | "percent";
export type DailyLossCalc = "balance" | "equity";

export interface PropfirmRule {
  id: number;
  name: string;
  account_size: number;
  max_daily_loss: number;
  daily_loss_type: DailyLossType;
  daily_loss_calc: DailyLossCalc;
  max_total_loss: number;
  total_loss_type: DailyLossType;
  profit_target: number;
  target_type: DailyLossType;
  min_trading_days: number;
  max_trading_days: number | null;
  created_at: string;
}

// "fresh" < 2× push interval, "stale" < 4× push interval, "offline" beyond.
export type DataAgeState = "fresh" | "stale" | "offline";

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
