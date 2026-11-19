// Agents the network knows that the customer has not registered yet (for the picker).
import db from "@/lib/db";
import { fetchNetworkAgents } from "@/lib/network-client";

export async function GET() {
  const registry = await fetchNetworkAgents();
  if (!registry) return Response.json({ error: "network_unreachable" }, { status: 502 });
  // An agent registered under ANY customer is not offered again (the personal list must not offer the business agents).
  const have = new Set((db.prepare(`SELECT id FROM agents`).all() as { id: string }[]).map((a) => a.id));
  return Response.json(registry.filter((a) => !have.has(a.id)).map(({ id, name, type, public_key }) => ({ id, name, type, public_key })));
}
