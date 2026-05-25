"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Icon } from "@phosphor-icons/react";

interface Props {
  href: string;
  label: string;
  icon: Icon;
  disabled?: boolean;
  exact?: boolean;
}

export function SidebarNavItem({ href, label, icon: IconCmp, disabled, exact }: Props) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  if (disabled) {
    return (
      <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 cursor-not-allowed opacity-40">
        <IconCmp className="h-[18px] w-[18px]" />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "border-l-[3px] border-[#2DAA47] bg-[rgba(45,170,71,0.12)] pl-[9px] font-medium text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
      )}
    >
      <IconCmp className="h-[18px] w-[18px] shrink-0" weight={isActive ? "fill" : "regular"} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
