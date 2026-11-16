// Kill switch: revoke the token at the network and stop the policy at the bank.
import db from "@/lib/db";
import { getAgentToken, markTokenRevoked } from "@/lib/agent-tokens";
import { recordReceipt } from "@/lib/bank-receipts";

const NETWORK_URL = process.env.NETWORK_URL || "http://localhost:4000";

export async function POST(request: Request) {
  try {
    const { policyId } = await request.json();
    if (typeof policyId !== "string") {
      return Response.json({ error: "policyId required" }, { status: 400 });
    }

    // The bank side always stops, even if the network cannot be reached.
    db.prepare(`UPDATE policies SET status = 'REVOKED' WHERE id = ?`).run(policyId);

    const t = getAgentToken(policyId);
    let networkRevoked = false;
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

    recordReceipt({
      policyId,
      token: t?.token,
      agentId: t?.agent_id,
      outcome: "revoked",
      reason: "The customer revoked this agent card.",
    });

    return Response.json({ revoked: true, networkRevoked });
  } catch (error) {
    console.error("Revoke error:", error);
    return Response.json({ error: "Failed to revoke" }, { status: 500 });
  }
}
