// SIMULATED demo data for the business profile: "Harbour Print Co", an invented small business.
// Every supplier, payee, amount and balance below is made up for the demo. No real brand or account is involved.
// Kept free of imports so both the seed (lib/demo.ts) and the rule-engine tests read the same numbers.

export const BUSINESS_CUSTOMER = "harbour-print-co";
export const BUSINESS_NAME = "Harbour Print Co";
export const BUSINESS_CAP_CENTS = 200000; // $2,000 per week across ALL the business's agents
export const BUSINESS_PERIOD = "week" as const;

export type BusinessMandate = {
  prompt: string;
  maxAmountCents: number; // budget for the period
  perOrderMaxCents?: number;
  category: string;
  period: "week" | "month";
  amountType: "flexible" | "fixed";
  prohibitedItems: string[];
  history: { merchant: string; cents: number }[]; // simulated spend already made this period
};

export type BusinessAgent = { id: string; name: string; mandates: BusinessMandate[] };

export const BUSINESS_AGENTS: BusinessAgent[] = [
  {
    id: "agent_procurement",
    name: "Procurement agent",
    mandates: [
      {
        prompt: "Order office and print supplies from approved suppliers. Fixed-price orders only, up to $300 per order and $900 a week.",
        maxAmountCents: 90000, perOrderMaxCents: 30000, category: "print supplies", period: "week", amountType: "fixed",
        prohibitedItems: [],
        history: [{ merchant: "Northside Paper Supply", cents: 42000 }, { merchant: "Kestrel Toner Depot", cents: 18000 }], // $600
      },
    ],
  },
  {
    id: "agent_marketing",
    name: "Marketing agent",
    mandates: [
      {
        prompt: "Pay for ads and domain names, any amount, up to $500 a week.",
        maxAmountCents: 50000, category: "marketing", period: "week", amountType: "flexible",
        prohibitedItems: [],
        history: [{ merchant: "Brightline Ads", cents: 15000 }], // $150
      },
    ],
  },
  {
    id: "agent_billpay",
    name: "Bill-pay agent",
    mandates: [
      {
        prompt: "Pay supplier invoices from known payees only, in full, up to $1,500 a month. Never pay a new payee on your own.",
        maxAmountCents: 150000, category: "supplier invoices", period: "month", amountType: "fixed",
        prohibitedItems: [],
        history: [{ merchant: "Tidewater Freight", cents: 60000 }, { merchant: "Calder Packaging", cents: 35000 }], // $950
      },
    ],
  },
];

// Seeded spend this week across all three agents: $600 + $150 + $950 = $1,700, so $300 is left under the $2,000 cap.
// Marketing alone still has $350 of its own $500, so a bigger Marketing purchase hits the overall cap first.

// Simulated suppliers and payees the bank's (stub) merchant database treats as verified.
export const BUSINESS_MERCHANTS = [
  "northside paper supply", "kestrel toner depot", "brightline ads", "quillnet domains",
  "tidewater freight", "calder packaging",
];
