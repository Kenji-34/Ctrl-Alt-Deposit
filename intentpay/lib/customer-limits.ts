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

// Approved spend across EVERY agent (including revoked ones: money that moved still counts).
export function customerSpentCents(period: Period): number {
  const r = db
    .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS t FROM transactions WHERE status = 'APPROVED' AND created_at >= ?`)
    .get(windowStart(period)) as { t: number };
  return r.t;
}

export function customerCapInput(customerId = DEMO_CUSTOMER) {
  const l = getCustomerLimit(customerId);
  return {
    limitCents: l.limitCents,
    spentCents: customerSpentCents(l.period),
    periodLabel: periodLabel(l.period),
  };
}
