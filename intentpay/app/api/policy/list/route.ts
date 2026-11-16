
import db from "@/lib/db";

export async function GET() {
  try {
    const policies = db.prepare(`
      SELECT
        id,
        original_prompt,
        policy_json,
        status,
        created_at
      FROM policies
      ORDER BY created_at DESC
    `).all();

    return Response.json({
      policies: policies
    });

  } catch (error) {
    console.error("Database retrieval error:", error);

    return Response.json(
      { error: "Failed to retrieve policies" },
      { status: 500 }
    );
  }
}
