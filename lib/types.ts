import type { Product } from "./products";

export type LicenseStatus = "active" | "revoked" | "expired";
export type LicenseTier = "monthly" | "quarterly" | "yearly";

export type AccountType = "demo" | "live" | "contest";

export interface License {
  id: number;
  license_key: string;
  mt5_account: number;
  product: Product;
  subscription_id: number;
  user_id: string;
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
  hidden_at: string | null;            // null = visible to user, ISO timestamp = hidden
  push_interval_seconds: number;
  propfirm_rule_id: number | null;
}

/**
 * Dashboard projection: a subscription bundled with its child licenses
 * keyed by intended_account_type. Either slot can be empty.
 */
export interface DashboardSubscription {
  subscription: Subscription;
  liveLicense: License | null;
  demoLicense: License | null;
  pendingExtension: SubscriptionExtension | null; // Plan 6
}

/**
 * Dashboard projection grouped one level higher than DashboardSubscription:
 * a single product the user has at least one subscription for, plus that
 * product's subscriptions ordered by status (active first, pending, then
 * expired/revoked/rejected). Presentation-only — does not change the
 * underlying slot/license model.
 */
export interface DashboardProductGroup {
  product: import("./products").Product;
  subscriptions: DashboardSubscription[];
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
