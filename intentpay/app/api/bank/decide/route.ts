// Called by the network on every payment attempt that passes its coarse checks.
// This is the ONLY decision endpoint the demo and the app UI use.
import db from "@/lib/db";
import { runDecision, decisionResponse } from "@/lib/bank-pipeline";
import { createHash } from "node:crypto";

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const amountCents = Math.round(Number(b.amount) * 100);

    if (
      typeof b.policy_id !== "string" ||
      !b.merchant ||
      typeof b.merchant.name !== "string" ||
      typeof b.merchant.category !== "string" ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      return Response.json({ error: "Invalid transaction details" }, { status: 400 });
    }

    const currency = typeof b.currency === "string" ? b.currency : "AUD";
    const description = typeof b.description === "string" ? b.description : undefined;
    // Optional: a retry with the same request_id returns the same answer and moves no extra money.
    const requestId = typeof b.request_id === "string" && b.request_id ? "decide:" + b.request_id : null;
    const hash = createHash("sha256")
      .update(JSON.stringify([amountCents, b.merchant.name, b.merchant.category, currency, description ?? ""]))
      .digest("hex");

    // IMMEDIATE takes the write lock up front, so two concurrent payments
    // cannot both read the same spend and jointly breach a cap.
    const run = db.transaction(() => {
      if (requestId) {
        const prior = db
          .prepare(`SELECT request_hash, response_json FROM idempotency_records WHERE policy_id = ? AND request_id = ?`)
          .get(b.policy_id, requestId) as { request_hash: string; response_json: string } | undefined;
        if (prior) {
          if (prior.request_hash !== hash) {
            return { status: 409, body: { error: "request_id was already used for a different payment" } };
          }
          return { status: 200, body: { ...JSON.parse(prior.response_json), idempotent_replay: true } };
        }
      }

      const { decision, receiptId, approvalId } = runDecision({
        policyId: b.policy_id,
        token: b.token,
        agentId: b.agent_id,
        merchant: { name: b.merchant.name, category: b.merchant.category, abn: b.merchant.abn },
        amountCents,
        currency,
        description,
      });
      const body = decisionResponse(decision, receiptId, approvalId);

      if (requestId) {
        db.prepare(`
          INSERT INTO idempotency_records (policy_id, request_id, request_hash, response_json, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(b.policy_id, requestId, hash, JSON.stringify(body), new Date().toISOString());
      }
      return { status: 200, body };
    });

    const { status, body } = run.immediate();
    return Response.json(body, { status });
  } catch (error) {
    console.error("Bank decide error:", error);
    return Response.json({ error: "Bank decision failed" }, { status: 500 });
  }
}
