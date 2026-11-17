// Agents the network knows that the customer has not registered yet (for the picker).
import { listAgents } from "@/lib/agents";
import { fetchNetworkAgents } from "@/lib/network-client";

export async function GET() {
  const registry = await fetchNetworkAgents();
  if (!registry) return Response.json({ error: "network_unreachable" }, { status: 502 });
  const have = new Set(listAgents().map((a) => a.id));
  return Response.json(registry.filter((a) => !have.has(a.id)).map(({ id, name, type, public_key }) => ({ id, name, type, public_key })));
}
