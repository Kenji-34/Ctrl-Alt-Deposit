
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { randomUUID } from "node:crypto";

type StoredPolicy = {
  policy_json: string;
  status: string;
};

type SpendingRecord = {
  total_spent: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      policyId,
      amountCents,
      merchant,
      category,
      items
    } = body;

    // Check the transaction details.
    if (
      typeof policyId !== "string" ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      typeof merchant !== "string" ||
      typeof category !== "string" ||
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

    // Run the checks and database updates together.
    const authorize = db.transaction(() => {
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

      if (policy.needsClarification) {
        return {
          decision: "DECLINED",
          reason: "Policy requires clarification"
        };
      }

      // Check permitted merchant.
      if (
        policy.merchant &&
        merchant.trim().toLowerCase() !==
          policy.merchant.trim().toLowerCase()
      ) {
        return {
          decision: "DECLINED",
          reason: "Merchant not authorised"
        };
      }

      // Check purchase category.
      if (
        policy.category !== "general" &&
        category.trim().toLowerCase() !==
          policy.category.trim().toLowerCase()
      ) {
        return {
          decision: "DECLINED",
          reason: "Category not permitted"
        };
      }

      // Check prohibited items.
      const hasProhibitedItem =
        policy.prohibitedItems.some(blocked =>
          items.some((item: string) =>
            item.toLowerCase().includes(
              blocked.toLowerCase()
            )
          )
        );

      if (hasProhibitedItem) {
        return {
          decision: "DECLINED",
          reason: "Prohibited item detected"
        };
      }

      // Find how much has already been authorised.
      const spending = db.prepare(`
        SELECT COALESCE(
          SUM(amount_cents), 0
        ) AS total_spent
        FROM transactions
        WHERE policy_id = ?
          AND status = 'APPROVED'
      `).get(policyId) as SpendingRecord;

      const alreadySpent = spending.total_spent;
      const remaining = policy.maxAmountCents - alreadySpent;

      // Check cumulative spending.
      if (amountCents > remaining) {
        return {
          decision: "DECLINED",
          reason: "Insufficient remaining budget",
          remainingBudgetCents: remaining
        };
      }

      // Record the successful authorisation.
      const transactionId = randomUUID();

      db.prepare(`
        INSERT INTO transactions (
          id,
          policy_id,
          amount_cents,
          merchant,
          category,
          status,
          created_at
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

      return {
        decision: "APPROVED",
        reason: "Transaction satisfies approved policy",
        transactionId,
        remainingBudgetCents: remaining - amountCents
      };
    });

    return Response.json(authorize());

  } catch (error) {
    console.error("Authorisation error:", error);

    return Response.json(
      { error: "Transaction authorisation failed" },
      { status: 500 }
    );
  }
}
