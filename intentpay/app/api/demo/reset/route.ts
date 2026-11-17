// Clears transactions, receipts, pending approvals, tokens and re-seeds the demo customer and agents.
import { demoDisabledResponse } from "@/lib/demo-mode";
import { resetDemo } from "@/lib/demo";

export async function POST() {
  const disabled = demoDisabledResponse();
  if (disabled) return disabled;
  try {
    return Response.json({ ok: true, ...(await resetDemo()) });
  } catch (error) {
    console.error("Reset error:", error);
    return Response.json({ error: "Reset failed" }, { status: 500 });
  }
}
