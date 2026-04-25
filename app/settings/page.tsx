"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  POLLING_OPTIONS,
  getPollingInterval,
  setPollingInterval,
} from "@/lib/settings";

export default function SettingsPage() {
  const [interval, setIntervalState] = useState<number>(3000);

  useEffect(() => {
    setIntervalState(getPollingInterval());
  }, []);

  function onChange(value: string) {
    const ms = Number(value);
    setPollingInterval(ms);
    setIntervalState(ms);
    toast.success("Saved");
  }

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preferences are stored in this browser only.
          </p>
        </div>

        <div className="max-w-md space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="polling-interval">
              License table auto-refresh
            </label>
            <Select value={String(interval)} onValueChange={onChange}>
              <SelectTrigger id="polling-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLLING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How often the licenses table refetches in the background.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
