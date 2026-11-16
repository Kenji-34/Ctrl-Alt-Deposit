// Agent registry: the customer's AI agents. Each agent can hold one or more mandates (policies).
import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { DEMO_CUSTOMER } from "@/lib/customer-limits";
import { revokePolicy } from "@/lib/network-client";

export type AgentRow = { id: string; customer_id: string; name: string; status: string; created_at: string };

export function listAgents(customerId = DEMO_CUSTOMER): AgentRow[] {
  return db
    .prepare(`SELECT * FROM agents WHERE customer_id = ? ORDER BY created_at ASC, name ASC`)
    .all(customerId) as AgentRow[];
}

export function getAgent(id: string): AgentRow | undefined {
  return db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
}

export function registerAgent(name: string, id?: string, customerId = DEMO_CUSTOMER): AgentRow {
  const row: AgentRow = {
    id: id ?? "agent_" + randomUUID().slice(0, 8),
    customer_id: customerId,
    name: name.trim(),
    status: "ACTIVE",
    created_at: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO agents (id, customer_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    row.id, row.customer_id, row.name, row.status, row.created_at
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
