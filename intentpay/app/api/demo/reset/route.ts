// Clears transactions, receipts, pending approvals, tokens and re-seeds the demo customer and agents.
import { resetDemo } from "@/lib/demo";

export async function POST() {
  try {
    return Response.json({ ok: true, ...(await resetDemo()) });
  } catch (error) {
    console.error("Reset error:", error);
    return Response.json({ error: "Reset failed" }, { status: 500 });
  }
}
