// Called by the network on every payment attempt that passes its coarse checks.
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { decide } from "@/lib/bank-decide";
import { lookupMerchant } from "@/lib/merchant-lookup";
import { recordReceipt } from "@/lib/bank-receipts";
import { randomUUID } from "node:crypto";

type PolicyRow = { policy_json: string; status: string };

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const amountCents = Math.round(Number(b.amount) * 100);

    if (
      typeof b.policy_id !== "string" ||
      !b.merchant ||
      typeof b.merchant.name !== "string" ||
      typeof b.merchant.category !== "string" ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      return Response.json({ error: "Invalid transaction details" }, { status: 400 });
    }

    const run = db.transaction(() => {
      const row = db
        .prepare(`SELECT policy_json, status FROM policies WHERE id = ?`)
        .get(b.policy_id) as PolicyRow | undefined;

      let policy = null;
      if (row && row.status === "ACTIVE") {
        const parsed = PolicySchema.safeParse(JSON.parse(row.policy_json));
        if (parsed.success) policy = parsed.data;
      }

      const spent = db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total_spent
           FROM transactions WHERE policy_id = ? AND status = 'APPROVED'`
        )
        .get(b.policy_id) as { total_spent: number };

      const decision = decide({
        policy,
        spentCents: spent.total_spent,
        amountCents,
        currency: typeof b.currency === "string" ? b.currency : "AUD",
        merchant: { name: b.merchant.name, category: b.merchant.category },
        merchantStatus: lookupMerchant(b.merchant.name, b.merchant.abn),
        description: typeof b.description === "string" ? b.description : undefined,
      });

      const receiptId = recordReceipt({
        token: b.token,
        policyId: b.policy_id,
        agentId: b.agent_id,
        merchantName: b.merchant.name,
        category: b.merchant.category,
        amountCents,
        approvedCents: decision.approvedAmountCents ?? 0,
        outcome: decision.outcome,
        reason: decision.reason,
        declinedBy: decision.outcome === "decline" ? "bank" : undefined,
      });

      // Same table the existing authorize route uses, so the budget is shared.
      if (policy && decision.approvedAmountCents) {
        db.prepare(`
          INSERT INTO transactions
          (id, policy_id, amount_cents, merchant, category, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          b.policy_id,
          decision.approvedAmountCents,
          b.merchant.name,
          b.merchant.category,
          "APPROVED",
          new Date().toISOString()
        );
      }

      return { decision, receiptId };
    });

    const { decision, receiptId } = run();

    return Response.json({
      outcome: decision.outcome,
      reason: decision.reason,
      receipt_id: receiptId,
      approved_amount:
        decision.approvedAmountCents !== undefined
          ? decision.approvedAmountCents / 100
          : undefined,
      remaining_budget:
        decision.remainingBudgetCents !== undefined
          ? decision.remainingBudgetCents / 100
          : undefined,
    });
  } catch (error) {
    console.error("Bank decide error:", error);
    return Response.json({ error: "Bank decision failed" }, { status: 500 });
  }
}
