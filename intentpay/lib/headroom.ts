// How much the customer can still spend through their agents right now: the smaller of
// (a) the overall cap's remaining room and (b) the sum of the active agents' remaining budgets.
// Home and the Cards screen both use this one number, so they can never disagree.
export type Period = "week" | "month" | "once";

export function headroomCents(
  agents: { status: string; remainingCents: number }[],
  overall?: { remainingCents: number } | null
): number {
  const budgetLeft = agents.filter((a) => a.status === "ACTIVE").reduce((sum, a) => sum + a.remainingCents, 0);
  return overall ? Math.min(overall.remainingCents, budgetLeft) : budgetLeft;
}

export const LEFT_LABEL: Record<Period, string> = { week: "left this week", month: "left this month", once: "left in total" };
