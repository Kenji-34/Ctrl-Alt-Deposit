import { listAgents, registerAgent } from "@/lib/agents";

export async function GET() {
  return Response.json(listAgents());
}

export async function POST(request: Request) {
  const { name } = await request.json().catch(() => ({}));
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 40) {
    return Response.json({ error: "Give the agent a name (2 to 40 characters)." }, { status: 400 });
  }
  return Response.json(registerAgent(name), { status: 201 });
}
