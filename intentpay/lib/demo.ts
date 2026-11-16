// Demo data: one customer, a $300/week overall cap, and three agents.
// Each agent is inside its own budget, but together they can breach the overall cap
// ($150 + $200 + $80 > $300).
import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { registerAgent } from "@/lib/agents";
import { setCustomerLimit, DEFAULT_LIMIT_CENTS, DEFAULT_PERIOD } from "@/lib/customer-limits";
import { activatePolicy, resetNetwork } from "@/lib/network-client";

const SEED = [
  {
    agentId: "agent_grocery",
    name: "Grocery agent",
    prompt: "Buy groceries for me, up to $150 a week. No gift cards or alcohol.",
    policy: { maxAmountCents: 15000, category: "groceries", period: "week", prohibitedItems: ["gift card", "alcohol"] },
  },
  {
    agentId: "agent_flights",
    name: "Flights agent",
    prompt: "Book flights for me, up to $200 a week.",
    policy: { maxAmountCents: 20000, category: "travel", period: "week", prohibitedItems: [] as string[] },
  },
  {
    agentId: "agent_subs",
    name: "Subscriptions agent",
    prompt: "Pay my streaming subscriptions, up to $80 a month.",
    policy: { maxAmountCents: 8000, category: "subscriptions", period: "month", prohibitedItems: [] as string[] },
  },
] as const;

export function seedDemo() {
  setCustomerLimit(DEFAULT_LIMIT_CENTS, DEFAULT_PERIOD);
  for (const s of SEED) {
    registerAgent(s.name, s.agentId);
    const policy = {
      ...s.policy,
      currency: "AUD",
      merchant: "",
      needsClarification: false,
      clarificationQuestion: "",
    };
    db.prepare(`
      INSERT INTO policies (id, original_prompt, policy_json, status, created_at, agent_id)
      VALUES (?, ?, ?, 'ACTIVE', ?, ?)
    `).run(randomUUID(), s.prompt, JSON.stringify(policy), new Date().toISOString(), s.agentId);
  }
}

// First run: if nothing exists yet, start with the demo customer.
export function ensureSeeded() {
  const a = db.prepare(`SELECT COUNT(*) AS n FROM agents`).get() as { n: number };
  const p = db.prepare(`SELECT COUNT(*) AS n FROM policies`).get() as { n: number };
  if (a.n === 0 && p.n === 0) seedDemo();
}

// Clear every trace of the demo and start again, so scenes can be re-recorded cleanly.
export async function resetDemo() {
  db.transaction(() => {
    for (const t of [
      "transactions", "bank_receipts", "pending_approvals", "idempotency_records",
      "agent_tokens", "policies", "agents", "customer_limits",
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }
    seedDemo();
  })();

  const networkReset = await resetNetwork();
  let tokensIssued = 0;
  if (networkReset) {
    const rows = db.prepare(`SELECT id FROM policies WHERE status = 'ACTIVE'`).all() as { id: string }[];
    for (const r of rows) {
      const t = await activatePolicy(r.id);
      if (t.ok) tokensIssued++;
    }
  }
  return { networkReset, tokensIssued };
}
