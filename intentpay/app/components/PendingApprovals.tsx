"use client";

import { useState } from "react";
import { Alert, Button, Card } from "@/app/components/ui";
import { dollars } from "@/lib/format";
import type { Pending } from "./types";

// "Ask customer" prompts. Approving confirms the merchant only; every other rule still applies.
export function PendingApprovals({ items, onChanged }: { items: Pending[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (items.length === 0 && !message) return null;

  async function answer(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/approvals/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(body.reason ?? body.error ?? null);
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  return (
    <div className="space-y-2">
      {items.map((p) => (
        <Card key={p.id} data-demo="pending-approval" className="space-y-2 border-amber-300">
          <p className="text-sm font-semibold text-gray-900">Your agent wants to pay a new merchant</p>
          <p className="text-sm text-gray-700">
            {p.agentName ?? "An agent"} wants to pay <strong>{p.merchant}</strong> {dollars(p.amountCents)} ({p.category}).
            You have not paid them before.
          </p>
          {p.aiNote && <p className="text-xs text-gray-600"><span className="font-semibold">AI check:</span> {p.aiNote}</p>}
          <div className="flex justify-end gap-2">
            <Button look="faint" size="small" disabled={busy === p.id} onClick={() => answer(p.id, "reject")}>Reject</Button>
            <Button look="primary" size="small" disabled={busy === p.id} onClick={() => answer(p.id, "approve")} data-demo="pending-approve">Approve</Button>
          </div>
        </Card>
      ))}
      {message && <Alert look="info">{message}</Alert>}
    </div>
  );
}
