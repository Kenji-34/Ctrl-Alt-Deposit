// Receipts: one row for every decision the bank makes, including declines.
import db, { ensureColumn } from "@/lib/db";
import { randomUUID } from "node:crypto";

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_receipts (
    id TEXT PRIMARY KEY,
    token TEXT,
    policy_id TEXT,
    agent_id TEXT,
    merchant_name TEXT,
    category TEXT,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    approved_cents INTEGER NOT NULL DEFAULT 0,
    outcome TEXT NOT NULL,
    reason TEXT NOT NULL,
    declined_by TEXT,
    created_at TEXT NOT NULL
  )
`);

ensureColumn("bank_receipts", "rule", "TEXT");
ensureColumn("bank_receipts", "limited_by", "TEXT");
ensureColumn("bank_receipts", "ai_json", "TEXT"); // AI check result (advisory)
ensureColumn("bank_receipts", "network_json", "TEXT"); // simulated network fields
ensureColumn("bank_receipts", "intent_ref", "TEXT");

export type ReceiptInput = {
  token?: string;
  policyId?: string;
  agentId?: string;
  merchantName?: string;
  category?: string;
  amountCents?: number;
  approvedCents?: number;
  outcome: string;
  reason: string;
  declinedBy?: string;
  rule?: string;
  limitedBy?: string;
  aiJson?: string;
  networkJson?: string;
  intentRef?: string;
};

export function recordReceipt(r: ReceiptInput): string {
  const id = "rcpt_" + randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO bank_receipts
    (id, token, policy_id, agent_id, merchant_name, category,
     amount_cents, approved_cents, outcome, reason, declined_by, created_at, rule, limited_by, ai_json, network_json, intent_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    r.token ?? null,
    r.policyId ?? null,
    r.agentId ?? null,
    r.merchantName ?? null,
    r.category ?? null,
    r.amountCents ?? 0,
    r.approvedCents ?? 0,
    r.outcome,
    r.reason,
    r.declinedBy ?? null,
    new Date().toISOString(),
    r.rule ?? null,
    r.limitedBy ?? null,
    r.aiJson ?? null,
    r.networkJson ?? null,
    r.intentRef ?? null
  );
  return id;
}

export function listReceipts(limit = 100) {
  return db
    .prepare(`SELECT * FROM bank_receipts ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}
