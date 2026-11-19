import { getCustomerLimit, setCustomerLimit, customerSpentCents, customerFromUrl } from "@/lib/customer-limits";

// Optional ?customer=<id>; omitted = the original demo customer.
export async function GET(request: Request) {
  const customerId = customerFromUrl(request.url);
  const l = getCustomerLimit(customerId);
  const spent = customerSpentCents(l.period, customerId);
  return Response.json({
    limitCents: l.limitCents,
    period: l.period,
    spentCents: spent,
    remainingCents: Math.max(0, l.limitCents - spent),
  });
}

export async function PUT(request: Request) {
  const customerId = customerFromUrl(request.url);
  const b = await request.json().catch(() => ({}));
  const cents = Math.round(Number(b.limit) * 100);
  const period = b.period;
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000) {
    return Response.json({ error: "Enter a limit above $0." }, { status: 400 });
  }
  if (!["week", "month", "once"].includes(period)) {
    return Response.json({ error: "Period must be week, month or once." }, { status: 400 });
  }
  setCustomerLimit(cents, period, customerId);
  return Response.json({ ok: true });
}
