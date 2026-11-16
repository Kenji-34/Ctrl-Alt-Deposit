// Customer confirmed the policy: ask the network to issue a token for it.
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { getAgentToken, saveAgentToken } from "@/lib/agent-tokens";

const NETWORK_URL = process.env.NETWORK_URL || "http://localhost:4000";
const TOKEN_DAYS = 30;

export async function POST(request: Request) {
  try {
    const { policyId } = await request.json();
    if (typeof policyId !== "string") {
      return Response.json({ error: "policyId required" }, { status: 400 });
    }

    const row = db
      .prepare(`SELECT policy_json, status FROM policies WHERE id = ?`)
      .get(policyId) as { policy_json: string; status: string } | undefined;
    if (!row || row.status !== "ACTIVE") {
      return Response.json({ error: "No active policy found" }, { status: 404 });
    }
    const policy = PolicySchema.parse(JSON.parse(row.policy_json));

    const existing = getAgentToken(policyId);
    if (existing && existing.status === "active") {
      return Response.json({ token: existing.token, expiry: existing.expiry });
    }

    const expiry = new Date(Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const body = {
      card_ref: "card_" + policyId.slice(0, 8),
      agent_id: "agent_" + policyId.slice(0, 8),
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
      return Response.json(
        { error: "The card network is not reachable. Start it with: node server.mjs (in /network)." },
        { status: 502 }
      );
    }
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.reason || data.error || "Token was refused" }, { status: 400 });
    }

    saveAgentToken({
      policy_id: policyId,
      token: data.token,
      agent_id: body.agent_id,
      card_ref: body.card_ref,
      expiry,
    });
    return Response.json({ token: data.token, expiry });
  } catch (error) {
    console.error("Activate error:", error);
    return Response.json({ error: "Failed to activate agent card" }, { status: 500 });
  }
}
