// Demo only: contrast "cancel at the network" with "revoke at the bank".
//  - network_only: cancels the instruction at the (simulated) network. Like Visa's cancel-instruction,
//    a credential that was already issued KEEPS WORKING.
//  - bank: the bank stops the policy at once. The next payment is declined by the bank's own check,
//    even though the network has not been told yet.
import { demoDisabledResponse } from "@/lib/demo-mode";
import db from "@/lib/db";
import { getAgentToken } from "@/lib/agent-tokens";
import { cancelInstructionAtNetwork, revokePolicy } from "@/lib/network-client";

export async function POST(request: Request) {
  const disabled = demoDisabledResponse();
  if (disabled) return disabled;
  const { policyId, mode } = await request.json().catch(() => ({}));
  if (typeof policyId !== "string" || !["network_only", "bank"].includes(mode)) {
    return Response.json({ error: "policyId and mode (network_only or bank) required" }, { status: 400 });
  }
  const exists = db.prepare(`SELECT 1 FROM policies WHERE id = ?`).get(policyId);
  if (!exists) return Response.json({ error: "Unknown policy" }, { status: 404 });

  if (mode === "network_only") {
    const t = getAgentToken(policyId);
    if (!t) return Response.json({ error: "No card to cancel" }, { status: 404 });
    return Response.json({ ok: await cancelInstructionAtNetwork(t.token), mode });
  }
  await revokePolicy(policyId, "The customer revoked this agent at the bank.", { notifyNetwork: false });
  return Response.json({ ok: true, mode });
}
