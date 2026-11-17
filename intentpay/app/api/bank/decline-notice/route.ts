// Called by the network when IT declines an attempt, so every attempt is receipted.
import { recordReceipt } from "@/lib/bank-receipts";

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const amountCents = Math.round(Number(b.amount) * 100);

    const receiptId = recordReceipt({
      token: b.token,
      policyId: b.policy_id,
      agentId: b.agent_id,
      merchantName: b.merchant?.name,
      category: b.merchant?.category,
      amountCents: Number.isSafeInteger(amountCents) ? amountCents : 0,
      outcome: "decline",
      reason: typeof b.reason === "string" ? b.reason : "Declined by the network.",
      declinedBy: typeof b.declined_by === "string" ? b.declined_by : "network",
      rule: typeof b.rule === "string" ? b.rule : "network_decline",
    });

    return Response.json({ receipt_id: receiptId });
  } catch (error) {
    console.error("Decline notice error:", error);
    return Response.json({ error: "Failed to record decline" }, { status: 500 });
  }
}
