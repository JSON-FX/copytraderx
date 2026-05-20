"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export function DashboardNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  const linkClass = (href: string, exact = false) =>
    (exact ? pathname === href : pathname?.startsWith(href))
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground transition-colors";

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <Image
            src="/copytraderx-logo.png"
            alt="CopyTraderX"
            width={32}
            height={32}
            priority
          />
          <span className="text-base font-semibold tracking-tight text-foreground">
            CopyTraderX
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link
            href="/dashboard"
            className={linkClass("/dashboard", true)}
            aria-current={pathname === "/dashboard" ? "page" : undefined}
          >
            My Subscriptions
          </Link>
          <Link
            href="/dashboard/propfirm-rules"
            className={linkClass("/dashboard/propfirm-rules")}
            aria-current={pathname?.startsWith("/dashboard/propfirm-rules") ? "page" : undefined}
          >
            Propfirm Rules
          </Link>
          <Link
            href="/dashboard/settings"
            className={linkClass("/dashboard/settings")}
            aria-current={pathname?.startsWith("/dashboard/settings") ? "page" : undefined}
          >
            Settings
          </Link>
          <span className="hidden text-sm text-muted-foreground sm:inline" title={userEmail}>
            {userEmail}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
