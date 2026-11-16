// Customer answers an "ask customer" prompt. Approving re-runs the bank's rules with the
// customer's confirmation: that resolves the unknown-merchant question and NOTHING else,
// so every other rule (budget, caps, prohibited items, lookalikes) still applies.
import db from "@/lib/db";
import { runDecision } from "@/lib/bank-pipeline";
import { recordReceipt } from "@/lib/bank-receipts";

type Pending = {
  id: string; policy_id: string; token: string | null; agent_id: string | null; merchant_name: string;
  category: string; amount_cents: number; currency: string; description: string | null; status: string;
};

export async function POST(request: Request) {
  try {
    const { id, action } = await request.json();
    if (typeof id !== "string" || !["approve", "reject"].includes(action)) {
      return Response.json({ error: "id and action (approve or reject) required" }, { status: 400 });
    }

    const run = db.transaction(() => {
      const p = db.prepare(`SELECT * FROM pending_approvals WHERE id = ?`).get(id) as Pending | undefined;
      if (!p) return { status: 404, body: { error: "No such approval" } };
      if (p.status !== "PENDING") return { status: 409, body: { error: "This approval was already answered" } };
      const now = new Date().toISOString();

      if (action === "reject") {
        recordReceipt({
          token: p.token ?? undefined, policyId: p.policy_id, agentId: p.agent_id ?? undefined,
          merchantName: p.merchant_name, category: p.category, amountCents: p.amount_cents,
          outcome: "decline", reason: `The customer rejected the payment to "${p.merchant_name}".`,
          declinedBy: "customer", rule: "customer_rejected",
        });
        db.prepare(`UPDATE pending_approvals SET status = 'REJECTED', outcome = 'decline', resolved_at = ? WHERE id = ?`).run(now, id);
        return { status: 200, body: { outcome: "decline", reason: "You rejected this payment." } };
      }

      const { decision, receiptId } = runDecision({
        policyId: p.policy_id, token: p.token ?? undefined, agentId: p.agent_id ?? undefined,
        merchant: { name: p.merchant_name, category: p.category },
        amountCents: p.amount_cents, currency: p.currency, description: p.description ?? undefined,
        customerConfirmed: true,
      });
      const ok = decision.outcome === "approve" || decision.outcome === "approve_narrower";
      db.prepare(`UPDATE pending_approvals SET status = ?, outcome = ?, resolved_at = ? WHERE id = ?`)
        .run(ok ? "APPROVED" : "DECLINED", decision.outcome, now, id);
      return {
        status: 200,
        body: { outcome: decision.outcome, reason: decision.reason, rule: decision.rule, receipt_id: receiptId,
                approved_amount: decision.approvedAmountCents !== undefined ? decision.approvedAmountCents / 100 : undefined },
      };
    });

    const { status, body } = run.immediate();
    return Response.json(body, { status });
  } catch (error) {
    console.error("Approval error:", error);
    return Response.json({ error: "Could not resolve approval" }, { status: 500 });
  }
}
