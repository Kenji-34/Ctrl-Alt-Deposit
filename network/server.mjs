// Mock card-network token service (stand-in for Visa VTS / Mastercard MDES).
// Zero dependencies: needs Node 18+ (built-in fetch). Run: node server.mjs
import http from "node:http";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 4000);
const BANK_URL = process.env.BANK_URL || "http://localhost:3000";

const vault = new Map(); // token id -> token record
const log = []; // newest first
// ---- Simulated agent identity ----
// In a real system the network (or the scheme) establishes agent identity with cryptographic agent signatures
// (e.g. Visa's agent signatures, Mastercard's registered agent tokens) and the bank relies on that attestation.
// Here: a small registry of known agents, each with a simulated key. A real scheme would use asymmetric keys and
// verify with the public key; this simulation uses an HMAC secret held only by the agent and the network.
const AGENTS = ["ChatGPT", "Gemini", "Perplexity", "Claude", "Microsoft Copilot"].map((name) => {
  const id = "agent_" + name.toLowerCase().replace(/[^a-z]/g, "").replace("microsoftcopilot", "copilot");
  const secret = createHash("sha256").update("simulated-agent-secret:" + id).digest("hex");
  return { id, name, type: "AI assistant", secret, public_key: "pk_sim_" + createHash("sha256").update(secret).digest("hex").slice(0, 24) };
});
const agentById = new Map(AGENTS.map((a) => [a.id, a]));
const MAX_SKEW_MS = 5 * 60 * 1000;

// What the agent signs for a payment attempt (simulated).
function signingString({ token, agent_id, merchant, amount, timestamp }) {
  return [token, agent_id, merchant?.name, merchant?.category, amount, timestamp].join("|");
}
function sign(secret, fields) {
  return createHmac("sha256", secret).update(signingString(fields)).digest("hex");
}
function sameSig(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const intents = new Map(); // intent_ref -> { description, line_items } (simulated Order ID lookup)

function record(entry) {
  log.unshift({ time: new Date().toISOString(), ...entry });
  if (log.length > 200) log.pop();
}

async function callBank(path, body) {
  const res = await fetch(`${BANK_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`bank ${path} returned ${res.status}`);
  return res.json();
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(type === "application/json" ? JSON.stringify(body, null, 2) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// POST /tokens : issue a token (bank must approve provisioning first)
async function createToken(body) {
  const { card_ref, agent_id, scope, expiry, policy_id } = body;
  if (!card_ref || !agent_id || !scope || !expiry) {
    return [400, { error: "card_ref, agent_id, scope and expiry are required" }];
  }
  if (!agentById.has(agent_id)) {
    record({ type: "provision", agent_id, result: "declined", reason: "agent is not in the network's agent registry" });
    return [403, { approved: false, reason: `Agent "${agent_id}" is not in the network's agent registry, so no token can be issued.` }];
  }
  let decision;
  try {
    decision = await callBank("/api/bank/approve-provisioning", {
      card_ref, agent_id, scope, expiry, policy_id,
    });
  } catch (e) {
    record({ type: "provision", result: "failed", reason: e.message });
    return [502, { error: "bank unreachable", detail: e.message }];
  }
  if (!decision.approved) {
    record({ type: "provision", agent_id, result: "declined", reason: decision.reason });
    return [403, { approved: false, reason: decision.reason }];
  }
  const id = "tok_" + randomBytes(4).toString("hex");
  // Simulated fields, loosely modelled on public descriptions of Visa Intelligent Commerce
  // (instruction + mandate, validity window, purchase type) and Mastercard Agent Pay
  // (agentic token bound to a registered agent). Not a live integration.
  const now = new Date().toISOString();
  const token = {
    token: id, card_ref, agent_id, scope, expiry, policy_id, status: "active", created_at: now,
    instruction_id: "instr_" + randomBytes(4).toString("hex"),
    instruction_status: "active",
    mandate_id: "mand_" + randomBytes(4).toString("hex"),
    purchase_type: body.purchase_type || "autonomous", // human_in_the_loop | autonomous | recurring
    validity: { from: now, to: expiry },
    agentic_token: "agtok_" + randomBytes(6).toString("hex"), // bound to agent_id
  };
  vault.set(id, token);
  record({ type: "provision", token: id, agent_id, result: "issued" });
  return [201, token];
}

// POST /authorise : network checks coarse limits, then asks the bank
async function authorise(body) {
  const { token: id, merchant, amount, intent_ref } = body;
  const t = vault.get(id);

  // Network-side coarse checks. Any failure is declined here and the bank is notified.
  let netReason = null;
  if (!t) netReason = "unknown token";
  else if (t.status !== "active") netReason = `token is ${t.status}`;
  else if (new Date(t.expiry) < new Date()) netReason = "token expired";
  else if (!merchant || typeof amount !== "number") netReason = "merchant and numeric amount required";
  else if (!body.signature) netReason = "agent signature missing";
  else if (!agentById.has(body.agent_id)) netReason = "agent is not in the network's agent registry";
  else if (body.agent_id !== t.agent_id) netReason = "agent identity does not match the agent this token is bound to";
  else if (!body.timestamp || Math.abs(Date.now() - Number(body.timestamp)) > MAX_SKEW_MS) netReason = "agent signature is stale or has no timestamp";
  else if (!sameSig(body.signature, sign(agentById.get(body.agent_id).secret, { token: id, agent_id: body.agent_id, merchant, amount, timestamp: body.timestamp })))
    netReason = "agent signature invalid";
  else if (t.scope.categories && !t.scope.categories.map((c) => c.toLowerCase()).includes(String(merchant.category).toLowerCase()))
    netReason = `category '${merchant.category}' not allowed for this token`;
  else if (t.scope.max_per_txn != null && amount > t.scope.max_per_txn)
    netReason = `amount $${amount} exceeds token limit $${t.scope.max_per_txn}`;

  if (netReason) {
    record({ type: "authorise", token: id, merchant: merchant?.name, amount, result: "declined_by_network", reason: netReason });
    if (t) {
      // best effort: bank still gets a receipt for every attempt
      callBank("/api/bank/decline-notice", { token: id, card_ref: t.card_ref, agent_id: t.agent_id, policy_id: t.policy_id, merchant, amount, reason: netReason, declined_by: "network", rule: netReason.startsWith("agent ") ? "network_agent_verification" : "network_scope" }).catch(() => {});
    }
    return [200, { outcome: "decline", declined_by: "network", reason: netReason }];
  }

  try {
    const d = await callBank("/api/bank/decide", {
      token: id, card_ref: t.card_ref, agent_id: t.agent_id, policy_id: t.policy_id,
      merchant, amount, currency: body.currency || "AUD", description: body.description, request_id: body.request_id,
      intent_ref,
      amount_type: body.amount_type,
      network: {
        simulated: true,
        instruction_id: t.instruction_id,
        instruction_status: t.instruction_status,
        mandate_id: t.mandate_id,
        purchase_type: t.purchase_type,
        agentic_token: t.agentic_token,
        agent_verified: true, // the network verified the agent's signature (simulated)
        agent_signature_scheme: "HMAC-SHA256 (simulated)",
        cryptogram: randomBytes(8).toString("hex"), // one-time, per authorisation
        intent_ref: intent_ref || null,
      },
    });
    record({ type: "authorise", token: id, merchant: merchant.name, amount, result: d.outcome, reason: d.reason });
    return [200, { ...d, declined_by: d.outcome === "decline" ? "bank" : undefined }];
  } catch (e) {
    // fail closed
    record({ type: "authorise", token: id, merchant: merchant.name, amount, result: "declined_by_network", reason: "bank unreachable" });
    return [200, { outcome: "decline", declined_by: "network", reason: "bank unreachable, failing closed" }];
  }
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>Network token service (mock)</title>
<style>body{font:14px system-ui;margin:24px;max-width:1000px}table{border-collapse:collapse;width:100%;margin-bottom:24px}
td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f4f4f4}h2{margin:16px 0 8px}</style>
<h1>Simulated card network <small>(stand-in for a Visa / Mastercard token service)</small></h1>
<h2>Agent registry <small>(simulated)</small></h2><table id="a"></table><h2>Token vault</h2><table id="v"></table><h2>Activity</h2><table id="l"></table>
<script>
function fill(id,cols,rows){const t=document.getElementById(id);t.textContent="";
const h=t.insertRow();cols.forEach(c=>{const th=document.createElement("th");th.textContent=c;h.appendChild(th)});
rows.forEach(r=>{const tr=t.insertRow();cols.forEach(c=>{const v=r[c];tr.insertCell().textContent=v==null?"":typeof v==="object"?JSON.stringify(v):v})})}
async function tick(){const a=await (await fetch("/agents")).json();fill("a",["id","name","type","public_key"],a);const v=await (await fetch("/tokens")).json();const l=await (await fetch("/log")).json();
fill("v",["token","agent_id","instruction_status","status","expiry","scope"],v);
fill("l",["time","type","token","merchant","amount","result","reason"],l)}
tick();setInterval(tick,2000);
</script>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, "");
  try {
    if (req.method === "GET" && path === "/") return send(res, 200, PAGE, "text/html");
    if (req.method === "GET" && path === "/tokens") return send(res, 200, [...vault.values()]);
    if (req.method === "GET" && path === "/log") return send(res, 200, log);
    let m;
    if (req.method === "GET" && (m = path.match(/^\/tokens\/([\w-]+)$/))) {
      const t = vault.get(m[1]);
      return t ? send(res, 200, t) : send(res, 404, { error: "unknown token" });
    }
    if (req.method === "POST" && path === "/tokens") {
      const [s, b] = await createToken(await readJson(req));
      return send(res, s, b);
    }
    if (req.method === "POST" && (m = path.match(/^\/tokens\/([\w-]+)\/revoke$/))) {
      const t = vault.get(m[1]);
      if (!t) return send(res, 404, { error: "unknown token" });
      t.status = "revoked";
      record({ type: "revoke", token: t.token, agent_id: t.agent_id, result: "revoked" });
      return send(res, 200, t);
    }
    // Public agent registry. Secrets are never listed.
    if (req.method === "GET" && path === "/agents") {
      return send(res, 200, AGENTS.map(({ id, name, type, public_key }) => ({ id, name, type, public_key, verified: true })));
    }
    // Simulated AGENT RUNTIME: lets the demo act as an agent that holds its own secret and signs a request.
    // (A real agent signs locally; the bank never sees agent secrets.)
    if (req.method === "POST" && path === "/demo/agent-sign") {
      const b = await readJson(req);
      const a = agentById.get(b.agent_id);
      if (!a) return send(res, 404, { error: "unknown agent" });
      return send(res, 200, { signature: sign(a.secret, b) });
    }
    if (req.method === "POST" && path === "/intents") {
      const b = await readJson(req);
      const ref = "ord_" + randomBytes(4).toString("hex");
      intents.set(ref, { description: String(b.description ?? ""), line_items: Array.isArray(b.line_items) ? b.line_items.map(String) : [] });
      return send(res, 201, { intent_ref: ref });
    }
    if (req.method === "GET" && (m = path.match(/^\/intent\/([\w-]+)$/))) {
      const i = intents.get(m[1]);
      return i ? send(res, 200, { intent_ref: m[1], ...i }) : send(res, 404, { error: "unknown intent" });
    }
    // Like Visa's cancel-instruction: stops FUTURE credentials, but a credential already issued keeps working.
    if (req.method === "POST" && (m = path.match(/^\/tokens\/([\w-]+)\/cancel-instruction$/))) {
      const t = vault.get(m[1]);
      if (!t) return send(res, 404, { error: "unknown token" });
      t.instruction_status = "cancelled";
      record({ type: "cancel-instruction", token: t.token, instruction_id: t.instruction_id, result: "instruction cancelled; issued credential still active" });
      return send(res, 200, t);
    }
    if (req.method === "POST" && path === "/reset") {
      vault.clear();
      intents.clear();
      log.length = 0;
      record({ type: "reset", result: "cleared" });
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && path === "/authorise") {
      const [s, b] = await authorise(await readJson(req));
      return send(res, s, b);
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`network token service on http://localhost:${PORT}  (bank: ${BANK_URL})`));
