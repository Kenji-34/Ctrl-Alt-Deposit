// Everything the app screens need: agent cards with budget left, plus recent activity.
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { windowStart } from "@/lib/budget";
import { getAgentToken } from "@/lib/agent-tokens";
import { listReceipts } from "@/lib/bank-receipts";
import { listAgents } from "@/lib/agents";
import { ensureSeeded } from "@/lib/demo";
import { getCustomerLimit, customerSpentCents, customerFromUrl, DEMO_CUSTOMER } from "@/lib/customer-limits";


type Row = { agent_id: string | null; id: string; original_prompt: string; policy_json: string; status: string; created_at: string };

// Optional ?customer=<id> picks which customer's agents to show. Omitted = the original demo customer (unchanged).
export async function GET(request: Request) {
  const customerId = customerFromUrl(request.url); // outside the try: reading the request must not be caught by it
  try {
    ensureSeeded();
    const registry = listAgents(customerId);
    const nameOf = new Map(registry.map((a) => [a.id, a.name]));
    const rows = (db
      .prepare(`SELECT id, agent_id, original_prompt, policy_json, status, created_at FROM policies ORDER BY created_at DESC`)
      .all() as Row[])
      .filter((r) => (r.agent_id ? nameOf.has(r.agent_id) : customerId === DEMO_CUSTOMER));
    const policyIds = new Set(rows.map((r) => r.id));

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
          agentId: r.agent_id,
          agentName: r.agent_id ? nameOf.get(r.agent_id) ?? null : null,
          prompt: r.original_prompt,
          status: r.status, // ACTIVE | REVOKED
          merchant: policy.merchant,
          category: policy.category,
          amountType: policy.amountType,
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
      .filter((r) => (r.policy_id ? policyIds.has(r.policy_id) : customerId === DEMO_CUSTOMER))
      .map((r) => ({
        id: r.id,
        policyId: r.policy_id,
        merchant: r.merchant_name,
        category: r.category,
        amountCents: r.amount_cents,
        approvedCents: r.approved_cents,
        outcome: r.outcome,
        reason: r.reason,
        rule: r.rule ?? null,
        limitedBy: r.limited_by ?? null,
        ai: r.ai_json ? JSON.parse(r.ai_json) : null,
        declinedBy: r.declined_by,
        createdAt: r.created_at,
      }));

    const lim = getCustomerLimit(customerId);
    const overallSpent = customerSpentCents(lim.period, customerId);
    const overall = {
      limitCents: lim.limitCents,
      period: lim.period,
      spentCents: overallSpent,
      remainingCents: Math.max(0, lim.limitCents - overallSpent),
    };

    const pending = (
      db
        .prepare(`SELECT * FROM pending_approvals WHERE status = 'PENDING' ORDER BY created_at DESC`)
        .all() as any[]
    ).filter((p) => policyIds.has(p.policy_id)).map((p) => ({
      id: p.id,
      policyId: p.policy_id,
      agentName: p.agent_id ? nameOf.get(p.agent_id) ?? null : null,
      merchant: p.merchant_name,
      category: p.category,
      amountCents: p.amount_cents,
      createdAt: p.created_at,
      aiNote: p.ai_note ?? null,
    }));

    const registryOut = registry.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type ?? "AI assistant",
      networkAgentId: a.network_agent_id,
      verified: a.network_verified === 1,
      status: a.status,
      activeMandates: agents.filter((x) => x.agentId === a.id && x.status === "ACTIVE").length,
    }));

    return Response.json({ agents, activity, overall, pending, registry: registryOut });
  } catch (error) {
    console.error("Summary error:", error);
    return Response.json({ error: "Failed to load agents" }, { status: 500 });
  }
}
