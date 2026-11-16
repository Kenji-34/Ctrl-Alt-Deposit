"use client";

import Link from "next/link";
import { HomeShell } from "@/app/components/Shell";
import { Button, Card } from "@/app/components/ui";
import { useSummary } from "@/app/components/useSummary";
import { dollars } from "@/lib/format";

function Account({ name, number, amount, note }: { name: string; number: string; amount: string; note?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-gray-900">{name}</span>
        <span className="text-base font-bold text-gray-900">{amount}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{number}</span>
        {note && <span>{note}</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const { data } = useSummary(5000);
  const active = data?.agents.filter((a) => a.status === "ACTIVE") ?? [];
  const budgetLeft = active.reduce((sum, a) => sum + a.remainingCents, 0);

  return (
    <HomeShell>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Accounts</h2>
          <Link href="/agent/new" className="text-xs font-medium text-text-primary">New account</Link>
        </div>

        <Account name="Westpac Life" number="123-456 12345678" amount="$12,450.32" />

        <div className="rounded-md border border-gray-200 bg-white">
          <div className="p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-gray-900">Altitude Black Mastercard</span>
              <span className="text-base font-bold text-gray-900">-$1,432.01</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>123-456 12345678</span>
              <span>avail $14,469.95</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-b-md bg-gray-100 px-3 py-2 text-xs text-gray-600">
            <span>Min of $46.30 due tomorrow</span>
            <Button look="faint" size="small">Pay now</Button>
          </div>
        </div>

        <Link href="/agent" className="block">
          <Account
            name="AI Agent Service"
            number="123-456 12345678"
            amount={dollars(budgetLeft)}
            note={`${active.length} active agent ${active.length === 1 ? "card" : "cards"}`}
          />
        </Link>
      </Card>
    </HomeShell>
  );
}
