import { Badge } from "@/app/components/ui";
import { dollars } from "@/lib/format";
import type { Activity } from "./types";

const LABEL: Record<string, { text: string; color: "success" | "warning" | "danger" | "info" }> = {
  approve: { text: "Approved", color: "success" },
  approve_narrower: { text: "Approved (reduced)", color: "info" },
  ask_customer: { text: "Needs your OK", color: "warning" },
  decline: { text: "Declined", color: "danger" },
};

const dayHeading = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

export function ActivityList({ items }: { items: Activity[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-600">No activity yet. When your agent tries to pay, it shows up here.</p>;
  }

  // Group by day, newest first (the API already sorts newest first).
  const groups: { day: string; rows: Activity[] }[] = [];
  for (const a of items) {
    const day = dayHeading(a.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(a);
    else groups.push({ day, rows: [a] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.day}>
          <p className="mb-1 text-sm font-semibold text-gray-900">{g.day}</p>
          <ul className="divide-y divide-gray-200 border-y border-gray-200">
            {g.rows.map((a) => {
              const l = LABEL[a.outcome] ?? { text: a.outcome, color: "info" as const };
              const shown =
                a.outcome === "decline" || a.outcome === "ask_customer" ? a.amountCents : a.approvedCents || a.amountCents;
              return (
                <li key={a.id} className="space-y-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-900">{a.merchant ?? "Unknown merchant"}</span>
                    <span className="text-sm font-semibold text-gray-900">{dollars(shown)}</span>
                  </div>
                  <Badge color={l.color}>{l.text}</Badge>
                  <p className="text-sm text-gray-700">{a.reason}</p>
                  {a.limitedBy && (a.outcome === "decline" || a.outcome === "approve_narrower") && (
                    <p className="text-xs font-medium text-gray-500">
                      Limit applied: {a.limitedBy === "overall" ? "Overall cap (all agents)" : "This agent's budget"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
