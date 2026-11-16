// Bank-side decision logic for agent payments.
// Pure function: no database or network access, so it is easy to test.
// The route handlers under app/api/bank do the I/O and call this.

export type Outcome =
  | "approve"
  | "approve_narrower"
  | "ask_customer"
  | "decline";

export type MerchantStatus = "verified" | "lookalike" | "unknown";

// Matches the fields of PolicySchema that the decision needs.
export type PolicyLike = {
  maxAmountCents: number;
  currency: string;
  merchant: string;
  category: string;
  prohibitedItems: string[];
  needsClarification: boolean;
};

export type DecideInput = {
  policy: PolicyLike | null; // null = policy missing or not ACTIVE
  spentCents: number; // already approved against this policy
  amountCents: number;
  currency: string;
  merchant: { name: string; category: string };
  merchantStatus: MerchantStatus;
  description?: string;
};

export type Decision = {
  outcome: Outcome;
  reason: string; // plain English, shown to the customer
  approvedAmountCents?: number;
  remainingBudgetCents?: number;
};

const norm = (s: string) => s.trim().toLowerCase();
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function decide(i: DecideInput): Decision {
  const { policy, merchant } = i;

  if (!policy) {
    return { outcome: "decline", reason: "There is no active policy for this agent." };
  }
  if (policy.needsClarification) {
    return { outcome: "decline", reason: "The customer's policy still needs clarification." };
  }
  if (norm(i.currency) !== norm(policy.currency)) {
    return {
      outcome: "decline",
      reason: `${i.currency} payments are not covered by this policy (${policy.currency} only).`,
    };
  }

  // Merchant identity: the network cannot see this, only the bank can.
  if (i.merchantStatus === "lookalike") {
    return {
      outcome: "decline",
      reason: `"${merchant.name}" closely imitates a known merchant and is not verified, so it was blocked to protect the customer.`,
    };
  }

  const namedByCustomer =
    policy.merchant !== "" && norm(merchant.name) === norm(policy.merchant);

  if (policy.merchant !== "" && !namedByCustomer) {
    return {
      outcome: "decline",
      reason: `${merchant.name} is not the merchant the customer authorised (${policy.merchant}).`,
    };
  }
  if (policy.category !== "general" && norm(merchant.category) !== norm(policy.category)) {
    return {
      outcome: "decline",
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
      reason: `The purchase mentions '${blocked}', which the customer prohibited.`,
    };
  }

  const remaining = policy.maxAmountCents - i.spentCents;
  if (remaining <= 0) {
    return {
      outcome: "decline",
      reason: `The policy budget of ${dollars(policy.maxAmountCents)} has been fully used.`,
      remainingBudgetCents: 0,
    };
  }

  // A merchant the bank has never seen, and the customer did not name: ask first.
  if (i.merchantStatus === "unknown" && !namedByCustomer) {
    return {
      outcome: "ask_customer",
      reason: `This is the first time paying "${merchant.name}". Asking the customer to confirm before any money moves.`,
      remainingBudgetCents: remaining,
    };
  }

  if (i.amountCents > remaining) {
    return {
      outcome: "approve_narrower",
      reason: `Only ${dollars(remaining)} is left in the budget, so ${dollars(remaining)} was approved instead of ${dollars(i.amountCents)}.`,
      approvedAmountCents: remaining,
      remainingBudgetCents: 0,
    };
  }

  return {
    outcome: "approve",
    reason: `Verified merchant and within the customer's policy. ${dollars(remaining - i.amountCents)} left in the budget.`,
    approvedAmountCents: i.amountCents,
    remainingBudgetCents: remaining - i.amountCents,
  };
}
