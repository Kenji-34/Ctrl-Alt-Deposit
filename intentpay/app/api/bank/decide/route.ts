// Called by the network on every payment attempt that passes its coarse checks.
// This is the ONLY decision endpoint the demo and the app UI use.
import db from "@/lib/db";
import { runDecision, computeDecision, decisionResponse, type DecisionRequest } from "@/lib/bank-pipeline";
import { aiConsistencyCheck } from "@/lib/ai-check";
import { fetchIntent } from "@/lib/network-client";
import type { AiNote } from "@/lib/bank-decide";
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

    const req: DecisionRequest = {
      policyId: b.policy_id,
      token: b.token,
      agentId: b.agent_id,
      merchant: { name: b.merchant.name, category: b.merchant.category, abn: b.merchant.abn },
      amountCents,
      currency,
      description,
      fixedAmount: b.amount_type === "fixed" ? true : undefined,
      intentRef: typeof b.intent_ref === "string" ? b.intent_ref : undefined,
      network: b.network && typeof b.network === "object" ? b.network : undefined,
    };

    // A replay needs no AI call: check for it first.
    if (requestId) {
      const prior = db
        .prepare(`SELECT request_hash, response_json FROM idempotency_records WHERE policy_id = ? AND request_id = ?`)
        .get(b.policy_id, requestId) as { request_hash: string; response_json: string } | undefined;
      if (prior) {
        if (prior.request_hash !== hash) return Response.json({ error: "request_id was already used for a different payment" }, { status: 409 });
        return Response.json({ ...JSON.parse(prior.response_json), idempotent_replay: true });
      }
    }

    // AI check: only if the deterministic rules did not decline. Core fields always; intent details if the
    // network can supply them by reference (simulated capability). Any failure leaves the rules' outcome alone.
    let ai: AiNote | undefined;
    const pre = computeDecision(req);
    if (pre.policy && pre.decision.outcome !== "decline") {
      const intent = req.intentRef ? await fetchIntent(req.intentRef) : null;
      ai = await aiConsistencyCheck({
        originalPrompt: pre.originalPrompt,
        policy: pre.policy,
        merchantName: req.merchant.name,
        category: req.merchant.category,
        amountCents,
        description: description ?? intent?.description,
        lineItems: intent?.line_items,
        enrichmentUsed: !!intent,
      });
    }
    req.ai = ai;

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

      const { decision, receiptId, approvalId } = runDecision(req);
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
