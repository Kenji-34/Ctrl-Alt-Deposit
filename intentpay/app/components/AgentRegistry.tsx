"use client";

import { useState } from "react";
import { Badge, Button, Card, Input } from "@/app/components/ui";
import type { RegistryAgent } from "./types";

// The customer's AI agents. Revoking an agent stops every card it holds, at the bank and the network.
export function AgentRegistry({ agents, onChanged }: { agents: RegistryAgent[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not add agent.");
    setName("");
    onChanged();
  }

  async function revoke(a: RegistryAgent) {
    if (!window.confirm(`Revoke ${a.name}? All of its cards stop working immediately.`)) return;
    setBusy(a.id);
    await fetch("/api/agents/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: a.id }),
    });
    setBusy(null);
    onChanged();
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium text-gray-900">Your agents</p>
      <ul className="divide-y divide-gray-200">
        {agents.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2">
            <div>
              <p className="text-sm text-gray-900">{a.name}</p>
              <p className="text-xs text-gray-500">{a.activeMandates} active {a.activeMandates === 1 ? "card" : "cards"}</p>
            </div>
            {a.status === "ACTIVE" ? (
              <Button look="faint" size="small" className="border-border-primary! text-text-primary!" disabled={busy === a.id} onClick={() => revoke(a)}>
                Revoke agent
              </Button>
            ) : (
              <Badge color="muted">Revoked</Badge>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Register a new agent" aria-label="New agent name" />
        <Button look="faint" size="small" onClick={add} disabled={name.trim().length < 2}>Add</Button>
      </div>
      {error && <p className="text-xs text-text-primary">{error}</p>}
    </Card>
  );
}
