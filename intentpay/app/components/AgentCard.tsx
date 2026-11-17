"use client";

import { useState } from "react";
import { Badge, Button, ProgressBar } from "@/app/components/ui";
import { periodLabel } from "@/lib/budget";
import { dollars, shortDate } from "@/lib/format";
import type { Agent } from "./types";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// One mandate (policy) beneath its agent: purpose, limit, budget left, never-allowed list, expiry.
export function MandateCard({ mandate, onChanged }: { mandate: Agent; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const active = mandate.status === "ACTIVE" && mandate.tokenStatus !== "revoked";
  const used = mandate.limitCents > 0 ? Math.min(100, Math.round((mandate.spentCents / mandate.limitCents) * 100)) : 0;
  const purpose = mandate.merchant || (mandate.category && mandate.category !== "general" ? cap(mandate.category) : "Anything");

  async function revoke() {
    if (!window.confirm("Revoke this mandate? This agent will not be able to spend under it.")) return;
    setBusy(true);
    await fetch("/api/agent/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ policyId: mandate.id }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{purpose}</p>
          <p className="text-xs text-gray-600">
            Up to {dollars(mandate.limitCents)} {periodLabel(mandate.period)}
            {mandate.amountType === "fixed" ? " · fixed price" : ""}
          </p>
        </div>
        {!active && <Badge color="muted">Revoked</Badge>}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Budget left</span>
          <span className="font-semibold text-gray-900">{dollars(mandate.remainingCents)}</span>
        </div>
        <ProgressBar value={used} look="skinny" aria-label="Budget used" />
      </div>

      {mandate.prohibitedItems.length > 0 && (
        <p className="text-xs text-gray-600">Never allowed: {mandate.prohibitedItems.join(", ")}</p>
      )}
      {mandate.expiry && <p className="text-xs text-gray-500">Expires {shortDate(mandate.expiry)}</p>}

      {active && (
        <div className="flex justify-end">
          <Button look="link" size="small" onClick={revoke} disabled={busy}>
            {busy ? "Revoking…" : "Revoke mandate"}
          </Button>
        </div>
      )}
    </div>
  );
}
