export type Period = "week" | "month" | "once";

export type Agent = {
  id: string;
  prompt: string;
  status: "ACTIVE" | "REVOKED" | string;
  merchant: string;
  category: string;
  period: Period;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  prohibitedItems: string[];
  token: string | null;
  tokenStatus: string | null;
  expiry: string | null;
};

export type Activity = {
  id: string;
  policyId: string | null;
  merchant: string | null;
  category: string | null;
  amountCents: number;
  approvedCents: number;
  outcome: "approve" | "approve_narrower" | "ask_customer" | "decline" | string;
  reason: string;
  declinedBy: string | null;
  createdAt: string;
};

export type Summary = { agents: Agent[]; activity: Activity[] };
