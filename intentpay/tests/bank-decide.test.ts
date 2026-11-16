// Run with: npm test   (Node's built-in test runner, no extra packages)
import test from "node:test";
import assert from "node:assert/strict";
import { decide, type DecideInput, type PolicyLike } from "../lib/bank-decide.ts";

const policy: PolicyLike = {
  maxAmountCents: 15000, // $150
  currency: "AUD",
  merchant: "",
  category: "groceries",
  prohibitedItems: ["gift card", "alcohol"],
  needsClarification: false,
};

const base: DecideInput = {
  policy,
  spentCents: 0,
  amountCents: 4200,
  currency: "AUD",
  merchant: { name: "Woolworths", category: "groceries" },
  merchantStatus: "verified",
  customerCap: null,
};

const cap = (limitCents: number, spentCents: number) => ({ limitCents, spentCents, periodLabel: "per week" });

test("in policy, no overall cap: approves", () => {
  const d = decide(base);
  assert.equal(d.outcome, "approve");
  assert.equal(d.approvedAmountCents, 4200);
  assert.equal(d.remainingAgentCents, 10800);
  assert.equal(d.remainingOverallCents, undefined);
});

test("within agent budget but breaching the overall cap: narrowed, and the reason names the overall cap", () => {
  const d = decide({ ...base, amountCents: 6000, customerCap: cap(30000, 27000) });
  assert.equal(d.outcome, "approve_narrower");
  assert.equal(d.approvedAmountCents, 3000);
  assert.equal(d.limitedBy, "overall");
  assert.equal(d.rule, "overall_cap_narrowed");
  assert.match(d.reason, /overall cap/i);
  assert.equal(d.remainingOverallCents, 0);
});

test("overall cap already reached: declined as overall cap, even though the agent has budget", () => {
  const d = decide({ ...base, amountCents: 1000, customerCap: cap(30000, 30000) });
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "overall_cap_exhausted");
  assert.equal(d.limitedBy, "overall");
  assert.match(d.reason, /overall cap/i);
});

test("agent budget is the tighter limit: narrowed as agent budget, not overall", () => {
  const d = decide({ ...base, spentCents: 14000, amountCents: 5000, customerCap: cap(30000, 14000) });
  assert.equal(d.outcome, "approve_narrower");
  assert.equal(d.approvedAmountCents, 1000);
  assert.equal(d.limitedBy, "agent");
  assert.equal(d.rule, "agent_budget_narrowed");
  assert.match(d.reason, /this agent's budget/i);
});

test("agent budget used up: declined as agent budget", () => {
  const d = decide({ ...base, spentCents: 15000, customerCap: cap(30000, 15000) });
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "agent_budget_exhausted");
  assert.equal(d.limitedBy, "agent");
});

test("exactly the remaining amount is approved in full, not narrowed", () => {
  const d = decide({ ...base, amountCents: 3000, customerCap: cap(30000, 27000) });
  assert.equal(d.outcome, "approve");
  assert.equal(d.approvedAmountCents, 3000);
  assert.equal(d.remainingOverallCents, 0);
});

test("approved amounts are integer cents", () => {
  const d = decide({ ...base, amountCents: 6001, customerCap: cap(30000, 27000) });
  assert.ok(Number.isInteger(d.approvedAmountCents));
});

test("no active policy (revoked agent or mandate): declined", () => {
  const d = decide({ ...base, policy: null });
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "no_policy");
});

test("lookalike merchant is declined", () => {
  const d = decide({ ...base, merchant: { name: "Cooles", category: "groceries" }, merchantStatus: "lookalike" });
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "lookalike");
});

test("prohibited item is declined", () => {
  const d = decide({ ...base, description: "Gift card bundle" });
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "prohibited_item");
});

test("unknown merchant: asks the customer", () => {
  const d = decide({ ...base, merchant: { name: "Fresh Harvest", category: "groceries" }, merchantStatus: "unknown" });
  assert.equal(d.outcome, "ask_customer");
  assert.equal(d.rule, "unknown_merchant");
  assert.equal(d.approvedAmountCents, undefined);
});

test("customer confirmation approves an unknown merchant", () => {
  const d = decide({
    ...base,
    merchant: { name: "Fresh Harvest", category: "groceries" },
    merchantStatus: "unknown",
    customerConfirmed: true,
  });
  assert.equal(d.outcome, "approve");
  assert.equal(d.rule, "customer_confirmed");
});

test("customer confirmation can never override a decline rule", () => {
  const lookalike = decide({ ...base, merchant: { name: "Cooles", category: "groceries" }, merchantStatus: "lookalike", customerConfirmed: true });
  assert.equal(lookalike.outcome, "decline");
  const prohibited = decide({ ...base, description: "alcohol", merchantStatus: "unknown", customerConfirmed: true });
  assert.equal(prohibited.outcome, "decline");
  const category = decide({ ...base, merchant: { name: "Qantas", category: "travel" }, merchantStatus: "unknown", customerConfirmed: true });
  assert.equal(category.outcome, "decline");
  const capHit = decide({ ...base, merchantStatus: "unknown", customerConfirmed: true, customerCap: cap(30000, 30000), merchant: { name: "Fresh Harvest", category: "groceries" } });
  assert.equal(capHit.outcome, "decline");
});

test("customer confirmation is still narrowed by the overall cap", () => {
  const d = decide({
    ...base,
    amountCents: 6000,
    merchant: { name: "Fresh Harvest", category: "groceries" },
    merchantStatus: "unknown",
    customerConfirmed: true,
    customerCap: cap(30000, 27000),
  });
  assert.equal(d.outcome, "approve_narrower");
  assert.equal(d.approvedAmountCents, 3000);
});

// ---- AI check: advisory, escalate-only ----
import { applyAiCheck, STRICTNESS, type AiNote, type Decision } from "../lib/bank-decide.ts";

const approved = (): Decision => decide(base);
const mismatch = (confidence: number): AiNote => ({ status: "ok", consistent: false, confidence, reason: "Basket does not fit groceries." });

test("AI mismatch with low confidence turns approve into ask_customer", () => {
  const d = applyAiCheck(approved(), mismatch(0.6));
  assert.equal(d.outcome, "ask_customer");
  assert.equal(d.rule, "ai_mismatch_ask");
  assert.equal(d.approvedAmountCents, undefined);
});

test("AI mismatch with high confidence turns approve into decline", () => {
  const d = applyAiCheck(approved(), mismatch(0.93));
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "ai_mismatch_decline");
  assert.equal(d.approvedAmountCents, undefined);
});

test("AI says consistent: outcome unchanged", () => {
  const before = approved();
  const d = applyAiCheck(before, { status: "ok", consistent: true, confidence: 0.9, reason: "Fits." });
  assert.equal(d.outcome, before.outcome);
  assert.equal(d.approvedAmountCents, before.approvedAmountCents);
});

test("AI failure or skip leaves the deterministic outcome unchanged", () => {
  const before = approved();
  const d = applyAiCheck(before, { status: "skipped", reason: "AI check skipped: timeout" });
  assert.equal(d.outcome, before.outcome);
  assert.equal(d.approvedAmountCents, before.approvedAmountCents);
  assert.equal(d.ai?.status, "skipped");
});

test("AI can never loosen: no AI result changes a decline or ask_customer into an approval", () => {
  const declined = decide({ ...base, policy: null });
  const asked = decide({ ...base, merchant: { name: "Fresh Harvest", category: "groceries" }, merchantStatus: "unknown" });
  const results: AiNote[] = [
    { status: "ok", consistent: true, confidence: 1, reason: "Perfect match." },
    { status: "ok", consistent: false, confidence: 1, reason: "x" },
    { status: "ok", consistent: false, confidence: 0.1, reason: "x" },
    { status: "skipped", reason: "x" },
  ];
  for (const ai of results) {
    for (const before of [declined, asked, approved(), decide({ ...base, amountCents: 6000, customerCap: cap(30000, 27000) })]) {
      const after = applyAiCheck(before, ai);
      assert.ok(STRICTNESS[after.outcome] >= STRICTNESS[before.outcome], `${before.outcome} -> ${after.outcome}`);
    }
  }
  assert.equal(applyAiCheck(declined, results[0]).outcome, "decline");
  assert.equal(applyAiCheck(asked, results[0]).outcome, "ask_customer");
});

test("AI note is attached as advisory on ask_customer without changing it", () => {
  const asked = decide({ ...base, merchant: { name: "WOOLIES*SYD", category: "groceries" }, merchantStatus: "unknown" });
  const d = applyAiCheck(asked, { status: "ok", consistent: false, confidence: 0.99, reason: "x" });
  assert.equal(d.outcome, "ask_customer");
  assert.equal(d.rule, "unknown_merchant");
  assert.equal(d.ai?.effect, "advisory");
});
