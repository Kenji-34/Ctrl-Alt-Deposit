// Called by the network before it issues a token for an agent.
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { recordReceipt } from "@/lib/bank-receipts";

type PolicyRow = { policy_json: string; status: string };

export async function POST(request: Request) {
  try {
    const b = await request.json();

    let approved = false;
    let reason = "";

    const row =
      typeof b.policy_id === "string"
        ? (db
            .prepare(`SELECT policy_json, status FROM policies WHERE id = ?`)
            .get(b.policy_id) as PolicyRow | undefined)
        : undefined;

    const parsed = row ? PolicySchema.safeParse(JSON.parse(row.policy_json)) : null;
    const expiry = new Date(b.expiry);

    if (!row || row.status !== "ACTIVE") {
      reason = "There is no active policy to link this token to.";
    } else if (!parsed || !parsed.success || parsed.data.needsClarification) {
      reason = "The customer's policy is incomplete.";
    } else if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
      reason = "The token expiry must be a future date.";
    } else {
      approved = true;
      reason = "Policy confirmed by the customer. Token can be issued.";
    }

    recordReceipt({
      policyId: b.policy_id,
      agentId: b.agent_id,
      outcome: approved ? "provision_approved" : "provision_declined",
      reason,
    });

    return Response.json({ approved, reason });
  } catch (error) {
    console.error("Provisioning error:", error);
    return Response.json({ error: "Provisioning check failed" }, { status: 500 });
  }
}
