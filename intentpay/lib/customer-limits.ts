// The customer-wide cap across all of a customer's agents.
// Only counts spending that went through this bank's /api/bank/decide.
import db from "@/lib/db";
import { windowStart, periodLabel, type Period } from "@/lib/budget";

export const DEMO_CUSTOMER = "demo-customer";
export const DEFAULT_LIMIT_CENTS = 30000; // $300
export const DEFAULT_PERIOD: Period = "week";

export type CustomerLimit = { limitCents: number; period: Period };

export function getCustomerLimit(customerId = DEMO_CUSTOMER): CustomerLimit {
  const row = db
    .prepare(`SELECT limit_cents, period FROM customer_limits WHERE customer_id = ?`)
    .get(customerId) as { limit_cents: number; period: Period } | undefined;
  return row
    ? { limitCents: row.limit_cents, period: row.period }
    : { limitCents: DEFAULT_LIMIT_CENTS, period: DEFAULT_PERIOD };
}

export function setCustomerLimit(limitCents: number, period: Period, customerId = DEMO_CUSTOMER) {
  db.prepare(`
    INSERT INTO customer_limits (customer_id, limit_cents, period, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET
      limit_cents = excluded.limit_cents, period = excluded.period, updated_at = excluded.updated_at
  `).run(customerId, limitCents, period, new Date().toISOString());
}

// Which customer owns a policy (through its agent). Policies with no agent belong to the original demo customer.
export function customerOfPolicy(policyId: string): string {
  const row = db
    .prepare(`SELECT a.customer_id AS c FROM policies p LEFT JOIN agents a ON a.id = p.agent_id WHERE p.id = ?`)
    .get(policyId) as { c: string | null } | undefined;
  return row?.c ?? DEMO_CUSTOMER;
}

// Read the optional ?customer= query parameter. Anything missing or malformed means the original demo customer,
// so existing callers behave exactly as before.
export function customerFromUrl(url: string): string {
  const c = new URL(url, "http://localhost").searchParams.get("customer");
  return c && /^[a-z0-9-]{1,40}$/.test(c) ? c : DEMO_CUSTOMER;
}

// Approved spend across EVERY agent of ONE customer (including revoked ones: money that moved still counts).
// Spend belonging to another customer never counts against this customer's cap.
export function customerSpentCents(period: Period, customerId = DEMO_CUSTOMER): number {
  const r = db
    .prepare(`
      SELECT COALESCE(SUM(t.amount_cents), 0) AS t
      FROM transactions t
      LEFT JOIN policies p ON p.id = t.policy_id
      LEFT JOIN agents a ON a.id = p.agent_id
      WHERE t.status = 'APPROVED' AND t.created_at >= ? AND COALESCE(a.customer_id, ?) = ?
    `)
    .get(windowStart(period), DEMO_CUSTOMER, customerId) as { t: number };
  return r.t;
}

export function customerCapInput(customerId = DEMO_CUSTOMER) {
  const l = getCustomerLimit(customerId);
  return {
    limitCents: l.limitCents,
    spentCents: customerSpentCents(l.period, customerId),
    periodLabel: periodLabel(l.period),
  };
}
