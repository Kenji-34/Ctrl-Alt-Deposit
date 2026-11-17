// Demo data. Hierarchy: customer -> agents -> mandates (policies).
// An agent is an AI platform identity (ChatGPT, Gemini, Perplexity). A purpose like "groceries"
// belongs to a mandate, never to the agent.
//
// One customer with a personal side and a business side (a display tag only, see lib/sides.ts):
//   ChatGPT (personal): groceries $150/week (flexible) and flights $200/week (fixed).
//   Gemini (business): office supplies $150/week (flexible) and supplier invoices $80/month (fixed).
// The single $300/week overall cap applies across both sides. The seeded history leaves $60 under the
// overall cap while Gemini's office supplies mandate still has $80, so one purchase hits the cap first.
// The two Gemini mandates name no single merchant (Officeworks is simply what it buys from), so a new
// supplier is still sent to the customer to confirm.
import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { registerAgent } from "@/lib/agents";
import { setCustomerLimit, DEFAULT_LIMIT_CENTS, DEFAULT_PERIOD } from "@/lib/customer-limits";
import { recordReceipt } from "@/lib/bank-receipts";
import { activatePolicy, resetNetwork } from "@/lib/network-client";

type Mandate = {
  prompt: string;
  maxAmountCents: number;
  category: string;
  period: "week" | "month";
  amountType: "flexible" | "fixed";
  prohibitedItems: string[];
  history: { merchant: string; cents: number }[]; // spend already made this period (seeded)
};

const SEED: { id: string; name: string; mandates: Mandate[] }[] = [
  {
    id: "agent_chatgpt",
    name: "ChatGPT",
    mandates: [
      {
        prompt: "Buy groceries for me, up to $150 a week. No gift cards or alcohol.",
        maxAmountCents: 15000, category: "groceries", period: "week", amountType: "flexible",
        prohibitedItems: ["gift card", "alcohol"],
        history: [{ merchant: "Woolworths", cents: 8000 }],
      },
      {
        prompt: "Book flights for me, up to $200 a week.",
        maxAmountCents: 20000, category: "travel", period: "week", amountType: "fixed",
        prohibitedItems: [],
        history: [{ merchant: "Jetstar", cents: 6000 }],
      },
    ],
  },
  {
    id: "agent_gemini",
    name: "Gemini",
    mandates: [
      {
        prompt: "Buy office supplies for the business, mostly from Officeworks, up to $150 a week. No gift cards or alcohol.",
        maxAmountCents: 15000, category: "office supplies", period: "week", amountType: "flexible",
        prohibitedItems: ["gift card", "alcohol"],
        history: [{ merchant: "Officeworks", cents: 7000 }],
      },
      {
        prompt: "Pay the business's supplier invoices, up to $80 a month.",
        maxAmountCents: 8000, category: "supplier invoices", period: "month", amountType: "fixed",
        prohibitedItems: [],
        history: [{ merchant: "Domain renewal", cents: 3000 }],
      },
    ],
  },
  { id: "agent_perplexity", name: "Perplexity", mandates: [] }, // registered, no mandates yet
];

export function seedDemo() {
  setCustomerLimit(DEFAULT_LIMIT_CENTS, DEFAULT_PERIOD);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  for (const a of SEED) {
    // Seeded agents mirror the network's registry (the ids match), so they start verified.
    registerAgent(a.name, a.id, "AI assistant", { networkAgentId: a.id, verified: true });
    for (const m of a.mandates) {
      const id = randomUUID();
      const policy = {
        maxAmountCents: m.maxAmountCents, currency: "AUD", merchant: "", category: m.category, period: m.period,
        amountType: m.amountType, prohibitedItems: m.prohibitedItems, needsClarification: false, clarificationQuestion: "",
      };
      db.prepare(`
        INSERT INTO policies (id, original_prompt, policy_json, status, created_at, agent_id)
        VALUES (?, ?, ?, 'ACTIVE', ?, ?)
      `).run(id, m.prompt, JSON.stringify(policy), twoDaysAgo, a.id);

      for (const h of m.history) {
        db.prepare(`
          INSERT INTO transactions (id, policy_id, amount_cents, merchant, category, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'APPROVED', ?)
        `).run(randomUUID(), id, h.cents, h.merchant, m.category, twoDaysAgo);
        recordReceipt({
          policyId: id, agentId: a.id, merchantName: h.merchant, category: m.category,
          amountCents: h.cents, approvedCents: h.cents, outcome: "approve", rule: "within_policy",
          reason: `Earlier this period (demo history): ${a.name}'s ${m.category} mandate.`,
        });
      }
    }
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
