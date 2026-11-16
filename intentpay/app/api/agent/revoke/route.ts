// Kill switch for one card: revoke the token at the network and stop the policy at the bank.
import { revokePolicy } from "@/lib/network-client";

export async function POST(request: Request) {
  try {
    const { policyId } = await request.json();
    if (typeof policyId !== "string") {
      return Response.json({ error: "policyId required" }, { status: 400 });
    }
    const { networkRevoked } = await revokePolicy(policyId);
    return Response.json({ revoked: true, networkRevoked: networkRevoked ?? false });
  } catch (error) {
    console.error("Revoke error:", error);
    return Response.json({ error: "Failed to revoke" }, { status: 500 });
  }
}
