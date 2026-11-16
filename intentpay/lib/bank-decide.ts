// Bank-side decision logic for agent payments.
// Pure function: no database or network access, so it is easy to test.
// The route handlers under app/api/bank do the I/O and call this.
//
// There is NO AI in this file. Deterministic rules decide every payment.

export type Outcome =
  | "approve"
  | "approve_narrower"
  | "ask_customer"
  | "decline";

export type MerchantStatus = "verified" | "lookalike" | "unknown";

// Which rule produced the outcome. Stored on the receipt and shown in the audit view.
export type Rule =
  | "no_policy"
  | "needs_clarification"
  | "currency"
  | "lookalike"
  | "merchant_mismatch"
  | "category_mismatch"
  | "prohibited_item"
  | "agent_budget_exhausted"
  | "overall_cap_exhausted"
  | "unknown_merchant"
  | "agent_budget_narrowed"
  | "overall_cap_narrowed"
  | "within_policy"
  | "customer_confirmed";

// Which limit was the binding one when budget decided the outcome.
export type LimitedBy = "agent" | "overall";

// Matches the fields of PolicySchema that the decision needs.
export type PolicyLike = {
  maxAmountCents: number;
  currency: string;
  merchant: string;
  category: string;
  prohibitedItems: string[];
  needsClarification: boolean;
};

// The customer-wide cap across ALL of the customer's agents.
export type CustomerCapInput = {
  limitCents: number;
  spentCents: number; // approved across every agent in the cap's window
  periodLabel: string; // e.g. "per week"
};

export type DecideInput = {
  policy: PolicyLike | null; // null = policy missing, revoked or not ACTIVE
  spentCents: number; // already approved against this policy in its window
  amountCents: number;
  currency: string;
  merchant: { name: string; category: string };
  merchantStatus: MerchantStatus;
  description?: string;
  customerCap?: CustomerCapInput | null;
  // Set only when the customer has just approved an "ask customer" prompt.
  // It can resolve the unknown-merchant question and nothing else.
  customerConfirmed?: boolean;
};

export type Decision = {
  outcome: Outcome;
  rule: Rule;
  reason: string; // plain English, shown to the customer
  approvedAmountCents?: number;
  remainingBudgetCents?: number; // this agent's budget left after the decision
  remainingAgentCents?: number;
  remainingOverallCents?: number; // undefined when there is no overall cap
  limitedBy?: LimitedBy;
};

const norm = (s: string) => s.trim().toLowerCase();
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function decide(i: DecideInput): Decision {
  const { policy, merchant } = i;

  if (!policy) {
    return { outcome: "decline", rule: "no_policy", reason: "There is no active policy for this agent." };
  }
  if (policy.needsClarification) {
    return { outcome: "decline", rule: "needs_clarification", reason: "The customer's policy still needs clarification." };
  }
  if (norm(i.currency) !== norm(policy.currency)) {
    return {
      outcome: "decline",
      rule: "currency",
      reason: `${i.currency} payments are not covered by this policy (${policy.currency} only).`,
    };
  }

  // Merchant identity: the network cannot see this, only the bank can.
  if (i.merchantStatus === "lookalike") {
    return {
      outcome: "decline",
      rule: "lookalike",
      reason: `"${merchant.name}" closely imitates a known merchant and is not verified, so it was blocked to protect the customer.`,
    };
  }

  const namedByCustomer =
    policy.merchant !== "" && norm(merchant.name) === norm(policy.merchant);

  if (policy.merchant !== "" && !namedByCustomer) {
    return {
      outcome: "decline",
      rule: "merchant_mismatch",
      reason: `${merchant.name} is not the merchant the customer authorised (${policy.merchant}).`,
    };
  }
  if (policy.category !== "general" && norm(merchant.category) !== norm(policy.category)) {
    return {
      outcome: "decline",
      rule: "category_mismatch",
      reason: `This purchase is in '${merchant.category}', but the policy only allows '${policy.category}'.`,
    };
  }

  const haystack = norm(`${i.description ?? ""} ${merchant.name}`);
  const blocked = policy.prohibitedItems.find(
    (b) => b.trim() !== "" && haystack.includes(norm(b))
  );
  if (blocked) {
    return {
      outcome: "decline",
      rule: "prohibited_item",
      reason: `The purchase mentions '${blocked}', which the customer prohibited.`,
    };
  }

  // Budget: the tighter of this agent's own budget and the customer-wide cap.
  const cap = i.customerCap ?? null;
  const agentRemaining = Math.max(0, policy.maxAmountCents - i.spentCents);
  const overallRemaining = cap ? Math.max(0, cap.limitCents - cap.spentCents) : Infinity;
  const remaining = Math.min(agentRemaining, overallRemaining);
  const limitedBy: LimitedBy = overallRemaining < agentRemaining ? "overall" : "agent";
  const overallOut = cap ? overallRemaining : undefined;

  if (remaining <= 0) {
    if (limitedBy === "overall" && cap) {
      return {
        outcome: "decline",
        rule: "overall_cap_exhausted",
        reason: `Your overall cap of ${dollars(cap.limitCents)} ${cap.periodLabel} has been reached across all your agents (${dollars(cap.spentCents)} spent), so this payment was declined.`,
        remainingBudgetCents: agentRemaining,
        remainingAgentCents: agentRemaining,
        remainingOverallCents: 0,
        limitedBy,
      };
    }
    return {
      outcome: "decline",
      rule: "agent_budget_exhausted",
      reason: `The agent budget of ${dollars(policy.maxAmountCents)} has been fully used.`,
      remainingBudgetCents: 0,
      remainingAgentCents: 0,
      remainingOverallCents: overallOut,
      limitedBy,
    };
  }

  // A merchant the bank has never seen, and the customer did not name: ask first.
  // A customer's confirmation resolves ONLY this question; every rule above still applies.
  const needsAsk = i.merchantStatus === "unknown" && !namedByCustomer;
  if (needsAsk && !i.customerConfirmed) {
    return {
      outcome: "ask_customer",
      rule: "unknown_merchant",
      reason: `This is the first time paying "${merchant.name}". Asking the customer to confirm before any money moves.`,
      remainingBudgetCents: agentRemaining,
      remainingAgentCents: agentRemaining,
      remainingOverallCents: overallOut,
    };
  }

  if (i.amountCents > remaining) {
    const reason =
      limitedBy === "overall" && cap
        ? `Your overall cap of ${dollars(cap.limitCents)} ${cap.periodLabel} leaves only ${dollars(remaining)} across all your agents, so ${dollars(remaining)} was approved instead of ${dollars(i.amountCents)}.`
        : `Only ${dollars(remaining)} is left in this agent's budget, so ${dollars(remaining)} was approved instead of ${dollars(i.amountCents)}.`;
    return {
      outcome: "approve_narrower",
      rule: limitedBy === "overall" ? "overall_cap_narrowed" : "agent_budget_narrowed",
      reason,
      approvedAmountCents: remaining,
      remainingBudgetCents: agentRemaining - remaining,
      remainingAgentCents: agentRemaining - remaining,
      remainingOverallCents: cap ? overallRemaining - remaining : undefined,
      limitedBy,
    };
  }

  const agentLeft = agentRemaining - i.amountCents;
  const overallLeft = cap ? overallRemaining - i.amountCents : undefined;
  const confirmed = needsAsk && i.customerConfirmed;
  const tail =
    `${dollars(agentLeft)} left in this agent's budget` +
    (overallLeft !== undefined ? ` and ${dollars(overallLeft)} left under your overall cap` : "") +
    ".";
  return {
    outcome: "approve",
    rule: confirmed ? "customer_confirmed" : "within_policy",
    reason: confirmed
      ? `The customer confirmed this payment to "${merchant.name}". ${tail}`
      : `Verified merchant and within the customer's policy. ${tail}`,
    approvedAmountCents: i.amountCents,
    remainingBudgetCents: agentLeft,
    remainingAgentCents: agentLeft,
    remainingOverallCents: overallLeft,
  };
}
