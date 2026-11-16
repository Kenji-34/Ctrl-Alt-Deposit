
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";

type StoredPolicy = {
  policy_json: string;
  status: string;
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

    // 1. Validate incoming transaction details.
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

    // 2. Find the approved policy in SQLite.
    const record = db.prepare(`
      SELECT policy_json, status
      FROM policies
      WHERE id = ?
    `).get(policyId) as StoredPolicy | undefined;

    if (!record || record.status !== "ACTIVE") {
      return Response.json({
        decision: "DECLINED",
        reason: "No active policy found"
      });
    }

    // 3. Read and validate the stored policy.
    const policy = PolicySchema.parse(
      JSON.parse(record.policy_json)
    );

    if (policy.needsClarification) {
      return Response.json({
        decision: "DECLINED",
        reason: "Policy requires clarification"
      });
    }

    // 4. Check the spending limit.
    if (amountCents > policy.maxAmountCents) {
      return Response.json({
        decision: "DECLINED",
        reason: "Spending limit exceeded"
      });
    }

    // 5. Check the merchant.
    if (
      policy.merchant &&
      merchant.trim().toLowerCase() !==
        policy.merchant.trim().toLowerCase()
    ) {
      return Response.json({
        decision: "DECLINED",
        reason: "Merchant not authorised"
      });
    }

    // 6. Check the purchase category.
    if (
      policy.category !== "general" &&
      category.trim().toLowerCase() !==
        policy.category.trim().toLowerCase()
    ) {
      return Response.json({
        decision: "DECLINED",
        reason: "Purchase category not permitted"
      });
    }

    // 7. Check prohibited items.
    const containsProhibitedItem =
      policy.prohibitedItems.some(blocked =>
        items.some((item: string) =>
          item.toLowerCase().includes(
            blocked.toLowerCase()
          )
        )
      );

    if (containsProhibitedItem) {
      return Response.json({
        decision: "DECLINED",
        reason: "Purchase contains prohibited items"
      });
    }

    // 8. All checks passed.
    return Response.json({
      decision: "APPROVED",
      reason: "Transaction satisfies approved policy"
    });

  } catch (error) {
    console.error("Verification error:", error);

    return Response.json(
      { error: "Transaction verification failed" },
      { status: 500 }
    );
  }
}
