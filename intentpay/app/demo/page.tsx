"use client";

import { useState } from "react";
import { Shell } from "@/app/components/Shell";
import { Alert, Badge, Button, Card, ProgressBar, SectionTitle } from "@/app/components/ui";
import { PendingApprovals } from "@/app/components/PendingApprovals";
import { useSummary } from "@/app/components/useSummary";
import { dollars } from "@/lib/format";

type Step = {
  agent: string; merchant: string; category: string; amount: number; description?: string; note: string;
  kind?: "buy" | "netcancel" | "bankrevoke";
  fixedAmount?: boolean; // this purchase has a fixed price
  spoof?: "bad_signature" | "missing"; // an attacker using the agent's token without its secret
  lineItems?: string[]; // basket details, registered with the simulated network and fetched by the bank by reference
};

const SCENES: { id: string; title: string; blurb: string; steps: Step[] }[] = [
  {
    id: "A",
    title: "Scene A: the overall cap wins",
    blurb:
      "This week ChatGPT (personal) has spent $140 and Gemini (business) $100, so $60 is left under the single $300 cap that covers both sides. Gemini's own office supplies mandate still has $80, but the overall cap is tighter. No single agent token knows about the others; the bank also sees the customer's whole account.",
    steps: [
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 75, note: "Office supplies, within Gemini's own budget" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 10, note: "More office supplies" },
      { agent: "ChatGPT", merchant: "Qantas", category: "travel", amount: 100, fixedAmount: true, note: "A different agent on the personal side, same cap" },
    ],
  },
  {
    id: "B",
    title: "Scene B: new merchants and lookalikes",
    blurb:
      "Reset first. A supplier the bank has never seen is sent to you to confirm. A lookalike of a known supplier and a prohibited item are declined outright.",
    steps: [
      { agent: "Gemini", merchant: "Paper & Co", category: "office supplies", amount: 30, note: "New supplier" },
      { agent: "Gemini", merchant: "Offlceworks", category: "office supplies", amount: 20, note: "Lookalike of Officeworks" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 25, description: "Gift card bundle", note: "Prohibited item" },
    ],
  },
  {
    id: "C",
    title: "Scene C: cancel at the network vs revoke at the bank",
    blurb:
      "Cancelling at the network only stops future credentials, so a card that was already issued keeps working. A bank-side revoke blocks the very next payment. Reset first.",
    steps: [
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 20, note: "Normal purchase" },
      { kind: "netcancel", agent: "Gemini", category: "office supplies", merchant: "Network", amount: 0, note: "Cancel the instruction at the network only" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 20, note: "Already-issued card still works" },
      { kind: "bankrevoke", agent: "Gemini", category: "office supplies", merchant: "Bank", amount: 0, note: "Revoke at the bank" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 20, note: "Blocked immediately" },
    ],
  },
  {
    id: "D",
    title: "Scene D: AI consistency check (advisory)",
    blurb:
      "The rules decide first. The AI check only runs on payments the rules did not decline, and it can only make the outcome stricter. Reset first. Without a Gemini key a clearly labelled demo fixture stands in.",
    steps: [
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 12, lineItems: ["printer paper", "pens", "staples"], note: "Plain office supplies: passes" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 18, lineItems: ["printer paper", "a blender"], note: "Mixed basket: asks you" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 25, lineItems: ["55-inch TV"], note: "Right merchant, wrong basket: blocked" },
      { agent: "Gemini", merchant: "OFFICEWORKS*SYD", category: "office supplies", amount: 9, lineItems: ["printer paper", "pens"], note: "Messy descriptor: asks you, with an AI hint" },
    ],
  },
  {
    id: "E",
    title: "Scene E: fixed price vs flexible",
    blurb:
      "Office supplies are flexible, so a bank can approve less. A supplier invoice has one price, so a part-payment makes no sense: it is approved in full or declined. Reset first.",
    steps: [
      { agent: "Gemini", merchant: "Cloud hosting invoice", category: "supplier invoices", amount: 55, note: "Fixed price, more than the $50 left: declined" },
      { agent: "Gemini", merchant: "Domain renewal", category: "supplier invoices", amount: 12, note: "Fixed price that fits: approved" },
      { agent: "Gemini", merchant: "Officeworks", category: "office supplies", amount: 90, note: "Flexible: reduced instead of declined" },
    ],
  },
  {
    id: "F",
    title: "Scene F: a spoofed agent (simulated agent identity)",
    blurb:
      "Agent identity is established by the network, not the bank. An attacker holds ChatGPT's card token and claims to be ChatGPT, but cannot sign as ChatGPT. The network blocks it, and the bank still records the attempt. Real systems use cryptographic agent identity such as Visa's agent signatures or Mastercard's registered agent tokens. Reset first.",
    steps: [
      { agent: "ChatGPT", merchant: "Woolworths", category: "groceries", amount: 30, spoof: "bad_signature", note: "Spoofed 'ChatGPT', bad signature: blocked at the network" },
      { agent: "ChatGPT", merchant: "Woolworths", category: "groceries", amount: 30, spoof: "missing", note: "No signature at all: blocked at the network" },
      { agent: "ChatGPT", merchant: "Woolworths", category: "groceries", amount: 30, note: "The real ChatGPT, correctly signed: approved" },
    ],
  },
];

type Result = {
  key: number;
  step: Step;
  outcome?: string;
  reason: string;
  approved?: number;
  declinedBy?: string;
  limitedBy?: string;
  ai?: { reason: string; source?: string };
  error?: boolean;
};

const BADGE: Record<string, { text: string; color: "success" | "warning" | "danger" | "info" }> = {
  approve: { text: "Approved", color: "success" },
  approve_narrower: { text: "Approved (reduced)", color: "info" },
  ask_customer: { text: "Needs your OK", color: "warning" },
  decline: { text: "Declined", color: "danger" },
};

export default function DemoPage() {
  const { data, reload } = useSummary(2000);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [next, setNext] = useState<Record<string, number>>({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });

  async function runStep(sceneId: string, step: Step) {
    const policy = data?.agents.find((a) => a.agentName === step.agent && a.category === step.category && (a.status === "ACTIVE" || step.kind === undefined));
    const key = Date.now() + Math.random();
    if (!policy) {
      setResults((r) => [{ key, step, reason: `${step.agent} has no active ${step.category} mandate. Press Reset demo.`, error: true }, ...r]);
      return;
    }
    if (step.kind === "netcancel" || step.kind === "bankrevoke") {
      const r = await fetch("/api/demo/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyId: policy.id, mode: step.kind === "netcancel" ? "network_only" : "bank" }),
      });
      setResults((rs) => [
        {
          key, step, error: !r.ok,
          reason: step.kind === "netcancel"
            ? "Instruction cancelled at the network. The card that was already issued is still active."
            : "Revoked at the bank. The network has not been told yet, but the bank will now refuse every payment.",
        },
        ...rs,
      ]);
      setNext((n) => ({ ...n, [sceneId]: (n[sceneId] ?? 0) + 1 }));
      reload();
      return;
    }
    try {
      const res = await fetch("/api/demo/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyId: policy.id, merchant: step.merchant, category: step.category,
          amount: step.amount, description: step.description, lineItems: step.lineItems, fixedAmount: step.fixedAmount, spoof: step.spoof,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Purchase failed");
      setResults((r) => [
        { key, step, outcome: d.outcome, reason: d.reason, approved: d.approved_amount, declinedBy: d.declined_by, limitedBy: d.limited_by, ai: d.ai },
        ...r,
      ]);
    } catch (e) {
      setResults((r) => [{ key, step, reason: e instanceof Error ? e.message : "Purchase failed", error: true }, ...r]);
    }
    setNext((n) => ({ ...n, [sceneId]: (n[sceneId] ?? 0) + 1 }));
    reload();
  }

  async function runNext(scene: (typeof SCENES)[number]) {
    const i = next[scene.id] ?? 0;
    if (i >= scene.steps.length) return;
    setRunning(true);
    await runStep(scene.id, scene.steps[i]);
    setRunning(false);
  }

  async function reset() {
    setRunning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Reset failed");
      setResults([]);
      setNext({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
      setNotice(
        d.networkReset
          ? "Demo reset. ChatGPT, Gemini and Perplexity re-created with their mandates, $240 already spent this week and a $300 per week overall cap."
          : "Bank data reset, but the simulated card network is not running. Start it (node server.mjs in /network), then press Reset demo again."
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Reset failed");
    }
    setRunning(false);
    reload();
  }

  const o = data?.overall;
  const used = o && o.limitCents > 0 ? (o.spentCents / o.limitCents) * 100 : 0;

  return (
    <Shell back="/agent" tab="Cards">
      <Alert look="info" heading="Simulated card network">
        The card network in this demo is a stand-in service (network/server.mjs), including its agent registry and agent signatures. Every payment goes agent, then network, then the bank&apos;s
        decision at /api/bank/decide. No real money or real card scheme is involved.
      </Alert>

      {notice && <Alert look="info">{notice}</Alert>}

      {o && (
        <Card className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-gray-900">Overall cap, all agents</span>
            <span className="font-semibold text-gray-900">{dollars(o.remainingCents)} left of {dollars(o.limitCents)}</span>
          </div>
          <ProgressBar value={used} aria-label="Overall cap used" />
          <ul className="space-y-1 pt-1 text-xs text-gray-600">
            {data?.agents.filter((a) => a.status === "ACTIVE").map((a) => (
              <li key={a.id} className="flex justify-between">
                <span>{a.agentName ?? "Agent"}: {a.merchant || a.category}</span>
                <span>{dollars(a.remainingCents)} left of {dollars(a.limitCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PendingApprovals items={data?.pending ?? []} onChanged={reload} />

      {SCENES.map((s) => {
        const i = next[s.id] ?? 0;
        const done = i >= s.steps.length;
        const step = s.steps[i];
        return (
          <Card key={s.id} className="space-y-3">
            <div>
              <p className="text-base font-semibold text-gray-900">{s.title}</p>
              <p className="text-sm text-gray-600">{s.blurb}</p>
            </div>
            <ol className="space-y-1 text-sm">
              {s.steps.map((st, idx) => (
                <li key={idx} className={idx < i ? "text-gray-400 line-through" : idx === i ? "font-medium text-gray-900" : "text-gray-600"}>
                  {st.kind ? st.note : `${st.agent}: ${st.merchant} ${dollars(st.amount * 100)} (${st.note})`}
                </li>
              ))}
            </ol>
            <Button look="primary" size="medium" block disabled={running || done} onClick={() => runNext(s)}>
              {done ? "Scene finished. Reset to run again" : `Run step ${i + 1}: ${step.kind ? step.note : step.merchant}`}
            </Button>
          </Card>
        );
      })}

      <Button look="faint" size="medium" block onClick={reset} disabled={running}>Reset demo</Button>

      <SectionTitle>What the bank decided</SectionTitle>
      {results.length === 0 && <p className="text-sm text-gray-600">Run a step to see the decision and the reason.</p>}
      <ul className="space-y-2">
        {results.map((r) => {
          const b = r.outcome ? BADGE[r.outcome] ?? { text: r.outcome, color: "info" as const } : null;
          return (
            <li key={r.key}>
              <Card className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-900">{r.step.kind ? r.step.note : `${r.step.agent}: ${r.step.merchant}`}</span>
                  {!r.step.kind && (
                    <span className="text-sm font-semibold text-gray-900">
                      {dollars(Math.round((r.approved ?? r.step.amount) * 100))}
                    </span>
                  )}
                </div>
                {b ? <Badge color={b.color}>{b.text}</Badge> : r.step.kind && !r.error ? <Badge color="info">Done</Badge> : <Badge color="danger">Error</Badge>}
                <p className="text-sm text-gray-700">{r.reason}</p>
                {r.declinedBy && <p className="text-xs text-gray-500">Declined by the {r.declinedBy}</p>}
                {r.ai && <p className="text-xs text-gray-600"><span className="font-semibold">AI check:</span> {r.ai.reason}{r.ai.source === "fixture" ? " (demo fixture, no Gemini key)" : ""}</p>}
                {r.limitedBy && (
                  <p className="text-xs font-medium text-gray-500">
                    Limit applied: {r.limitedBy === "overall" ? "Overall cap (all agents)" : "This agent's budget"}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
