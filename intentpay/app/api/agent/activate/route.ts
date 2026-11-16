// Customer confirmed the policy: ask the network to issue a token for it.
import { activatePolicy } from "@/lib/network-client";

export async function POST(request: Request) {
  try {
    const { policyId } = await request.json();
    if (typeof policyId !== "string") {
      return Response.json({ error: "policyId required" }, { status: 400 });
    }
    const r = await activatePolicy(policyId);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ token: r.token, expiry: r.expiry });
  } catch (error) {
    console.error("Activate error:", error);
    return Response.json({ error: "Failed to activate agent card" }, { status: 500 });
  }
}
