"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updatePnlDisplay } from "@/app/dashboard/settings/actions";
import type { PnlDisplay } from "@/lib/preferences/server";

export function PreferencesForm({ initial }: { initial: PnlDisplay }) {
  const [pending, start] = useTransition();

  function choose(next: PnlDisplay) {
    if (next === initial || pending) return;
    start(async () => {
      const res = await updatePnlDisplay(next);
      if ("error" in res) toast.error("Couldn't save preference");
      else toast.success(`Showing P/L as ${next === "percent" ? "%" : "$"}`);
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">Show P/L as</div>
        <p className="text-xs text-muted-foreground">
          How profits and losses display across the journal. You can still flip
          temporarily on each journal page.
        </p>
      </div>
      <div className="inline-flex gap-1 rounded-lg border bg-background p-1">
        {(["percent", "dollar"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => choose(value)}
            className={cn(
              "h-7 px-3 text-xs",
              initial === value && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
            )}
          >
            {value === "percent" ? "%" : "$"}
          </Button>
        ))}
      </div>
    </div>
  );
}
