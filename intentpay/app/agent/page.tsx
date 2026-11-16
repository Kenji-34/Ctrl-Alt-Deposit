"use client";

import Link from "next/link";
import { Shell } from "@/app/components/Shell";
import { AgentCard } from "@/app/components/AgentCard";
import { OverallCap } from "@/app/components/OverallCap";
import { ActivityList } from "@/app/components/ActivityList";
import { Alert, Button, Card, SectionTitle } from "@/app/components/ui";
import { useSummary } from "@/app/components/useSummary";
import { dollars } from "@/lib/format";

export default function AgentPage() {
  const { data, error, reload } = useSummary();
  const active = data?.agents.filter((a) => a.status === "ACTIVE") ?? [];
  const budgetLeft = active.reduce((sum, a) => sum + a.remainingCents, 0);

  return (
    <Shell back="/" tab="Cards">
      {error && <Alert look="danger">Could not load your agent cards.</Alert>}

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">AI Agent Service</p>
            <p className="text-xs text-gray-500">Budget left</p>
          </div>
          <span className="text-lg font-bold text-gray-900">{dollars(budgetLeft)}</span>
        </div>
        <div className="mt-3 flex justify-end">
          <Link href="/agent/new">
            <Button look="primary" size="small">Add Policy</Button>
          </Link>
        </div>
      </Card>

      {data?.overall && <OverallCap key={`${data.overall.limitCents}-${data.overall.period}`} overall={data.overall} onChanged={reload} />}

      <SectionTitle>Agent cards</SectionTitle>
      {data && data.agents.length === 0 && <p className="text-sm text-gray-600">You have no agent cards yet.</p>}
      {data?.agents.map((a) => <AgentCard key={a.id} agent={a} onChanged={reload} />)}

      <SectionTitle>Transactions</SectionTitle>
      <ActivityList items={data?.activity ?? []} />
    </Shell>
  );
}
