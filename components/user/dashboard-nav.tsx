"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function DashboardNav({ userEmail }: { userEmail: string }) {
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

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {userEmail}
          </span>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
