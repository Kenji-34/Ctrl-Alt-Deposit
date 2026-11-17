// Agent registry: the customer's AI agents. Each agent can hold one or more mandates (policies).
import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { DEMO_CUSTOMER } from "@/lib/customer-limits";
import { revokePolicy } from "@/lib/network-client";

export type AgentRow = { id: string; customer_id: string; name: string; type: string | null; status: string; created_at: string; network_agent_id: string | null; network_verified: number };

export function listAgents(customerId = DEMO_CUSTOMER): AgentRow[] {
  return db
    .prepare(`SELECT * FROM agents WHERE customer_id = ? ORDER BY created_at ASC, name ASC`)
    .all(customerId) as AgentRow[];
}

export function getAgent(id: string): AgentRow | undefined {
  return db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
}

export const DEFAULT_AGENT_TYPE = "AI assistant";

// An agent is an AI platform identity (ChatGPT, Gemini, Perplexity), not a spending purpose.
// Purposes live on its mandates (policies).
// Agent identity is established by the NETWORK, not the bank: the bank stores the network's agent id
// and relies on the network's attestation (simulated here).
export function registerAgent(
  name: string,
  id?: string,
  type = DEFAULT_AGENT_TYPE,
  network: { networkAgentId?: string; verified?: boolean } = {},
  customerId = DEMO_CUSTOMER
): AgentRow {
  const row: AgentRow = {
    id: id ?? "agent_" + randomUUID().slice(0, 8),
    customer_id: customerId,
    name: name.trim(),
    type,
    status: "ACTIVE",
    network_agent_id: network.networkAgentId ?? null,
    network_verified: network.verified ? 1 : 0,
    created_at: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO agents (id, customer_id, name, type, status, created_at, network_agent_id, network_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.customer_id, row.name, row.type, row.status, row.created_at, row.network_agent_id, row.network_verified
  );
  return row;
}

// Revoke an agent: every one of its mandates is stopped at the bank and every token at the network.
export async function revokeAgent(agentId: string) {
  const policies = db
    .prepare(`SELECT id FROM policies WHERE agent_id = ? AND status = 'ACTIVE'`)
    .all(agentId) as { id: string }[];
  let networkFailures = 0;
  for (const p of policies) {
    const r = await revokePolicy(p.id, "The customer revoked this agent. All of its mandates were stopped.");
    if (r.networkRevoked === false) networkFailures++;
  }
  db.prepare(`UPDATE agents SET status = 'REVOKED' WHERE id = ?`).run(agentId);
  return { mandatesRevoked: policies.length, networkFailures };
}
