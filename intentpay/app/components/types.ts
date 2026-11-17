export type Period = "week" | "month" | "once";

export type Agent = {
  id: string;
  agentId?: string | null;
  agentName?: string | null;
  prompt: string;
  status: "ACTIVE" | "REVOKED" | string;
  merchant: string;
  category: string;
  amountType?: "flexible" | "fixed";
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
  rule?: string | null;
  limitedBy?: "agent" | "overall" | string | null;
  ai?: { status: string; reason: string; source?: string; effect?: string; enrichmentUsed?: boolean } | null;
  createdAt: string;
};

export type Overall = {
  limitCents: number;
  period: Period;
  spentCents: number;
  remainingCents: number;
};

export type Pending = {
  id: string;
  policyId: string;
  agentName: string | null;
  merchant: string;
  category: string;
  amountCents: number;
  createdAt: string;
  aiNote?: string | null;
};

export type RegistryAgent = {
  id: string; name: string; type?: string; status: string; activeMandates: number;
  networkAgentId?: string | null;
  verified?: boolean; // identity verified by the (simulated) network
};

export type Summary = {
  agents: Agent[];
  activity: Activity[];
  overall?: Overall;
  pending?: Pending[];
  registry?: RegistryAgent[];
};
