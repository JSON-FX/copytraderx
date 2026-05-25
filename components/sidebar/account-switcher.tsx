// components/sidebar/account-switcher.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CaretUpDown, MagnifyingGlass, Check } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Link from "next/link";
import type { SidebarData, SidebarSubscriptionGroup, SidebarAccount } from "@/lib/sidebar-data";

interface Props {
  data: SidebarData;
  activeLicenseId: number | null;
}

export function AccountSwitcher({ data, activeLicenseId }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const router = useRouter();

  const totalAccounts = useMemo(() => {
    let count = 0;
    for (const g of [...data.active, ...data.past]) {
      if (g.liveSlot) count++;
      if (g.demoSlot) count++;
    }
    return count;
  }, [data]);

  const activeAccount = useMemo(() => {
    if (!activeLicenseId) return null;
    for (const g of [...data.active, ...data.past]) {
      if (g.liveSlot?.licenseId === activeLicenseId) return { group: g, slot: g.liveSlot };
      if (g.demoSlot?.licenseId === activeLicenseId) return { group: g, slot: g.demoSlot };
    }
    return null;
  }, [data, activeLicenseId]);

  function matchesSearch(group: SidebarSubscriptionGroup): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      group.productDisplayName.toLowerCase().includes(q) ||
      (group.ruleName?.toLowerCase().includes(q) ?? false) ||
      (group.liveSlot?.mt5Account.toString().includes(q) ?? false) ||
      (group.demoSlot?.mt5Account.toString().includes(q) ?? false)
    );
  }

  function handleSelect(acct: SidebarAccount) {
    setOpen(false);
    const id = String(acct.licenseId);
    localStorage.setItem("ctx.activeAccountId", id);
    document.cookie = `ctx.activeAccountId=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    router.push(`/dashboard/${acct.licenseId}`);
  }

  const filteredActive = data.active.filter(matchesSearch);
  const filteredPast = data.past.filter(matchesSearch);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="mx-3 mb-2 w-[calc(100%-1.5rem)] rounded-lg border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/[0.08]">
          {activeAccount ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Active Account
                </span>
                <CaretUpDown className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div className="mt-1 text-xs font-medium text-white truncate">
                {activeAccount.group.ruleName ?? activeAccount.group.productDisplayName}
              </div>
              <div className="text-[10px] text-slate-500">
                MT5 #{activeAccount.slot.mt5Account} · {activeAccount.slot.slotType === "live" ? "Live" : "Demo"}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Select an account</span>
              <CaretUpDown className="h-3.5 w-3.5 text-slate-500" />
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 border-slate-700 bg-[#111827] p-0 text-white shadow-xl"
      >
        {totalAccounts >= 4 && (
          <div className="border-b border-white/[0.06] p-2">
            <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2.5 py-1.5">
              <MagnifyingGlass className="h-3.5 w-3.5 text-slate-500" />
              <input
                className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 outline-none"
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredActive.map((group) => (
            <SubscriptionGroup
              key={group.subscriptionId}
              group={group}
              activeLicenseId={activeLicenseId}
              onSelect={handleSelect}
            />
          ))}

          {filteredPast.length > 0 && (
            <>
              <div className="border-t border-white/[0.06] my-1" />
              <button
                onClick={() => setShowPast(!showPast)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-400"
              >
                <span>Past subscriptions ({filteredPast.length})</span>
                <span>{showPast ? "▲" : "▼"}</span>
              </button>
              {showPast && filteredPast.map((group) => (
                <SubscriptionGroup
                  key={group.subscriptionId}
                  group={group}
                  activeLicenseId={activeLicenseId}
                  onSelect={handleSelect}
                  dimmed
                />
              ))}
            </>
          )}
        </div>

        <div className="border-t border-white/[0.06] p-2">
          <Link
            href="/dashboard/settings/subscriptions"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-[#2DAA47] hover:text-emerald-400"
          >
            Manage Subscriptions
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SubscriptionGroup({
  group, activeLicenseId, onSelect, dimmed,
}: {
  group: SidebarSubscriptionGroup;
  activeLicenseId: number | null;
  onSelect: (acct: SidebarAccount) => void;
  dimmed?: boolean;
}) {
  const label = group.ruleName
    ? `${group.productDisplayName} · ${group.ruleName}`
    : group.productDisplayName;

  return (
    <div className={dimmed ? "opacity-50" : undefined}>
      <div className="px-2 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.5px] text-slate-500 truncate">
        {label}
      </div>
      {group.liveSlot && (
        <SlotRow slot={group.liveSlot} isActive={group.liveSlot.licenseId === activeLicenseId} onSelect={onSelect} />
      )}
      {group.demoSlot && (
        <SlotRow slot={group.demoSlot} isActive={group.demoSlot.licenseId === activeLicenseId} onSelect={onSelect} />
      )}
      {!group.liveSlot && !group.demoSlot && (
        <div className="px-2 py-1.5 text-[11px] italic text-slate-600">No slots claimed</div>
      )}
    </div>
  );
}

function SlotRow({
  slot, isActive, onSelect,
}: {
  slot: SidebarAccount;
  isActive: boolean;
  onSelect: (acct: SidebarAccount) => void;
}) {
  return (
    <button
      onClick={() => onSelect(slot)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
        isActive
          ? "border-l-[3px] border-[#2DAA47] bg-[rgba(45,170,71,0.08)] pl-[5px]"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <span className="h-[6px] w-[6px] rounded-full shrink-0 bg-[#2DAA47]" />
      <span className={isActive ? "text-white font-medium" : "text-slate-300"}>
        {slot.slotType === "live" ? "Live" : "Demo"} · MT5 #{slot.mt5Account}
      </span>
      {isActive && <Check className="ml-auto h-3.5 w-3.5 text-slate-500 shrink-0" />}
    </button>
  );
}
