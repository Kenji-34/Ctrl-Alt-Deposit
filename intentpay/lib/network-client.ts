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
  // The network agent id comes from the agent registered at the bank (identity is the network's call).
  const agentRow = row.agent_id
    ? (db.prepare(`SELECT network_agent_id FROM agents WHERE id = ?`).get(row.agent_id) as { network_agent_id: string | null } | undefined)
    : undefined;
  const body = {
    card_ref: "card_" + policyId.slice(0, 8),
    agent_id: agentRow?.network_agent_id ?? row.agent_id ?? "agent_" + policyId.slice(0, 8),
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
export async function revokePolicy(
  policyId: string,
  reason = "The customer revoked this agent card.",
  opts: { notifyNetwork?: boolean } = {}
) {
  db.prepare(`UPDATE policies SET status = 'REVOKED' WHERE id = ?`).run(policyId);

  const t = getAgentToken(policyId);
  let networkRevoked: boolean | null = null;
  if (t && opts.notifyNetwork === false) {
    // Demo only: the bank has stopped the policy but the network has not been told yet.
    networkRevoked = false;
  } else if (t) {
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

// ---- Simulated network capabilities (intent lookup by reference, cancel-instruction) ----

export type Intent = { description: string; line_items: string[] };

// The agent registers what it is buying with the network and gets a reference back
// (like an Order ID). The bank can later fetch the details by that reference.
export async function registerIntent(intent: Intent): Promise<string | null> {
  try {
    const res = await fetch(`${NETWORK_URL}/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? (await res.json()).intent_ref : null;
  } catch {
    return null;
  }
}

// Optional enrichment. Any failure returns null and the check runs on core fields only.
export async function fetchIntent(ref: string): Promise<Intent | null> {
  try {
    const res = await fetch(`${NETWORK_URL}/intent/${encodeURIComponent(ref)}`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const d = await res.json();
    return { description: String(d.description ?? ""), line_items: Array.isArray(d.line_items) ? d.line_items.map(String) : [] };
  } catch {
    return null;
  }
}

// Network-side "cancel instruction": stops future credentials but an already-issued one keeps working.
export async function cancelInstructionAtNetwork(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${NETWORK_URL}/tokens/${token}/cancel-instruction`, { method: "POST", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Simulated agent identity ----

export type NetworkAgent = { id: string; name: string; type: string; public_key: string; verified: boolean };

// The network's registry of known agents (public info only).
export async function fetchNetworkAgents(): Promise<NetworkAgent[] | null> {
  try {
    const res = await fetch(`${NETWORK_URL}/agents`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Simulated agent runtime: the agent signs its own request. (Demo only; the bank never holds agent secrets.)
export async function agentSign(fields: {
  agent_id: string; token: string; merchant: { name: string; category: string }; amount: number; timestamp: number;
}): Promise<string | null> {
  try {
    const res = await fetch(`${NETWORK_URL}/demo/agent-sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? (await res.json()).signature : null;
  } catch {
    return null;
  }
}
