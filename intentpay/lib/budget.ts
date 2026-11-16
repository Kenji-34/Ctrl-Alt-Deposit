// Budget window for a policy. "week" and "month" are rolling windows, "once" never resets.
export type Period = "week" | "month" | "once";

export function windowStart(period: Period): string {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (period === "week") return new Date(now - 7 * day).toISOString();
  if (period === "month") return new Date(now - 30 * day).toISOString();
  return new Date(0).toISOString();
}

export function periodLabel(period: Period): string {
  return period === "week" ? "per week" : period === "month" ? "per month" : "in total";
}
