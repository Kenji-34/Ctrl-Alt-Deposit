// Rule-engine tests for the business profile (Harbour Print Co, simulated demo data).
// They use the SAME numbers as the seed (lib/business-data.ts), so the tests and the demo cannot drift apart.
import test from "node:test";
import assert from "node:assert/strict";
import { decide, applyAiCheck, type DecideInput, type PolicyLike } from "../lib/bank-decide.ts";
import { lookupMerchant } from "../lib/merchant-lookup.ts";
import { BUSINESS_AGENTS, BUSINESS_CAP_CENTS, type BusinessMandate } from "../lib/business-data.ts";

const mandateOf = (agentId: string): BusinessMandate => BUSINESS_AGENTS.find((a) => a.id === agentId)!.mandates[0];
const seededSpend = (m: BusinessMandate) => m.history.reduce((s, h) => s + h.cents, 0);
const asPolicy = (m: BusinessMandate): PolicyLike => ({
  maxAmountCents: m.maxAmountCents, currency: "AUD", merchant: "", category: m.category, prohibitedItems: m.prohibitedItems,
  needsClarification: false, amountType: m.amountType, perOrderMaxCents: m.perOrderMaxCents,
});

const procurement = mandateOf("agent_procurement");
const marketing = mandateOf("agent_marketing");
const billpay = mandateOf("agent_billpay");
const allSpent = [procurement, marketing, billpay].reduce((s, m) => s + seededSpend(m), 0);
const cap = (spentCents = allSpent) => ({ limitCents: BUSINESS_CAP_CENTS, spentCents, periodLabel: "per week" });

function req(m: BusinessMandate, merchantName: string, amountCents: number, extra: Partial<DecideInput> = {}): DecideInput {
  return {
    policy: asPolicy(m), spentCents: seededSpend(m), amountCents, currency: "AUD",
    merchant: { name: merchantName, category: m.category }, merchantStatus: lookupMerchant(merchantName),
    customerCap: cap(), labels: { agent: "Procurement agent", mandate: m.category }, ...extra,
  };
}

test("seed: $1,700 spent this week, so $300 is left under the $2,000 business cap", () => {
  assert.equal(allSpent, 170000);
  assert.equal(BUSINESS_CAP_CENTS - allSpent, 30000);
  assert.equal(procurement.maxAmountCents - seededSpend(procurement), 30000);
  assert.equal(marketing.maxAmountCents - seededSpend(marketing), 35000);
});

test("G1: procurement orders from an approved supplier within its mandate: approved", () => {
  const d = decide(req(procurement, "Northside Paper Supply", 12000));
  assert.equal(d.outcome, "approve");
  assert.equal(d.approvedAmountCents, 12000);
  assert.equal(d.rule, "within_policy");
  assert.equal(d.remainingOverallCents, 18000);
});

test("procurement: an order of exactly $300 is allowed, one cent over is declined and never reduced", () => {
  const at = decide(req(procurement, "Northside Paper Supply", 30000));
  assert.equal(at.outcome, "approve");
  const over = decide(req(procurement, "Northside Paper Supply", 30001));
  assert.equal(over.outcome, "decline");
  assert.equal(over.rule, "over_per_order_limit");
  assert.equal(over.approvedAmountCents, undefined);
});

test("procurement: the per-order limit applies even when the budget and the cap have room", () => {
  const d = decide(req(procurement, "Northside Paper Supply", 40000, { spentCents: 0, customerCap: cap(0) }));
  assert.equal(d.rule, "over_per_order_limit");
});

test("procurement: an order inside the per-order limit but over what is left is declined (fixed), not narrowed", () => {
  const d = decide(req(procurement, "Northside Paper Supply", 30000, { spentCents: 70000, customerCap: cap(100000) }));
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "fixed_amount_over_agent_budget");
});

test("procurement: fixed order over the remaining overall cap is declined, never part-paid", () => {
  const d = decide(req(procurement, "Northside Paper Supply", 25000, { spentCents: 0, customerCap: cap(185000) }));
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "fixed_amount_over_overall_cap");
  assert.equal(d.limitedBy, "overall");
});

test("G2: procurement tries a brand-new supplier: asks the owner, no money moves", () => {
  const d = decide(req(procurement, "Fernlea Paper Merchants", 8000));
  assert.equal(req(procurement, "Fernlea Paper Merchants", 8000).merchantStatus, "unknown");
  assert.equal(d.outcome, "ask_customer");
  assert.equal(d.rule, "unknown_merchant");
  assert.equal(d.approvedAmountCents, undefined);
});

test("G2: once the owner confirms, the order is approved; the confirmation resolves only the new-supplier question", () => {
  const ok = decide(req(procurement, "Fernlea Paper Merchants", 8000, { customerConfirmed: true }));
  assert.equal(ok.outcome, "approve");
  assert.equal(ok.rule, "customer_confirmed");
  const stillOver = decide(req(procurement, "Fernlea Paper Merchants", 40000, { customerConfirmed: true }));
  assert.equal(stillOver.outcome, "decline");
  assert.equal(stillOver.rule, "over_per_order_limit");
});

test("G2: a new supplier with an order over the per-order limit is declined, not asked", () => {
  const d = decide(req(procurement, "Fernlea Paper Merchants", 40000));
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "over_per_order_limit");
});

test("G3: bill-pay pays a known payee's invoice in full", () => {
  const d = decide(req(billpay, "Calder Packaging", 22000));
  assert.equal(d.outcome, "approve");
  assert.equal(d.approvedAmountCents, 22000);
});

test("G3: an invoice from a one-character lookalike of a known payee is declined", () => {
  const lookalike = req(billpay, "Calder Packaglng", 22000);
  assert.equal(lookalike.merchantStatus, "lookalike");
  const d = decide(lookalike);
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "lookalike");
  assert.equal(d.approvedAmountCents, undefined);
});

test("G3: the owner's confirmation can never rescue a lookalike", () => {
  const d = decide(req(billpay, "Calder Packaglng", 22000, { customerConfirmed: true }));
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "lookalike");
});

test("bill-pay: a payee it has never seen is never paid on its own: it asks the owner", () => {
  const d = decide(req(billpay, "Marlow Cartage", 15000));
  assert.equal(d.outcome, "ask_customer");
  assert.equal(d.rule, "unknown_merchant");
});

test("bill-pay: approved in full or declined, never narrowed", () => {
  const ownBudget = decide(req(billpay, "Calder Packaging", 60000, { customerCap: cap(0) })); // $550 left this month, plenty of cap
  assert.equal(ownBudget.outcome, "decline");
  assert.equal(ownBudget.rule, "fixed_amount_over_agent_budget");
  const byCap = decide(req(billpay, "Calder Packaging", 40000)); // fits the $550 but only $300 is left under the cap
  assert.equal(byCap.outcome, "decline");
  assert.equal(byCap.rule, "fixed_amount_over_overall_cap");
});

test("G4: marketing asks for more than its remaining share of the overall cap: narrowed to what the cap leaves", () => {
  const d = decide(req(marketing, "Brightline Ads", 40000));
  assert.equal(d.outcome, "approve_narrower");
  assert.equal(d.approvedAmountCents, 30000);
  assert.equal(d.limitedBy, "overall");
  assert.equal(d.rule, "overall_cap_narrowed");
  assert.equal(d.remainingOverallCents, 0);
  assert.equal(d.remainingAgentCents, 5000); // Marketing's own $500 budget still has $50 left
});

test("G4: with more cap room, marketing's own weekly budget is the tighter limit instead", () => {
  const d = decide(req(marketing, "Brightline Ads", 40000, { customerCap: cap(120000) }));
  assert.equal(d.outcome, "approve_narrower");
  assert.equal(d.approvedAmountCents, 35000);
  assert.equal(d.limitedBy, "agent");
  assert.equal(d.rule, "agent_budget_narrowed");
});

test("G4: a marketing purchase that fits both limits is approved in full", () => {
  const d = decide(req(marketing, "Brightline Ads", 20000));
  assert.equal(d.outcome, "approve");
  assert.equal(d.approvedAmountCents, 20000);
});

test("business cap reached: every agent is declined, whatever its own budget says", () => {
  for (const [m, name] of [[procurement, "Northside Paper Supply"], [marketing, "Brightline Ads"], [billpay, "Calder Packaging"]] as const) {
    const d = decide(req(m, name, 1000, { customerCap: cap(BUSINESS_CAP_CENTS) }));
    assert.equal(d.outcome, "decline");
    assert.equal(d.rule, "overall_cap_exhausted");
  }
});

test("G5: after the owner revokes the Marketing agent (no active policy) its card is blocked", () => {
  const d = decide({ ...req(marketing, "Brightline Ads", 4000), policy: null });
  assert.equal(d.outcome, "decline");
  assert.equal(d.rule, "no_policy");
});

test("a mandate with no per-order limit (every personal mandate) behaves exactly as before", () => {
  const d = decide({ ...req(marketing, "Brightline Ads", 20000), policy: { ...asPolicy(marketing), perOrderMaxCents: undefined } });
  assert.equal(d.outcome, "approve");
});

test("AI check stays escalate-only on business payments: it can ask or decline an approve, and never loosens a decline or an ask", () => {
  const approve = decide(req(procurement, "Northside Paper Supply", 12000));
  const note = { status: "ok" as const, consistent: false, confidence: 0.5, reason: "does not look like print supplies" };
  assert.equal(applyAiCheck(approve, note).outcome, "ask_customer");
  assert.equal(applyAiCheck(approve, { ...note, confidence: 0.95 }).outcome, "decline");
  const decline = decide(req(billpay, "Calder Packaglng", 22000));
  assert.equal(applyAiCheck(decline, { status: "ok", consistent: true, confidence: 1, reason: "fine" }).outcome, "decline");
  const ask = decide(req(procurement, "Fernlea Paper Merchants", 8000));
  assert.equal(applyAiCheck(ask, { status: "ok", consistent: true, confidence: 1, reason: "fine" }).outcome, "ask_customer");
  assert.equal(applyAiCheck(approve, { status: "skipped", reason: "AI check skipped" }).outcome, "approve");
});
