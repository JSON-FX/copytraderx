"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { LivenessBadge } from "@/components/liveness-badge";
import { TierBadge } from "@/components/tier-badge";
import { StatusBadge } from "@/components/status-badge";
import { DataAgeIndicator } from "./data-age-indicator";
import { deriveLiveness } from "@/lib/liveness";
import type { License } from "@/lib/types";

interface Props {
  license: License;
  pushedAt: string | null;
}

export function JournalHeader({ license, pushedAt }: Props) {
  const livenessState = deriveLiveness(license, new Date());
  const displayStatus =
    license.status === "revoked"
      ? "revoked"
      : license.status === "expired"
        ? "expired"
        : "active";

  return (
    <div className="border-b pb-4">
      <Link href="/licenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Licenses
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MT5 #{license.mt5_account}</h1>
          <p className="text-xs text-muted-foreground">
            {license.broker_name ?? "broker unknown"} · {license.license_key}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={displayStatus} />
          <TierBadge tier={license.tier} />
          {license.account_type && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{license.account_type}</span>
          )}
          <LivenessBadge state={livenessState} />
          <DataAgeIndicator pushedAt={pushedAt} pushIntervalSeconds={license.push_interval_seconds} />
        </div>
      </div>
    </div>
  );
}
