// Display tag only: which "side" of the one customer an agent works for. It changes no decision and the
// single overall cap still applies across both sides. Agents without a tag (e.g. newly registered ones) show no chip.
export type Side = "Personal" | "Business";

const SIDE_BY_AGENT: Record<string, Side> = {
  ChatGPT: "Personal",
  Gemini: "Business",
};

export function sideOf(agentName?: string | null): Side | null {
  return (agentName && SIDE_BY_AGENT[agentName]) || null;
}
