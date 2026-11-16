// The one place a payment decision is made and recorded.
// Reads the policy and spend, runs the pure decide(), writes the receipt,
// the approved transaction, and (for "ask customer") a pending approval.
// MUST be called inside a database transaction (callers use db.transaction().immediate()).
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { decide, type Decision } from "@/lib/bank-decide";
import { lookupMerchant } from "@/lib/merchant-lookup";
import { recordReceipt } from "@/lib/bank-receipts";
import { windowStart } from "@/lib/budget";
import { customerCapInput } from "@/lib/customer-limits";
import { randomUUID } from "node:crypto";

export type DecisionRequest = {
  policyId: string;
  token?: string;
  agentId?: string;
  merchant: { name: string; category: string; abn?: string };
  amountCents: number;
  currency: string;
  description?: string;
  customerConfirmed?: boolean;
};

type PolicyRow = { policy_json: string; status: string };

export function runDecision(r: DecisionRequest): { decision: Decision; receiptId: string; approvalId?: string } {
  const row = db
    .prepare(`SELECT policy_json, status FROM policies WHERE id = ?`)
    .get(r.policyId) as PolicyRow | undefined;

  let policy = null;
  if (row && row.status === "ACTIVE") {
    const parsed = PolicySchema.safeParse(JSON.parse(row.policy_json));
    if (parsed.success) policy = parsed.data;
  }

  const spent = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total_spent
       FROM transactions
       WHERE policy_id = ? AND status = 'APPROVED' AND created_at >= ?`
    )
    .get(r.policyId, windowStart(policy?.period ?? "once")) as { total_spent: number };

  const decision = decide({
    policy,
    spentCents: spent.total_spent,
    amountCents: r.amountCents,
    currency: r.currency,
    merchant: { name: r.merchant.name, category: r.merchant.category },
    merchantStatus: lookupMerchant(r.merchant.name, r.merchant.abn),
    description: r.description,
    customerCap: customerCapInput(),
    customerConfirmed: r.customerConfirmed,
  });

  const receiptId = recordReceipt({
    token: r.token,
    policyId: r.policyId,
    agentId: r.agentId,
    merchantName: r.merchant.name,
    category: r.merchant.category,
    amountCents: r.amountCents,
    approvedCents: decision.approvedAmountCents ?? 0,
    outcome: decision.outcome,
    reason: decision.reason,
    declinedBy: decision.outcome === "decline" ? "bank" : undefined,
    rule: decision.rule,
    limitedBy: decision.limitedBy,
  });

  // Same table the legacy authorize route uses, so budgets are shared.
  if (policy && decision.approvedAmountCents) {
    db.prepare(`
      INSERT INTO transactions (id, policy_id, amount_cents, merchant, category, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'APPROVED', ?)
    `).run(randomUUID(), r.policyId, decision.approvedAmountCents, r.merchant.name, r.merchant.category, new Date().toISOString());
  }

  let approvalId: string | undefined;
  if (decision.outcome === "ask_customer") {
    approvalId = "appr_" + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO pending_approvals
      (id, policy_id, token, agent_id, merchant_name, category, amount_cents, currency, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      approvalId, r.policyId, r.token ?? null, r.agentId ?? null, r.merchant.name, r.merchant.category,
      r.amountCents, r.currency, r.description ?? null, new Date().toISOString()
    );
  }

  return { decision, receiptId, approvalId };
}

export function decisionResponse(decision: Decision, receiptId: string, approvalId?: string) {
  const d = (c?: number) => (c !== undefined ? c / 100 : undefined);
  return {
    outcome: decision.outcome,
    reason: decision.reason,
    rule: decision.rule,
    limited_by: decision.limitedBy,
    receipt_id: receiptId,
    approval_id: approvalId,
    approved_amount: d(decision.approvedAmountCents),
    remaining_budget: d(decision.remainingBudgetCents),
    remaining_overall: d(decision.remainingOverallCents),
  };
}
