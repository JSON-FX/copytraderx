// components/sidebar/mobile-top-bar.tsx
"use client";

import { useState } from "react";
import { List } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AppSidebar } from "./app-sidebar";
import type { SidebarData } from "@/lib/sidebar-data";

interface Props {
  sidebarData: SidebarData;
  activeLicenseId: number | null;
  userEmail: string;
}

export function MobileTopBar({ sidebarData, activeLicenseId, userEmail }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b border-white/[0.06] bg-[#111827] px-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="rounded-md p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white">
            <List className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[220px] border-r border-white/[0.06] bg-[#111827] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div
            onClick={() => setOpen(false)}
            className="h-full [&>aside:first-child]:flex [&>aside:first-child]:relative [&>aside:first-child]:w-full [&>aside:last-child]:hidden"
          >
            <AppSidebar sidebarData={sidebarData} activeLicenseId={activeLicenseId} userEmail={userEmail} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="text-sm font-semibold text-white">
        <span className="text-[#2DAA47]">CTX</span> CopyTraderX
      </div>

      <div className="text-[10px] text-slate-400">
        {activeLicenseId ? `#${activeLicenseId}` : "—"}
      </div>
    </div>
  );
}
