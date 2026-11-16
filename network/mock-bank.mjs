// TEST STUB ONLY: stands in for the real bank endpoints in intentpay so the network
// can be developed and tested alone. Run: node mock-bank.mjs  (port 4001)
// Then start the network with: BANK_URL=http://localhost:4001 node server.mjs
import http from "node:http";

const PORT = Number(process.env.PORT || 4001);

http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

  if (req.url === "/api/bank/approve-provisioning") return json({ approved: true, reason: "Policy confirmed by customer" });
  if (req.url === "/api/bank/decline-notice") return json({ receipt_id: "rcpt_" + Date.now() });
  if (req.url === "/api/bank/decide") {
    const flags = body.merchant?.flags || [];
    if (flags.includes("lookalike")) return json({ outcome: "decline", reason: "Merchant name closely imitates a known supermarket and is not a verified grocer.", receipt_id: "rcpt_" + Date.now() });
    if (flags.includes("new_business")) return json({ outcome: "ask_customer", reason: "First time paying this business. Asking you to confirm.", receipt_id: "rcpt_" + Date.now() });
    return json({ outcome: "approve", reason: "Verified merchant, within your policy.", receipt_id: "rcpt_" + Date.now() });
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`mock bank stub on http://localhost:${PORT}`));
