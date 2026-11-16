// Demo only: plays the part of an AI agent trying to pay.
// Path: this route -> simulated card network /authorise -> bank /api/bank/decide.
// It never calls the legacy /api/transaction/authorize route.
import { activatePolicy, networkAuthorise, registerIntent, NETWORK_DOWN } from "@/lib/network-client";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const amount = Number(b.amount);
    if (typeof b.policyId !== "string" || typeof b.merchant !== "string" || typeof b.category !== "string" || !(amount > 0)) {
      return Response.json({ error: "policyId, merchant, category and amount required" }, { status: 400 });
    }

    // A token is normally issued when the card is created. Issue one on demand if the network was restarted.
    const t = await activatePolicy(b.policyId);
    let token = t.ok ? t.token : null;
    if (!t.ok && t.status !== 404) return Response.json({ error: t.error }, { status: t.status });
    if (!token) {
      // Revoked policies have no active token: use the last one so the NETWORK can show it is revoked.
      const { getAgentToken } = await import("@/lib/agent-tokens");
      token = getAgentToken(b.policyId)?.token ?? null;
    }
    if (!token) return Response.json({ error: "This agent has no card." }, { status: 404 });

    // Optional basket details: registered with the (simulated) network, which gives back a reference.
    // The bank can fetch the details by that reference, like an order ID. They are not sent in the payment itself.
    const intentRef =
      Array.isArray(b.lineItems) || typeof b.intentDescription === "string"
        ? await registerIntent({
            description: typeof b.intentDescription === "string" ? b.intentDescription : "",
            line_items: Array.isArray(b.lineItems) ? b.lineItems.map(String) : [],
          })
        : null;

    try {
      const result = await networkAuthorise({
        token,
        merchant: { name: b.merchant, category: b.category },
        amount,
        currency: "AUD",
        description: typeof b.description === "string" ? b.description : undefined,
        intent_ref: intentRef ?? undefined,
        request_id: typeof b.requestId === "string" ? b.requestId : randomUUID(),
      });
      return Response.json(result);
    } catch {
      return Response.json({ error: NETWORK_DOWN }, { status: 502 });
    }
  } catch (error) {
    console.error("Demo purchase error:", error);
    return Response.json({ error: "Demo purchase failed" }, { status: 500 });
  }
}
