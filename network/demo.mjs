// Runs the demo cases through the real flow: bank policy -> network token -> payment attempts.
// Needs both services running:  intentpay (npm run dev, port 3000)  and  node server.mjs (port 4000)
// Usage: node demo.mjs
const BANK = process.env.BANK_URL || "http://localhost:3000";
const NET = process.env.NET_URL || "http://localhost:4000";

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

// Check both services are up before starting
for (const [name, url] of [["Bank app (intentpay, npm run dev)", BANK], ["Network (node server.mjs)", NET]]) {
  try { await fetch(url, { signal: AbortSignal.timeout(5000) }); }
  catch { console.error(`${name} is not reachable at ${url}. Start it first, then rerun.`); process.exit(1); }
}

// 1. Customer approves a policy (this is what the bank app does after the AI drafts it)
const policy = {
  maxAmountCents: 15000,
  currency: "AUD",
  merchant: "",
  category: "groceries",
  prohibitedItems: ["gift card", "alcohol"],
  needsClarification: false,
  clarificationQuestion: "",
};
const p = await post(`${BANK}/api/policy/approve`, {
  approved: true,
  originalPrompt: "Buy groceries up to $150, nothing else.",
  policy,
});
if (!p.json.policyId) { console.error("Could not create policy:", p); process.exit(1); }
console.log(`Policy ${p.json.policyId} active ($150 groceries)\n`);

// 2. Network issues a token for the agent (bank approves provisioning first)
const t = await post(`${NET}/tokens`, {
  card_ref: "card_001",
  agent_id: "agent_shopper_7",
  scope: { categories: ["groceries"], max_per_txn: 150 },
  expiry: new Date(Date.now() + 7 * 86400e3).toISOString(),
  policy_id: p.json.policyId,
});
if (!t.json.token) { console.error("Could not issue token:", t); process.exit(1); }
const token = t.json.token;
console.log(`Token ${token} issued\n`);

// 3. The agent tries to pay
let failures = 0;
async function attempt(label, merchant, amount, expected) {
  const r = await post(`${NET}/authorise`, { token, merchant, amount, currency: "AUD" });
  const d = r.json;
  const ok = d.outcome === expected;
  if (!ok) failures++;
  const by = d.declined_by ? ` (by ${d.declined_by})` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  console.log(`      -> ${d.outcome}${by}${ok ? "" : `   EXPECTED ${expected}`}`);
  console.log(`      ${d.reason}\n`);
}

await attempt("$42 at Coles", { name: "Coles", category: "groceries" }, 42, "approve");
await attempt("$180 at Coles (over the $150 limit)", { name: "Coles", category: "groceries" }, 180, "decline");
await attempt("Lookalike 'Cooles', grocery category", { name: "Cooles", category: "groceries" }, 40, "decline");
await attempt("Gift-card seller", { name: "GiftCardHub", category: "gift_cards" }, 50, "decline");
await attempt("Brand-new business", { name: "Fresh Harvest Pty Ltd", category: "groceries" }, 60, "ask_customer");
await attempt("$120 at Woolworths ($108 left)", { name: "Woolworths", category: "groceries" }, 120, "approve_narrower");

await post(`${NET}/tokens/${token}/revoke`, {});
console.log("Customer revoked the token.\n");
await attempt("Any purchase after revoke", { name: "Coles", category: "groceries" }, 10, "decline");

const r = await (await fetch(`${BANK}/api/bank/receipts`)).json();
console.log(`Bank receipts logged: ${r.receipts?.length ?? "unknown"} (open ${NET} to see the network's view)`);
console.log(failures === 0 ? "\nALL CASES AS EXPECTED" : `\n${failures} CASE(S) DID NOT MATCH`);
process.exit(failures === 0 ? 0 : 1);
