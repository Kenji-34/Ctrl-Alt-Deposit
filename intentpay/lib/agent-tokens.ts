// Links a customer's policy to the token the network issued for it.
import db from "@/lib/db";

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_tokens (
    policy_id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    card_ref TEXT NOT NULL,
    expiry TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

export type AgentToken = {
  policy_id: string;
  token: string;
  agent_id: string;
  card_ref: string;
  expiry: string;
  status: string;
  created_at: string;
};

export function getAgentToken(policyId: string): AgentToken | undefined {
  return db.prepare(`SELECT * FROM agent_tokens WHERE policy_id = ?`).get(policyId) as
    | AgentToken
    | undefined;
}

export function saveAgentToken(t: Omit<AgentToken, "created_at" | "status">) {
  db.prepare(
    `INSERT OR REPLACE INTO agent_tokens
     (policy_id, token, agent_id, card_ref, expiry, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  ).run(t.policy_id, t.token, t.agent_id, t.card_ref, t.expiry, new Date().toISOString());
}

export function markTokenRevoked(policyId: string) {
  db.prepare(`UPDATE agent_tokens SET status = 'revoked' WHERE policy_id = ?`).run(policyId);
}
