"use client";

import Link from "next/link";
import { Shell } from "@/app/components/Shell";
import { AgentSection } from "@/app/components/AgentSection";
import { PendingApprovals } from "@/app/components/PendingApprovals";
import { AgentRegistry } from "@/app/components/AgentRegistry";
import { OverallCap } from "@/app/components/OverallCap";
import { ActivityList } from "@/app/components/ActivityList";
import { Alert, Button, Card, SectionTitle } from "@/app/components/ui";
import { useSummary } from "@/app/components/useSummary";
import { dollars } from "@/lib/format";
import { sideOf } from "@/lib/sides";
import { ProfileToggle } from "@/app/components/ProfileToggle";
import { headroomCents, LEFT_LABEL } from "@/lib/headroom";

export default function AgentPage() {
  const { data, error, reload } = useSummary();
  // Same number as Home: the smaller of the overall cap left and the agents' budgets left.
  const headroom = headroomCents(data?.agents ?? [], data?.overall);

  return (
    <Shell back="/" tab="Cards">
      <ProfileToggle />
      {error && <Alert look="danger">Could not load your agent cards.</Alert>}

      <Card data-demo="service-card">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Agent Payment Control</p>
            <p className="text-xs text-gray-500">{LEFT_LABEL[data?.overall?.period ?? "week"]}</p>
            <p className="text-xs text-gray-500">The smaller of your overall cap and your agents&apos; budgets.</p>
          </div>
          <span className="text-lg font-bold text-gray-900">{data ? dollars(headroom) : "…"}</span>
        </div>
        <div className="mt-3 flex justify-end">
          <Link href="/agent/new">
            <Button look="primary" size="small" data-demo="add-mandate">Add mandate</Button>
          </Link>
        </div>
      </Card>

      {data?.overall && <OverallCap key={`${data.overall.limitCents}-${data.overall.period}`} overall={data.overall} onChanged={reload} />}

      <PendingApprovals items={data?.pending ?? []} onChanged={reload} />
      
      <SectionTitle>Your AI agents</SectionTitle>
      {data && (data.registry?.length ?? 0) === 0 && <p className="text-sm text-gray-600">You have no agents yet.</p>}
      {data?.registry?.map((r) => (
        <AgentSection key={r.id} agent={r} mandates={data.agents.filter((m) => m.agentId === r.id)} onChanged={reload} />
      ))}
      {/* Mandates not attached to a registered agent (created before agents existed) */}
      {data && data.agents.some((m) => !m.agentId) && (
        <AgentSection
          agent={{ id: "unassigned", name: "Unassigned mandates", type: "No agent", status: "REVOKED", activeMandates: 0 }}
          mandates={data.agents.filter((m) => !m.agentId)}
          onChanged={reload}
        />
      )}
      <AgentRegistry onChanged={reload} />

      <SectionTitle>Transactions</SectionTitle>
      <ActivityList
        items={data?.activity ?? []}
        sideOf={(policyId) => sideOf(data?.agents.find((m) => m.id === policyId)?.agentName)}
      />

      <p className="pt-4 text-center text-xs text-gray-500">
        <Link href="/demo" className="underline">Open the demo scenarios</Link>
      </p>
    </Shell>
  );
}
