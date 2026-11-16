// Revoke an agent: every mandate it holds is stopped at the bank and at the network.
import { getAgent, revokeAgent } from "@/lib/agents";

export async function POST(request: Request) {
  const { agentId } = await request.json().catch(() => ({}));
  if (typeof agentId !== "string" || !getAgent(agentId)) {
    return Response.json({ error: "Unknown agent" }, { status: 404 });
  }
  return Response.json(await revokeAgent(agentId));
}
