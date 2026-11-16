
import db from "@/lib/db";
import { PolicySchema } from "@/lib/policy-schema";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check whether approval was provided
    if (body.approved !== true) {
      return Response.json(
        { error: "Customer approval required" },
        { status: 400 }
      );
    }

    // Check the policy's format
    const result = PolicySchema.safeParse(body.policy);

    if (!result.success) {
      return Response.json(
        { error: "Invalid policy format" },
        { status: 400 }
      );
    }

    const policy = result.data;

    // Refuse incomplete or invalid policies
    if (
      policy.needsClarification ||
      !Number.isSafeInteger(policy.maxAmountCents) ||
      policy.maxAmountCents <= 0 ||
      policy.currency !== "AUD" ||
      typeof body.originalPrompt !== "string"
    ) {
      return Response.json(
        { error: "Invalid or incomplete policy" },
        { status: 400 }
      );
    }

    // Give the policy a unique ID
    const id = randomUUID();

    // Save it in SQLite
    db.prepare(`
      INSERT INTO policies
      (id, original_prompt, policy_json, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      body.originalPrompt,
      JSON.stringify(policy),
      "ACTIVE",
      new Date().toISOString()
    );

    return Response.json({
      message: "Policy saved successfully",
      policyId: id,
      status: "ACTIVE"
    });

  } catch (error) {
    console.error("Approval error:", error);

    return Response.json(
      { error: "Failed to save policy" },
      { status: 500 }
    );
  }
}
