"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteNav() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    pathname?.startsWith(href)
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground transition-colors";

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link
          href="/admin/licenses"
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
            CopyTraderX{" "}
            <span className="font-normal text-muted-foreground">Licenses</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link
            href="/admin/licenses"
            className={linkClass("/admin/licenses")}
            aria-current={pathname?.startsWith("/admin/licenses") ? "page" : undefined}
          >
            Licenses
          </Link>
          <Link
            href="/admin/users"
            className={linkClass("/admin/users")}
            aria-current={pathname?.startsWith("/admin/users") ? "page" : undefined}
          >
            Users
          </Link>
          <Link
            href="/admin/settings"
            className={linkClass("/admin/settings")}
            aria-current={pathname?.startsWith("/admin/settings") ? "page" : undefined}
          >
            Settings
          </Link>
          <Link
            href="/admin/propfirm-rules"
            className={linkClass("/admin/propfirm-rules")}
            aria-current={pathname?.startsWith("/admin/propfirm-rules") ? "page" : undefined}
          >
            Propfirm Rules
          </Link>
          <ThemeToggle />
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
