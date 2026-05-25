// components/sidebar/app-sidebar.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartLineUp, Notebook, CalendarBlank, TrendUp, Target,
  Buildings, Scales, GearSix, SignOut,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountSwitcher } from "./account-switcher";
import { SidebarNavItem } from "./sidebar-nav-item";
import { cn } from "@/lib/utils";
import type { SidebarData } from "@/lib/sidebar-data";

function extractAccountIdFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/dashboard\/(\d+)/);
  return match ? Number(match[1]) : null;
}

interface Props {
  sidebarData: SidebarData;
  activeLicenseId: number | null;
  userEmail: string;
}

export function AppSidebar({ sidebarData, activeLicenseId: serverActiveLicenseId, userEmail }: Props) {
  const pathname = usePathname();
  const pathAccountId = extractAccountIdFromPath(pathname);
  const activeLicenseId = pathAccountId ?? serverActiveLicenseId;
  const hasAccount = activeLicenseId !== null;
  const accountPrefix = hasAccount ? `/dashboard/${activeLicenseId}` : "#";

  useEffect(() => {
    if (pathAccountId !== null) {
      const id = String(pathAccountId);
      localStorage.setItem("ctx.activeAccountId", id);
      document.cookie = `ctx.activeAccountId=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    }
  }, [pathAccountId]);

  return (
    <>
      {/* Full sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-white/[0.06] bg-[#111827] lg:flex">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#2DAA47] to-[#1B8A37] text-xs font-extrabold text-white">
            CT
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white">CopyTraderX</div>
            <div className="text-[10px] text-slate-500">License Manager</div>
          </div>
        </div>

        {/* Account Switcher */}
        <div className="pt-3">
          <AccountSwitcher data={sidebarData} activeLicenseId={activeLicenseId} />
        </div>

        {/* Nav: Main */}
        <nav className="flex-1 overflow-y-auto px-3 pt-2">
          <div className="mb-1 px-3 pt-3 text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
            Main
          </div>
          <SidebarNavItem href={`${accountPrefix}`} label="Dashboard" icon={ChartLineUp} disabled={!hasAccount} exact />
          <SidebarNavItem href={`${accountPrefix}/journal`} label="Journal" icon={Notebook} disabled={!hasAccount} />
          <SidebarNavItem href={`${accountPrefix}/calendar`} label="Calendar" icon={CalendarBlank} disabled={!hasAccount} />
          <SidebarNavItem href={`${accountPrefix}/performance`} label="Performance" icon={TrendUp} disabled={!hasAccount} />

          <div className="mb-1 mt-4 px-3 pt-3 text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
            Account
          </div>
          <SidebarNavItem href={`${accountPrefix}/objectives`} label="Objectives" icon={Target} disabled={!hasAccount} />
          <SidebarNavItem href="/dashboard/prop-firms" label="Prop Firms" icon={Buildings} />
          <SidebarNavItem href="/dashboard/propfirm-rules" label="Propfirm Rules" icon={Scales} />
          <SidebarNavItem href="/dashboard/settings" label="Settings" icon={GearSix} />
        </nav>

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-4 py-3">
          <div className="mb-2 truncate text-[11px] text-slate-400" title={userEmail}>
            {userEmail}
          </div>
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <form action="/auth/logout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <SignOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Tablet icon rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center border-r border-white/[0.06] bg-[#111827] py-3 md:flex lg:hidden">
        <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#2DAA47] to-[#1B8A37] text-xs font-extrabold text-white">
          CT
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1">
          <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}` : "#"} icon={ChartLineUp} label="Dashboard" disabled={!hasAccount} pathname={pathname} />
          <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/journal` : "#"} icon={Notebook} label="Journal" disabled={!hasAccount} pathname={pathname} />
          <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/calendar` : "#"} icon={CalendarBlank} label="Calendar" disabled={!hasAccount} pathname={pathname} />
          <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/performance` : "#"} icon={TrendUp} label="Performance" disabled={!hasAccount} pathname={pathname} />
          <div className="my-2 h-px w-6 bg-white/[0.06]" />
          <IconRailItem href={hasAccount ? `/dashboard/${activeLicenseId}/objectives` : "#"} icon={Target} label="Objectives" disabled={!hasAccount} pathname={pathname} />
          <IconRailItem href="/dashboard/prop-firms" icon={Buildings} label="Prop Firms" pathname={pathname} />
          <IconRailItem href="/dashboard/propfirm-rules" icon={Scales} label="Rules" pathname={pathname} />
          <IconRailItem href="/dashboard/settings" icon={GearSix} label="Settings" pathname={pathname} />
        </nav>
      </aside>
    </>
  );
}

function IconRailItem({ href, icon: IconCmp, label, disabled, pathname }: {
  href: string; icon: Icon; label: string; disabled?: boolean; pathname: string;
}) {
  const isActive = pathname === href || pathname.startsWith(href + "/");

  if (disabled) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 opacity-40" title={label}>
        <IconCmp className="h-[18px] w-[18px]" />
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        isActive ? "bg-[rgba(45,170,71,0.15)] text-[#2DAA47]" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
      )}
    >
      <IconCmp className="h-[18px] w-[18px]" weight={isActive ? "fill" : "regular"} />
    </Link>
  );
}
