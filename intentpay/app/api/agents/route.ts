import { listAgents, registerAgent, getAgent } from "@/lib/agents";
import { fetchNetworkAgents } from "@/lib/network-client";
import { customerFromUrl } from "@/lib/customer-limits";

// Optional ?customer=<id>; omitted = the original demo customer.
export async function GET(request: Request) {
  return Response.json(listAgents(customerFromUrl(request.url)));
}

// Register an agent by picking it from the network's agent registry (simulated).
// Identity is established by the network; the bank stores the network's agent id and relies on its attestation.
export async function POST(request: Request) {
  const customerId = customerFromUrl(request.url);
  const { networkAgentId } = await request.json().catch(() => ({}));
  if (typeof networkAgentId !== "string" || !networkAgentId) {
    return Response.json({ error: "Pick an agent from the network registry." }, { status: 400 });
  }
  const registry = await fetchNetworkAgents();
  if (!registry) {
    return Response.json(
      { error: "The simulated card network is not reachable, so the agent cannot be verified. Start it and try again." },
      { status: 502 }
    );
  }
  const known = registry.find((a) => a.id === networkAgentId);
  if (!known) return Response.json({ error: "That agent is not in the network's registry." }, { status: 400 });
  if (getAgent(known.id)) return Response.json({ error: `${known.name} is already registered.` }, { status: 409 });
  return Response.json(registerAgent(known.name, known.id, known.type, { networkAgentId: known.id, verified: true }, customerId), { status: 201 });
}
