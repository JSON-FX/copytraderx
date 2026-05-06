"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  email: string;
  password: string;
  /** Defaults to "These credentials are shown once. Copy them now — they cannot be retrieved later." */
  warning?: string;
  /** Optional handler invoked when the user clicks Done. */
  onDone?: () => void;
}

export function CredentialsCard({ email, password, warning, onDone }: Props) {
  const [copied, setCopied] = useState<"" | "email" | "password" | "both">("");

  async function copy(value: string, label: "email" | "password") {
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast.error("Copy failed");
      return;
    }
    setCopied(label);
    toast.success(`${label === "email" ? "Email" : "Password"} copied`);
    setTimeout(() => setCopied(""), 1500);
  }

  async function copyBoth() {
    const ok = await copyToClipboard(`Email: ${email}\nPassword: ${password}`);
    if (!ok) {
      toast.error("Copy failed");
      return;
    }
    setCopied("both");
    toast.success("Credentials copied");
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div className="space-y-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-xs text-amber-700 dark:text-amber-300">
        {warning ??
          "These credentials are shown once. Copy them now — they cannot be retrieved later."}
      </p>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Email</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-sm">
              {email}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(email, "email")}
            >
              {copied === "email" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Password</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-sm break-all">
              {password}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(password, "password")}
            >
              {copied === "password" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={copyBoth}>
          {copied === "both" ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy both
            </>
          )}
        </Button>
        {onDone && (
          <Button type="button" size="sm" variant="outline" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
