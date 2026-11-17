"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/app/components/ui";
import { MandateCard } from "@/app/components/AgentCard";
import type { Agent, RegistryAgent } from "./types";

// Customer -> agents -> mandates. An agent is an AI platform identity; purposes live on its mandates.
export function AgentSection({
  agent, mandates, onChanged,
}: { agent: RegistryAgent; mandates: Agent[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const active = agent.status === "ACTIVE";

  async function revoke() {
    if (!window.confirm(`Revoke ${agent.name}? All of its mandates and cards stop working immediately.`)) return;
    setBusy(true);
    await fetch("/api/agents/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: agent.id }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-gray-900">{agent.name}</p>
          <p className="text-xs text-gray-500">{agent.type ?? "AI assistant"}</p>
          {agent.verified && (
            <p className="mt-1 text-xs font-medium text-gray-700">
              <Badge color="info">Verified by network</Badge>{" "}
              <span className="font-normal text-gray-500">simulated</span>
            </p>
          )}
        </div>
        <Badge color={active ? "success" : "muted"}>{active ? "Active" : "Revoked"}</Badge>
      </div>

      {mandates.length === 0 && <p className="text-sm text-gray-600">No mandates yet. It cannot spend anything.</p>}
      <div className="space-y-2">
        {mandates.map((m) => <MandateCard key={m.id} mandate={m} onChanged={onChanged} />)}
      </div>

      {active && (
        <Button look="faint" size="large" block className="border-border-primary! text-text-primary!" onClick={revoke} disabled={busy}>
          {busy ? "Revoking…" : "Revoke agent"}
        </Button>
      )}
    </Card>
  );
}
