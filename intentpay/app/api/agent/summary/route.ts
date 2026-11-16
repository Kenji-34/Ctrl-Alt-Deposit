// Everything the app screens need: agent cards with budget left, plus recent activity.
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { windowStart } from "@/lib/budget";
import { getAgentToken } from "@/lib/agent-tokens";
import { listReceipts } from "@/lib/bank-receipts";


type Row = { id: string; original_prompt: string; policy_json: string; status: string; created_at: string };

export async function GET() {
  try {
    const rows = db
      .prepare(`SELECT id, original_prompt, policy_json, status, created_at FROM policies ORDER BY created_at DESC`)
      .all() as Row[];

    const agents = rows.flatMap((r) => {
      const parsed = PolicySchema.safeParse(JSON.parse(r.policy_json));
      if (!parsed.success) return [];
      const policy = parsed.data;
      const spent = db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
           WHERE policy_id = ? AND status = 'APPROVED' AND created_at >= ?`
        )
        .get(r.id, windowStart(policy.period)) as { total: number };
      const t = getAgentToken(r.id);
      return [
        {
          id: r.id,
          prompt: r.original_prompt,
          status: r.status, // ACTIVE | REVOKED
          merchant: policy.merchant,
          category: policy.category,
          period: policy.period,
          limitCents: policy.maxAmountCents,
          spentCents: spent.total,
          remainingCents: Math.max(0, policy.maxAmountCents - spent.total),
          prohibitedItems: policy.prohibitedItems,
          token: t?.token ?? null,
          tokenStatus: t?.status ?? null,
          expiry: t?.expiry ?? null,
        },
      ];
    });

    const activity = (listReceipts(50) as any[])
      .filter((r) => ["approve", "approve_narrower", "ask_customer", "decline"].includes(r.outcome))
      .map((r) => ({
        id: r.id,
        policyId: r.policy_id,
        merchant: r.merchant_name,
        category: r.category,
        amountCents: r.amount_cents,
        approvedCents: r.approved_cents,
        outcome: r.outcome,
        reason: r.reason,
        declinedBy: r.declined_by,
        createdAt: r.created_at,
      }));

    return Response.json({ agents, activity });
  } catch (error) {
    console.error("Summary error:", error);
    return Response.json({ error: "Failed to load agents" }, { status: 500 });
  }
}
