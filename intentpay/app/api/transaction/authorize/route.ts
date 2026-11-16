
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { randomUUID, createHash } from "node:crypto";

type StoredPolicy = {
  policy_json: string;
  status: string;
};

type SpendingRecord = {
  total_spent: number;
};

type IdempotencyRecord = {
  request_hash: string;
  response_json: string;
};

type Decision = {
  decision: "APPROVED" | "DECLINED";
  reason: string;
  transactionId?: string;
  remainingBudgetCents?: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      requestId,
      policyId,
      amountCents,
      merchant,
      category,
      items
    } = body;

    // 1. Validate transaction input.
    if (
      typeof requestId !== "string" ||
      !requestId.trim() ||
      requestId.length > 100 ||
      typeof policyId !== "string" ||
      !policyId.trim() ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      typeof merchant !== "string" ||
      !merchant.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      !Array.isArray(items) ||
      !items.every(
        (item: unknown) => typeof item === "string"
      )
    ) {
      return Response.json(
        { error: "Invalid transaction details" },
        { status: 400 }
      );
    }

    // 2. Fingerprint the original request.
    const requestHash = createHash("sha256")
      .update(JSON.stringify({
        amountCents,
        merchant,
        category,
        items
      }))
      .digest("hex");

    // 3. Run verification and storage atomically.
    const authorize = db.transaction(() => {

      // Check whether this request was processed before.
      const previous = db.prepare(`
        SELECT request_hash, response_json
        FROM idempotency_records
        WHERE policy_id = ? AND request_id = ?
      `).get(
        policyId,
        requestId
      ) as IdempotencyRecord | undefined;

      if (previous) {
        // Same ID but different purchase details.
        if (previous.request_hash !== requestHash) {
          return {
            conflict: true,
            error: "Request ID reused with different details"
          };
        }

        // Same request: return original decision.
        return {
          ...JSON.parse(previous.response_json),
          replayed: true
        };
      }

      // Find the approved policy.
      const record = db.prepare(`
        SELECT policy_json, status
        FROM policies
        WHERE id = ?
      `).get(policyId) as StoredPolicy | undefined;

      if (!record || record.status !== "ACTIVE") {
        return {
          decision: "DECLINED",
          reason: "No active policy found"
        };
      }

      const policy = PolicySchema.parse(
        JSON.parse(record.policy_json)
      );

      let result: Decision;

      // 4. Check all policy restrictions.
      if (policy.needsClarification) {
        result = {
          decision: "DECLINED",
          reason: "Policy requires clarification"
        };
      } else if (
        policy.merchant &&
        merchant.trim().toLowerCase() !==
        policy.merchant.trim().toLowerCase()
      ) {
        result = {
          decision: "DECLINED",
          reason: "Merchant not authorised"
        };
      } else if (
        policy.category !== "general" &&
        category.trim().toLowerCase() !==
        policy.category.trim().toLowerCase()
      ) {
        result = {
          decision: "DECLINED",
          reason: "Category not permitted"
        };
      } else if (
        policy.prohibitedItems.some(blocked =>
          items.some((item: string) =>
            item.toLowerCase().includes(
              blocked.toLowerCase()
            )
          )
        )
      ) {
        result = {
          decision: "DECLINED",
          reason: "Prohibited item detected"
        };
      } else {

        // 5. Calculate remaining spending budget.
        const spending = db.prepare(`
          SELECT COALESCE(
            SUM(amount_cents), 0
          ) AS total_spent
          FROM transactions
          WHERE policy_id = ?
            AND status = 'APPROVED'
        `).get(policyId) as SpendingRecord;

        const remaining =
          policy.maxAmountCents - spending.total_spent;

        if (amountCents > remaining) {
          result = {
            decision: "DECLINED",
            reason: "Insufficient remaining budget",
            remainingBudgetCents: remaining
          };
        } else {

          // 6. Record successful authorisation.
          const transactionId = randomUUID();

          db.prepare(`
            INSERT INTO transactions (
              id, policy_id, amount_cents,
              merchant, category, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            transactionId,
            policyId,
            amountCents,
            merchant,
            category,
            "APPROVED",
            new Date().toISOString()
          );

          result = {
            decision: "APPROVED",
            reason: "Transaction satisfies approved policy",
            transactionId,
            remainingBudgetCents: remaining - amountCents
          };
        }
      }

      // 7. Remember the original decision.
      db.prepare(`
        INSERT INTO idempotency_records (
          policy_id, request_id, request_hash,
          response_json, created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        policyId,
        requestId,
        requestHash,
        JSON.stringify(result),
        new Date().toISOString()
      );

      return result;
    });

    // Immediate SQLite transaction protects check + insert.
    const result = authorize.immediate();

    if ("conflict" in result && result.conflict) {
      return Response.json(
        { error: result.error },
        { status: 409 }
      );
    }

    return Response.json(result);

  } catch (error) {
    console.error("Authorisation error:", error);

    return Response.json(
      { error: "Transaction authorisation failed" },
      { status: 500 }
    );
  }
}
