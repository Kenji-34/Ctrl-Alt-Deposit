"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Select } from "@/app/components/ui";
import { customerQuery, useProfile } from "@/lib/profile";

type Known = { id: string; name: string; type: string };

// Agent identity is established by the NETWORK. The customer picks from the network's agent registry
// (simulated); the bank stores the network's agent id and relies on its attestation.
export function AgentRegistry({ onChanged }: { onChanged: () => void }) {
  const [options, setOptions] = useState<Known[]>([]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const profile = useProfile();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/available", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const list: Known[] = await res.json();
      setOptions(list);
      setPick((cur) => (list.some((a) => a.id === cur) ? cur : list[0]?.id ?? ""));
      setError(null);
    } catch {
      setOptions([]);
      setError("The simulated card network is not reachable, so its agent registry can't be shown. Start the network and refresh.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    setError(null);
    const res = await fetch("/api/agents" + customerQuery(profile), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ networkAgentId: pick }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not register the agent.");
    await load();
    onChanged();
  }

  return (
    <Card data-demo="agent-registry" className="space-y-2">
      <p className="text-sm font-medium text-gray-900">Register an AI agent</p>
      <p className="text-xs text-gray-500">
        Pick from the card network&apos;s agent registry (simulated). The network verifies who an agent is; the bank relies on that.
      </p>
      {options.length > 0 ? (
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Agent from the network registry" data-demo="registry-select">
            {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Button look="faint" size="small" onClick={add} disabled={!pick} data-demo="registry-register">Register</Button>
        </div>
      ) : (
        !error && <p className="text-sm text-gray-600">Every agent in the network registry is already registered.</p>
      )}
      {error && <p className="text-xs text-text-primary">{error}</p>}
    </Card>
  );
}
