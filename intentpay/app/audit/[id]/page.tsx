"use client";

import { sideOf } from "@/lib/sides";
import { Suspense, use, useEffect, useState } from "react";
import { Shell } from "@/app/components/Shell";
import { Alert, Badge, Card, SectionTitle } from "@/app/components/ui";
import { dollars } from "@/lib/format";

type Audit = {
  receipt: { id: string; outcome: string; reason: string; rule: string | null; token: string | null; merchant: string | null; amountCents: number; createdAt: string };
  delegatedBy: string;
  agentName: string | null;
  mandate: { prompt: string; limit: string; category: string; merchant: string; prohibited: string[]; status: string } | null;
  network: Record<string, string | null> | null;
  ai: { reason: string; source?: string } | null;
  timeline: { at: string; title: string; detail?: string; tag?: string }[];
};

const COLOR: Record<string, "success" | "warning" | "danger" | "info"> = {
  approve: "success", approve_narrower: "info", ask_customer: "warning", decline: "danger",
};

// With Cache Components the route params must be read inside a Suspense boundary.
export default function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Shell back="/agent" tab="Cards"><p className="text-sm text-gray-600">Loading…</p></Shell>}>
      <AuditDetail params={params} />
    </Suspense>
  );
}

function AuditDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Audit | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/audit/${id}`).then(async (r) => (r.ok ? setData(await r.json()) : setError(true))).catch(() => setError(true));
  }, [id]);

  if (error) return <Shell back="/agent" tab="Cards"><Alert look="danger">We could not find that receipt.</Alert></Shell>;
  if (!data) return <Shell back="/agent" tab="Cards"><p className="text-sm text-gray-600">Loading…</p></Shell>;
  const r = data.receipt;

  return (
    <Shell back="/agent" tab="Cards">
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold text-gray-900">{r.merchant ?? "Unknown merchant"}</p>
          <span className="text-base font-bold text-gray-900">{dollars(r.amountCents)}</span>
        </div>
        <Badge color={COLOR[r.outcome] ?? "info"}>{r.outcome.replace("_", " ")}</Badge>
        <p className="text-sm text-gray-700">{r.reason}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-xs text-gray-600">
          <dt>Receipt</dt><dd className="font-mono">{r.id}</dd>
          <dt>Delegated by</dt><dd>{data.delegatedBy}</dd>
          {data.agentName && (<><dt>Agent</dt><dd>{data.agentName}{sideOf(data.agentName) && ` · ${sideOf(data.agentName)}`}</dd></>)}
          {r.token && (<><dt>Token</dt><dd className="font-mono">{r.token}</dd></>)}
          {r.rule && (<><dt>Rule fired</dt><dd className="font-mono">{r.rule}</dd></>)}
        </dl>
      </Card>

      {data.mandate && (
        <Card className="space-y-1">
          <p className="text-sm font-medium text-gray-900">Mandate that applied</p>
          <p className="text-sm text-gray-700">&ldquo;{data.mandate.prompt}&rdquo;</p>
          <p className="text-xs text-gray-600">
            {data.mandate.limit}, {data.mandate.category}, {data.mandate.merchant}
            {data.mandate.prohibited.length > 0 && `, never: ${data.mandate.prohibited.join(", ")}`} ({data.mandate.status.toLowerCase()})
          </p>
        </Card>
      )}

      <SectionTitle>Timeline</SectionTitle>
      <ol data-demo="timeline" className="space-y-3 border-l-2 border-gray-200 pl-4">
        {data.timeline.map((e, i) => (
          <li key={i} className="space-y-0.5">
            <p className="text-xs text-gray-500">{new Date(e.at).toLocaleString("en-AU")}</p>
            <p className="text-sm font-medium text-gray-900">{e.title}</p>
            {e.detail && <p className="text-sm text-gray-700">{e.detail}</p>}
            {e.tag && <Badge color="muted">{e.tag}</Badge>}
          </li>
        ))}
      </ol>

      {data.network && (
        <Card className="space-y-1">
          <p className="text-sm font-medium text-gray-900">Network fields (simulated)</p>
          <p className="text-xs text-gray-500">
            Modelled loosely on public descriptions of Visa Intelligent Commerce and Mastercard Agent Pay. Not a live integration.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-600">
            {Object.entries(data.network).filter(([k]) => k !== "simulated").map(([k, v]) => (
              <div key={k} className="contents"><dt>{k.replaceAll("_", " ")}</dt><dd className="font-mono">{String(v ?? "none")}</dd></div>
            ))}
          </dl>
        </Card>
      )}
    </Shell>
  );
}
