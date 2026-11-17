"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Select, Textarea } from "@/app/components/ui";
import { Shell } from "@/app/components/Shell";
import { periodLabel } from "@/lib/budget";
import { dollars, shortDate } from "@/lib/format";
import type { Period } from "@/app/components/types";

const GOALS = [
  { title: "Weekly groceries", text: "Buy groceries at Woolworths, up to $50 a week" },
  { title: "Supplier invoices", text: "Pay supplier invoices for the business, up to $80 a month" },
  { title: "One-off purchase", text: "Make one purchase of up to $100" },
  { title: "Something else", text: "" },
];

const CATEGORIES = ["groceries", "office supplies", "supplier invoices", "subscriptions", "travel", "dining", "transport", "general"];
const DEFAULT_PROHIBITED = "gift card, alcohol";
const TOKEN_DAYS = 30;

type Draft = {
  merchant: string;
  category: string;
  limit: string; // dollars, as typed
  period: Period;
  prohibited: string;
  amountType: "flexible" | "fixed";
};

const EMPTY: Draft = { merchant: "", category: "general", limit: "", period: "week", prohibited: DEFAULT_PROHIBITED, amountType: "flexible" };

export default function NewAgentCard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const limitNum = Number(draft.limit);
  const limitOk = Number.isFinite(limitNum) && limitNum > 0;
  const broad = draft.category === "general" && !draft.merchant.trim();
  // Set after the page loads (a changing value like the current time can't be rendered on the server).
  const [expiry, setExpiry] = useState("");
  useEffect(() => {
    setExpiry(new Date(Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString());
  }, []);
  const expiryText = expiry ? shortDate(expiry) : "";

  // Which registered agent this card is for.
  const [agents, setAgents] = useState<{ id: string; name: string; status: string }[]>([]);
  const [agentId, setAgentId] = useState("");
  useEffect(() => {
    fetch("/api/agent/summary")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.registry ?? []).filter((a: { status: string }) => a.status === "ACTIVE");
        setAgents(list);
        if (list.length > 0) setAgentId((cur) => cur || list[0].id);
      })
      .catch(() => {});
  }, []);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => {
      const next = { ...d, [k]: v };
      // Subscriptions, supplier invoices and flights have a set price, so they default to fixed.
      if (k === "category") next.amountType = v === "subscriptions" || v === "supplier invoices" || v === "travel" ? "fixed" : "flexible";
      return next;
    });
  }

  async function readRules() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/policy/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      const p = data.policy;
      setDraft({
        merchant: p.merchant ?? "",
        category: p.category || "general",
        limit: p.maxAmountCents > 0 ? String(p.maxAmountCents / 100) : "",
        period: p.period ?? "once",
        amountType: p.amountType === "fixed" ? "fixed" : "flexible",
        prohibited: p.prohibitedItems?.length ? p.prohibitedItems.join(", ") : DEFAULT_PROHIBITED,
      });
      if (data.source === "fixture") setNotice("The AI reader is offline, so we filled in what we could from your sentence. Please check every rule.");
      setQuestion(p.needsClarification ? p.clarificationQuestion || "How much can the agent spend?" : "");
    } catch {
      setNotice("We couldn't read that automatically. Please fill in the rules below.");
      setDraft((d) => ({ ...d }));
    } finally {
      setBusy(false);
      setStep(2);
    }
  }

  function pickGoal(text: string) {
    setPrompt(text);
    setDraft(EMPTY);
    setQuestion("");
    setNotice("");
    setError("");
    setStep(2);
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const policy = {
        maxAmountCents: Math.round(limitNum * 100),
        currency: "AUD",
        merchant: draft.merchant.trim(),
        category: draft.category,
        period: draft.period,
        amountType: draft.amountType,
        prohibitedItems: draft.prohibited.split(",").map((s) => s.trim()).filter(Boolean),
        needsClarification: false,
        clarificationQuestion: "",
      };
      const saved = await fetch("/api/policy/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved: true, originalPrompt: prompt || "Entered by customer", policy, agentId: agentId || undefined }),
      });
      const savedData = await saved.json();
      if (!saved.ok) throw new Error(savedData.error || "Could not save your rules");

      const act = await fetch("/api/agent/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyId: savedData.policyId }),
      });
      const actData = await act.json();
      if (!act.ok) throw new Error(actData.error || "Could not issue the agent card");
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const who = draft.merchant.trim() || (draft.category !== "general" ? draft.category : "any merchant");
  const never = draft.prohibited.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <Shell back="/agent" tab="Payments">
      {step === 1 && (
        <>
          <h2 className="text-base font-semibold text-gray-900">Which AI agent is this for?</h2>
          {agents.length > 0 ? (
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="AI agent" data-demo="new-agent-select">
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          ) : (
            <p className="text-sm text-gray-600">No agents registered yet. Add one on the Cards screen first.</p>
          )}
          <h2 className="pt-2 text-base font-semibold text-gray-900">What should it be allowed to do?</h2>
          <div className="grid grid-cols-2 gap-3">
            {GOALS.map((g) => (
              <button
                key={g.title}
                data-demo={`goal-${g.title}`}
                onClick={() => pickGoal(g.text)}
                className="rounded-lg border border-gray-200 bg-white p-4 text-left text-sm font-medium text-gray-900 hover:border-border-primary"
              >
                {g.title}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="space-y-2">
            <label htmlFor="prompt" className="text-sm font-semibold text-gray-900">
              Describe it in your own words (optional)
            </label>
            <Textarea
              id="prompt"
              data-demo="prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Groceries at Woolworths, max $50 a week"
            />
            <Button look="faint" size="large" block onClick={readRules} disabled={busy || !prompt.trim()} data-demo="fill-rules">
              {busy ? "Reading…" : "Fill in the rules for me"}
            </Button>
          </div>

          {notice && <Alert look="warning" mode="box">{notice}</Alert>}
          {question && <Alert look="warning" mode="box">{question}</Alert>}

          <h2 className="pt-2 text-base font-semibold text-gray-900">Check the rules</h2>
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <Row label="Who it can pay (optional)">
              <Input data-demo="rule-merchant" value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} placeholder="e.g. Woolworths" />
            </Row>
            <Row label="Price type">
              <Select value={draft.amountType} onChange={(e) => set("amountType", e.target.value as "flexible" | "fixed")}>
                <option value="flexible">Flexible (can be partly approved, like groceries)</option>
                <option value="fixed">Fixed price (all or nothing, like a subscription)</option>
              </Select>
            </Row>
            <Row label="Type of spending">
              <Select value={draft.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </Select>
            </Row>
            <Row label="Limit (AUD)">
              <Input
                inputMode="decimal"
                data-demo="rule-limit"
                value={draft.limit}
                invalid={!limitOk && draft.limit !== ""}
                onChange={(e) => set("limit", e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="50"
              />
            </Row>
            <Row label="How often">
              <Select value={draft.period} onChange={(e) => set("period", e.target.value as Period)}>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
                <option value="once">One-off total</option>
              </Select>
            </Row>
            <Row label="Never allowed">
              <Input value={draft.prohibited} onChange={(e) => set("prohibited", e.target.value)} />
            </Row>
            <p className="text-xs text-gray-500">Card expires after {TOKEN_DAYS} days ({expiryText}).</p>
          </div>

          {!limitOk && <Alert look="warning" mode="box">Add a spending limit to continue.</Alert>}
          {limitOk && broad && (
            <Alert look="warning" mode="box">
              This lets the agent spend up to {dollars(limitNum * 100)} anywhere. Add a merchant or type of spending to narrow it.
            </Alert>
          )}

          <Button look="primary" size="large" block disabled={!limitOk} onClick={() => setStep(3)} data-demo="review">
            Review
          </Button>
          <Button look="faint" size="large" block onClick={() => setStep(1)}>Back</Button>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="text-base font-semibold text-gray-900">Confirm your rules</h2>
          <div data-demo="confirm-summary" className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800">
            <p>
              Your agent can spend up to <strong>{dollars(limitNum * 100)} {periodLabel(draft.period)}</strong> at{" "}
              <strong>{who}</strong> until <strong>{expiryText}</strong>.
            </p>
            {never.length > 0 && <p>It can&apos;t buy: {never.join(", ")}.</p>}
            <p>Anything outside these rules is declined, or sent to you to approve.</p>
          </div>

          {error && <Alert look="danger" mode="box">{error}</Alert>}

          <Button look="primary" size="large" block disabled={busy} onClick={confirm} data-demo="confirm">
            {busy ? "Setting up…" : "Confirm and create card"}
          </Button>
          <Button look="faint" size="large" block disabled={busy} onClick={() => setStep(2)}>Edit</Button>
        </>
      )}

      {step === 4 && (
        <>
          <Alert look="success" mode="box" heading="Agent card created">
            Your agent can now spend within these rules. You can revoke the card at any time.
          </Alert>
          <Link href="/agent" className="block">
            <Button look="primary" size="large" block data-demo="view-cards">View my agent cards</Button>
          </Link>
        </>
      )}
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-medium text-gray-900">
      <span>{label}</span>
      {children}
    </label>
  );
}
