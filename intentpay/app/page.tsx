"use client";

import Link from "next/link";
import { HomeShell } from "@/app/components/Shell";
import { Button, Card } from "@/app/components/ui";
import { useSummary } from "@/app/components/useSummary";
import { dollars } from "@/lib/format";
import { ProfileToggle } from "@/app/components/ProfileToggle";
import { useProfile } from "@/lib/profile";
import { headroomCents, LEFT_LABEL } from "@/lib/headroom";
import { BUSINESS_NAME } from "@/lib/business-data";

function Account({ name, number, amount, note, amountLabel }: { name: string; number?: string; amount: string; note?: string; amountLabel?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-gray-900">{name}</span>
        <span className="text-base font-bold text-gray-900">{amount}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{number ?? note}</span>
        {number ? note && <span>{note}</span> : amountLabel && <span>{amountLabel}</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const { data } = useSummary(5000);
  const profile = useProfile();
  const active = data?.agents.filter((a) => a.status === "ACTIVE") ?? [];
  // Headroom: the smaller of the overall cap left and the sum of agent budgets left.
  const headroom = headroomCents(data?.agents ?? [], data?.overall);
  const agentCount = data?.registry?.filter((r) => r.status === "ACTIVE").length ?? 0;

  return (
    <HomeShell>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Accounts</h2>
          <Link href="/agent/new" className="text-xs font-medium text-text-primary">New account</Link>
        </div>

        <ProfileToggle />

        {profile === "business" ? (
          <Account name={`${BUSINESS_NAME} business account`} note="simulated demo data" amount="$48,210.55" />
        ) : (
          <>
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
          </>
        )}

        <Link href="/agent" className="block" data-demo="home-agent-row">
          <Account
            name="Agent Payment Control"
            amount={data ? dollars(headroom) : "…"}
            amountLabel={LEFT_LABEL[data?.overall?.period ?? "week"]}
            note={`${agentCount} ${agentCount === 1 ? "agent" : "agents"} · ${active.length} ${active.length === 1 ? "mandate" : "mandates"}`}
          />
        </Link>
      </Card>
    </HomeShell>
  );
}
