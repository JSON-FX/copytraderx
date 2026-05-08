import { format, parseISO } from "date-fns";
import { productLabel, tierLabel } from "@/lib/users";
import type { Subscription } from "@/lib/types";
import { SubscriptionPolicyForm, type PropfirmRuleOption } from "./subscription-policy-form";
import { RevokeDialog } from "./revoke-dialog";

interface Props {
  subscriptions: Subscription[];
  rules: PropfirmRuleOption[];
}

const STATUS_STYLES: Record<Subscription["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function UserSubscriptionsPanel({ subscriptions, rules }: Props) {
  if (subscriptions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
        No subscriptions yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {subscriptions.map((s) => (
        <li key={s.id} className="rounded-md border p-3 text-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {productLabel(s.product)} — {tierLabel(s.tier)}
              </div>
              <div className="text-xs text-muted-foreground">
                {s.status === "active" && s.expires_at
                  ? `Expires ${format(parseISO(s.expires_at), "yyyy-MM-dd")}`
                  : `Requested ${format(parseISO(s.requested_at), "yyyy-MM-dd")}`}
                {s.notes ? ` · ${s.notes}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status]}`}
              >
                {s.status}
              </span>
              {s.status === "active" && (
                <RevokeDialog
                  subscriptionId={s.id}
                  productLabel={productLabel(s.product)}
                  tierLabel={tierLabel(s.tier)}
                />
              )}
            </div>
          </div>
          {s.status !== "pending" && (
            <SubscriptionPolicyForm
              subscriptionId={s.id}
              initialPushInterval={s.push_interval_seconds}
              initialRuleId={s.propfirm_rule_id}
              rules={rules}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
