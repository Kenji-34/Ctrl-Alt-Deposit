"use client";

import { useState } from "react";
import { Badge, Button, Card, ProgressBar } from "@/app/components/ui";
import { periodLabel } from "@/lib/budget";
import { dollars, shortDate } from "@/lib/format";
import type { Agent } from "./types";

export function AgentCard({ agent, onChanged }: { agent: Agent; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const active = agent.status === "ACTIVE" && agent.tokenStatus !== "revoked";
  const used = agent.limitCents > 0 ? Math.min(100, Math.round((agent.spentCents / agent.limitCents) * 100)) : 0;
  const who = agent.merchant || (agent.category && agent.category !== "general" ? agent.category : "Any merchant");

  async function revoke() {
    if (!window.confirm("Revoke this agent card? The agent will not be able to spend anything.")) return;
    setBusy(true);
    await fetch("/api/agent/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ policyId: agent.id }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          {agent.agentName && <p className="text-xs font-medium uppercase text-gray-500">{agent.agentName}</p>}
          <p className="text-base font-semibold text-gray-900">{who}</p>
          <p className="text-sm text-gray-600">
            Up to {dollars(agent.limitCents)} {periodLabel(agent.period)}
          </p>
        </div>
        <Badge color={active ? "success" : "muted"}>{active ? "Active" : "Revoked"}</Badge>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Budget left</span>
          <span className="font-semibold text-gray-900">{dollars(agent.remainingCents)}</span>
        </div>
        <ProgressBar value={used} look="skinny" aria-label="Budget used" />
        <p className="text-xs text-gray-500">
          {dollars(agent.spentCents)} spent of {dollars(agent.limitCents)}
        </p>
      </div>

      {agent.prohibitedItems.length > 0 && (
        <p className="text-xs text-gray-600">Never allowed: {agent.prohibitedItems.join(", ")}</p>
      )}
      {agent.expiry && <p className="text-xs text-gray-500">Card expires {shortDate(agent.expiry)}</p>}

      {active && (
        <Button look="faint" size="large" block className="border-border-primary! text-text-primary!" onClick={revoke} disabled={busy}>
          {busy ? "Revoking…" : "Revoke agent card"}
        </Button>
      )}
    </Card>
  );
}
