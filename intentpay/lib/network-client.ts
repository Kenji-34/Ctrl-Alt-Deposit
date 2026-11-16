// Talks to the simulated card network (network/server.mjs).
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { getAgentToken, saveAgentToken, markTokenRevoked } from "@/lib/agent-tokens";
import { recordReceipt } from "@/lib/bank-receipts";

export const NETWORK_URL = process.env.NETWORK_URL || "http://localhost:4000";
const TOKEN_DAYS = 30;

export const NETWORK_DOWN =
  "The simulated card network is not reachable. Start it with: node server.mjs (in the network folder).";

export type ActivateResult =
  | { ok: true; token: string; expiry: string }
  | { ok: false; status: number; error: string };

// Ask the network to issue a token for a policy (idempotent: reuses an active one).
export async function activatePolicy(policyId: string): Promise<ActivateResult> {
  const row = db
    .prepare(`SELECT policy_json, status, agent_id FROM policies WHERE id = ?`)
    .get(policyId) as { policy_json: string; status: string; agent_id: string | null } | undefined;
  if (!row || row.status !== "ACTIVE") return { ok: false, status: 404, error: "No active policy found" };
  const policy = PolicySchema.parse(JSON.parse(row.policy_json));

  const existing = getAgentToken(policyId);
  if (existing && existing.status === "active") return { ok: true, token: existing.token, expiry: existing.expiry };

  const expiry = new Date(Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const body = {
    card_ref: "card_" + policyId.slice(0, 8),
    agent_id: row.agent_id ?? "agent_" + policyId.slice(0, 8),
    policy_id: policyId,
    expiry,
    scope: {
      categories: policy.category && policy.category !== "general" ? [policy.category] : undefined,
      max_per_txn: policy.maxAmountCents / 100,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${NETWORK_URL}/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 502, error: NETWORK_DOWN };
  }
  const data = await res.json();
  if (!res.ok) return { ok: false, status: 400, error: data.reason || data.error || "Token was refused" };

  saveAgentToken({
    policy_id: policyId,
    token: data.token,
    agent_id: body.agent_id,
    card_ref: body.card_ref,
    expiry,
  });
  return { ok: true, token: data.token, expiry };
}

// Stop a policy at the bank (always) and revoke its token at the network (best effort).
export async function revokePolicy(policyId: string, reason = "The customer revoked this agent card.") {
  db.prepare(`UPDATE policies SET status = 'REVOKED' WHERE id = ?`).run(policyId);

  const t = getAgentToken(policyId);
  let networkRevoked: boolean | null = null;
  if (t) {
    try {
      const res = await fetch(`${NETWORK_URL}/tokens/${t.token}/revoke`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      networkRevoked = res.ok;
    } catch {
      networkRevoked = false;
    }
    markTokenRevoked(policyId);
  }

  recordReceipt({ policyId, token: t?.token, agentId: t?.agent_id, outcome: "revoked", reason });
  return { networkRevoked };
}

export async function resetNetwork(): Promise<boolean> {
  try {
    const res = await fetch(`${NETWORK_URL}/reset`, { method: "POST", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function networkAuthorise(body: unknown) {
  const res = await fetch(`${NETWORK_URL}/authorise`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}
