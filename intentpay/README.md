# intentpay: a bank-side control layer for AI-agent payments

A mock Westpac app (this folder, Next.js, port 3000) plus a mock card network (`../network`, port 4000).

**Idea:** card networks can check coarse token claims. The bank is the party that knows who the customer is, what they
authorised, and what they have already spent across *all* their agents. intentpay adds that bank-side layer.
It is complementary to the networks' agent-payment work, not a replacement for it.

**Principle:** AI proposes, deterministic rules decide, and AI may only tighten. Every payment decision is made by
`lib/bank-decide.ts`, a pure function with no AI in it. Outcomes: `approve`, `approve_narrower`, `ask_customer`, `decline`.
It fails closed.

## Run it

```bash
# terminal 1: simulated card network
cd network
node server.mjs            # http://localhost:4000

# terminal 2: the bank app
cd intentpay
npm install
npm run dev                # http://localhost:3000
```

Optional: `GEMINI_API_KEY=...` in `intentpay/.env.local` enables the plain-English rule box on the new-card screen.
The app works without it (rules can be typed in).

- `/agent` is the Cards screen: overall cap (editable), your agents, cards, approvals, activity.
- `/demo` is the scripted demo page. **Reset demo** clears transactions, receipts, pending approvals and tokens, then
  re-seeds the customer and agents, so a scene can be re-recorded cleanly.
- Tests: `npm test` (unit tests for the decision rules).

## Model: customer, agents, mandates

Following how the networks define it: an **agent is an AI platform identity** (ChatGPT, Gemini, Perplexity), not a spending
purpose. Hierarchy: **customer -> agents -> mandates (policies)**. A purpose like "groceries" belongs to a mandate.
Reasons and receipts name both: "ChatGPT's groceries mandate".

## Demo customer

One customer, a **$300 per week overall cap** (editable on the Cards screen), three agents (type "AI assistant"):

| Agent | Mandate | Limit | Price type | Spent already (seeded) |
|---|---|---|---|---|
| ChatGPT | groceries | $150 / week | flexible | $80 |
| ChatGPT | flights (travel) | $200 / week | fixed | $60 |
| Gemini | groceries | $150 / week | flexible | $70 |
| Gemini | subscriptions | $80 / month | fixed | $30 |
| Perplexity | none yet | | | |

Both grocery mandates together are $300, and every mandate is inside its own budget, but the seeded history leaves only
**$60** under the overall cap while Gemini's groceries mandate still has $80, so one purchase hits the cap first.
**Reset demo** restores exactly this state.

**Flexible vs fixed:** a flexible purchase (groceries) over what is left is approved for the smaller amount. A fixed-price
purchase (a subscription, a flight) is never part-paid: it is approved in full or declined. The flag lives on the mandate
(`amountType`); a purchase can also mark itself fixed, which only makes the decision stricter.

### Scene A: the overall cap wins
Gemini groceries $75 at Woolworths is **reduced to $60** (Gemini's own mandate had $80 left; the overall cap is tighter).
Gemini $10 at Coles is **declined** (cap reached), and so is ChatGPT's flight, because the cap covers every agent.

### Scene E: fixed price vs flexible
Netflix $55 against the $50 left in Gemini's subscriptions mandate is **declined, not part-paid**. Spotify $12 fits and is
approved. Woolworths $90 (flexible) is **reduced** instead of declined.

### Scene F: a spoofed agent
Press **Reset demo** first. An attacker holds ChatGPT's card token and claims to be ChatGPT, but cannot sign as ChatGPT: the
**network** declines it ("agent signature invalid", then "agent signature missing"), and the bank still records both attempts
as network declines. The real ChatGPT, correctly signed, is approved.

### Scene C: cancel at the network vs revoke at the bank
Press **Reset demo** first. A Gemini groceries purchase (approved) → "Cancel the instruction at the network only" → the
already-issued card **still works** (modelled on Visa's documented behaviour: cancelling an instruction does not
invalidate credentials already issued) → "Revoke at the bank" → the next payment is **declined by the bank** immediately,
before the network has been told.

### Scene D: AI consistency check
Press **Reset demo** first. Four purchases under Gemini's groceries mandate with basket details: plain groceries (passes), a mixed
basket (**asks you**), a TV in a grocery basket (**blocked**), and a messy descriptor "WOOLIES*SYD" (the rules ask you
because the merchant is unknown; the AI check adds a hint that it looks like Woolworths, but cannot approve it).

### Scene B: new merchants
Press **Reset demo** first. Fresh Harvest Market $30 goes to **ask customer**; approve it on the prompt and it goes
through. "Cooles" is declined as a lookalike. A gift-card purchase is declined as a prohibited item.
Customer approval only resolves the unknown-merchant question. Budget, caps, prohibited items and lookalikes still apply.

## What changed on this branch

- Overall customer cap: `decide()` takes the tighter of the agent budget and the cap, records which limit applied.
- Agent registry (`agents` table, with a type): mandates belong to agents. **Revoke agent** revokes all its mandates and tokens at the bank and the network. The Cards screen groups mandates under their agent, and the new-card flow asks which agent first.
- Pending approvals for `ask_customer`, with approve/reject and receipts.
- `request_id` idempotency on `/api/bank/decide`; the decision runs in an IMMEDIATE transaction so concurrent payments cannot jointly breach a cap.
- Receipts store the `rule` code and `limited_by`.
- Database changes are additive (new tables and columns). If something misbehaves, delete `data/intentpay.db`.

## Agent identity (simulated)

Agent identity is established by the **network**, not the bank:
- The network has an agent registry (`GET /agents`: id, name, type, simulated public key; secrets are never listed).
- Cards screen: you pick an agent **from that registry** (no free-text names) and it shows a **Verified by network (simulated)** badge.
  The bank's `agents` row stores the network's agent id (`network_agent_id`) and relies on the network's attestation.
- Token provisioning **fails** if the agent id is not in the network registry.
- On each payment the agent signs the request (HMAC-SHA256 over token, agent id, merchant, category, amount and timestamp,
  with the agent's secret). The network declines a missing, invalid, stale or mismatched signature, and the bank still receipts the
  attempt as a network decline (rule `network_agent_verification`).
- This is a **simulation**. Real systems use cryptographic agent identity (for example Visa's agent signatures or Mastercard's
  registered agent tokens), with asymmetric keys verified against a public key. Here an HMAC secret stands in, and the demo's
  `/demo/agent-sign` endpoint plays the agent's own runtime. The bank never holds agent secrets.
- The registry also lists Claude and Microsoft Copilot so there is something to register from the picker.

## AI check (P1)

`lib/ai-check.ts` + `applyAiCheck()` in `lib/bank-decide.ts`. Advisory and **escalate-only**:
- Runs only after the deterministic rules, and only if they did not decline.
- Inputs: merchant descriptor, category, amount, the customer's original sentence and structured policy (core).
  If the payment carries an `intent_ref`, the bank fetches basket details from the simulated network
  (`GET /intent/:ref`, like looking up a Mastercard Order ID). If that fails, core fields only.
- Can turn approve into ask-customer, or into decline when confidence >= 0.85. It can never turn a decline or an
  ask-customer into an approve, and never changes the rule-based merchant and lookalike outcomes. A customer's own
  confirmation is not second-guessed.
- If the call errors, times out (2s) or returns invalid JSON, the rule outcome stands and the receipt says "AI check skipped".
- With no `GEMINI_API_KEY`, a clearly labelled **demo fixture** (a small canned heuristic, not AI) is used so the demo works offline.
  Verify the model id in Google AI Studio (`GEMINI_MODEL` env var, default `gemini-3.8-flash` is unverified).
- Tests prove the AI result can never loosen a decision.
- Policy generation likewise falls back to a simple pattern reader if Gemini has no key or fails (the customer still edits and confirms).

## Audit view

Every "View receipt" link opens `/audit/<receipt id>`: who delegated, the mandate that applied, the rule that fired, token id,
simulated network fields, the AI check (labelled separately) and a timeline.

## What is simulated

- The card network (`../network`) is a stand-in, labelled "Simulated card network" in the UI. No real card scheme or money.
- Merchant verification is a small stub (`lib/merchant-lookup.ts`). The interface `lookupMerchant(name, abn?)` is stable so the real merchant database can replace it.
- The network's mandate fields (instruction id, mandate id, purchase type, validity window, agentic token bound to the agent,
  one-time cryptogram, order-style intent reference) are **modelled loosely on public descriptions** of Visa Intelligent Commerce and
  Mastercard Agent Pay. They are not live integrations and are labelled simulated in the UI. Check them against the schemes' docs before claiming more.
- One hard-coded demo customer.

## Known limits and what is left

- The overall cap only covers spending made **through this bank**. It cannot see spending elsewhere.
- Gemini rule generation has no offline fixture yet; without a key the box shows a notice.
- **Legacy path, left untouched:** `app/api/transaction/authorize/route.ts` (Kenji's original) is a separate decision path with a lifetime budget, no receipts and no overall cap. The demo and all UI use only `/api/bank/decide`. It should be retired or routed through `lib/bank-pipeline.ts`.
- Not built yet: P2 items (cash-flow awareness, prompt-injection scene, agent-likelihood signal, AI-written explanations).
