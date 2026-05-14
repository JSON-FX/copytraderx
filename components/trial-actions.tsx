"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrialActions({
  trialLeadId,
  licenseStatus,
  leadStatus,
}: {
  trialLeadId: number;
  licenseStatus: "active" | "revoked";
  leadStatus: "active" | "converted" | "abandoned";
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(path: string, body: unknown = {}) {
    setPending(path);
    setError(null);
    try {
      const res = await fetch(`/api/trials/${trialLeadId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function markConverted() {
    const uid = prompt("New user_id (uuid, optional — leave blank to skip):") ?? "";
    const body = uid.trim() ? { converted_user_id: uid.trim() } : {};
    await action("convert", body);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        disabled={licenseStatus === "revoked" || pending !== null}
        onClick={() => action("revoke")}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
      >
        {pending === "revoke" ? "Revoking…" : "Revoke"}
      </button>
      <button
        type="button"
        disabled={leadStatus !== "active" || pending !== null}
        onClick={markConverted}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
      >
        {pending === "convert" ? "Saving…" : "Mark converted"}
      </button>
      <button
        type="button"
        disabled={leadStatus !== "active" || pending !== null}
        onClick={() => action("abandon")}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
      >
        {pending === "abandon" ? "Saving…" : "Mark abandoned"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
