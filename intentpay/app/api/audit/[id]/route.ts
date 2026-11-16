// Everything about one decision, as a timeline: who delegated, which mandate, which rule, the token, the outcome.
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { getAgentToken } from "@/lib/agent-tokens";
import { getAgent } from "@/lib/agents";
import { periodLabel } from "@/lib/budget";

type R = Record<string, any>;
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = db.prepare(`SELECT * FROM bank_receipts WHERE id = ?`).get(id) as R | undefined;
  if (!r) return Response.json({ error: "Receipt not found" }, { status: 404 });

  const pol = r.policy_id ? (db.prepare(`SELECT * FROM policies WHERE id = ?`).get(r.policy_id) as R | undefined) : undefined;
  const parsed = pol ? PolicySchema.safeParse(JSON.parse(pol.policy_json)) : null;
  const policy = parsed?.success ? parsed.data : null;
  const agent = pol?.agent_id ? getAgent(pol.agent_id) : undefined;
  const tok = r.policy_id ? getAgentToken(r.policy_id) : undefined;
  const net = r.network_json ? JSON.parse(r.network_json) : null;
  const ai = r.ai_json ? JSON.parse(r.ai_json) : null;
  const approval = db.prepare(`SELECT * FROM pending_approvals WHERE receipt_id = ?`).get(id) as R | undefined;

  const events: { at: string; title: string; detail?: string; tag?: string }[] = [];
  if (pol) {
    events.push({
      at: pol.created_at,
      title: "You delegated this task",
      detail: `"${pol.original_prompt}"` + (agent ? ` Agent: ${agent.name}.` : ""),
    });
  }
  if (tok) {
    events.push({
      at: tok.created_at,
      title: "Card issued to the agent",
      detail: `Token ${tok.token}` + (net?.mandate_id ? `, mandate ${net.mandate_id}` : "") + ".",
      tag: "Simulated network",
    });
  }
  events.push({
    at: r.created_at,
    title: `Payment attempt: ${dollars(r.amount_cents)} at ${r.merchant_name ?? "unknown merchant"}`,
    detail: r.category ? `Category: ${r.category}.` : undefined,
  });
  if (net) {
    events.push({
      at: r.created_at,
      title: "Network checks passed",
      detail: `Token active and in scope. One-time cryptogram ${net.cryptogram}.`,
      tag: "Simulated network",
    });
  }
  events.push({
    at: r.created_at,
    title: `Bank decision: ${r.outcome.replace("_", " ")}`,
    detail: r.reason,
    tag: r.rule ? `Rule: ${r.rule}` : undefined,
  });
  if (r.limited_by) {
    events.push({
      at: r.created_at,
      title: "Limit applied",
      detail: r.limited_by === "overall" ? "The overall cap across all your agents." : "This agent's own budget.",
    });
  }
  if (ai) {
    events.push({
      at: r.created_at,
      title: "AI check",
      detail:
        `${ai.reason}` +
        (ai.source === "fixture" ? " (demo fixture, no Gemini key)" : "") +
        (ai.enrichmentUsed ? " Used intent details fetched from the network by reference." : " Core fields only.") +
        (ai.effect && ai.effect !== "none" ? ` Effect: ${String(ai.effect).replaceAll("_", " ")}.` : ""),
      tag: "Advisory, can only tighten",
    });
  }
  if (approval?.resolved_at) {
    events.push({
      at: approval.resolved_at,
      title: `You ${approval.status === "REJECTED" ? "rejected" : "approved"} this payment`,
      detail: approval.status === "REJECTED" ? undefined : `Result: ${String(approval.outcome).replace("_", " ")}.`,
    });
  }

  return Response.json({
    receipt: {
      id: r.id, outcome: r.outcome, reason: r.reason, rule: r.rule, limitedBy: r.limited_by, declinedBy: r.declined_by,
      merchant: r.merchant_name, category: r.category, amountCents: r.amount_cents, approvedCents: r.approved_cents,
      token: r.token ?? tok?.token ?? null, createdAt: r.created_at,
    },
    delegatedBy: "Demo customer",
    agentName: agent?.name ?? null,
    mandate: policy
      ? {
          prompt: pol!.original_prompt,
          limit: `${dollars(policy.maxAmountCents)} ${periodLabel(policy.period)}`,
          category: policy.category,
          merchant: policy.merchant || "any merchant",
          prohibited: policy.prohibitedItems,
          status: pol!.status,
        }
      : null,
    network: net,
    ai,
    timeline: events,
  });
}
