"use client";

import { useState } from "react";
import { Alert, Button, Card, Input, ProgressBar, Select } from "@/app/components/ui";
import { dollars } from "@/lib/format";
import type { Overall, Period } from "./types";

const PERIOD_TEXT: Record<Period, string> = { week: "per week", month: "per month", once: "in total" };

// Customer-wide cap across every agent. Editable.
export function OverallCap({ overall, onChanged }: { overall: Overall; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(String(overall.limitCents / 100));
  const [period, setPeriod] = useState<Period>(overall.period);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const used = overall.limitCents > 0 ? (overall.spentCents / overall.limitCents) * 100 : 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/limit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Number(limit), period }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-demo="overall-cap" className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Overall cap, all agents</p>
          <p className="text-xs text-gray-500">
            {dollars(overall.limitCents)} {PERIOD_TEXT[overall.period]}
          </p>
        </div>
        <span className="text-lg font-bold text-gray-900">{dollars(overall.remainingCents)} left</span>
      </div>
      <ProgressBar value={used} aria-label="Overall cap used" />
      <p className="text-xs text-gray-500">
        {dollars(overall.spentCents)} spent across all your agents. This counts spending made through this bank only.
      </p>

      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="number"
              min="1"
              step="1"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-label="Overall limit in dollars"
            />
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Overall limit period">
              <option value="week">per week</option>
              <option value="month">per month</option>
              <option value="once">in total</option>
            </Select>
          </div>
          {error && <Alert look="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button look="faint" size="small" onClick={() => setEditing(false)}>Cancel</Button>
            <Button look="primary" size="small" onClick={save} disabled={busy}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button look="faint" size="small" onClick={() => setEditing(true)}>Edit cap</Button>
        </div>
      )}
    </Card>
  );
}
