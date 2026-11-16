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

## Demo customer

One customer, a **$300 per week overall cap** (change it on the Cards screen), and three agents:

| Agent | Budget | Category |
|---|---|---|
| Grocery agent | $150 / week | groceries (no gift cards or alcohol) |
| Flights agent | $200 / week | travel |
| Subscriptions agent | $80 / month | subscriptions |

Each is inside its own budget; together they could spend $430, more than the $300 cap.

### Scene A: aggregate authority
Run the four steps on `/demo`: Grocery $140 (approved), Flights $150 (approved), Subscriptions Netflix $40
(**reduced to $10** by the overall cap), Spotify $20 (**declined**, overall cap reached). The reason text and
"Limit applied" label say it was the overall cap, not the agent's own budget.

### Scene C: cancel at the network vs revoke at the bank
Press **Reset demo** first. Grocery purchase (approved) → "Cancel the instruction at the network only" → the
already-issued card **still works** (modelled on Visa's documented behaviour: cancelling an instruction does not
invalidate credentials already issued) → "Revoke at the bank" → the next payment is **declined by the bank** immediately,
before the network has been told.

### Scene D: AI consistency check
Press **Reset demo** first. Four purchases at the Grocery agent with basket details: plain groceries (passes), a mixed
basket (**asks you**), a TV in a grocery basket (**blocked**), and a messy descriptor "WOOLIES*SYD" (the rules ask you
because the merchant is unknown; the AI check adds a hint that it looks like Woolworths, but cannot approve it).

### Scene B: new merchants
Press **Reset demo** first. Fresh Harvest Market $30 goes to **ask customer**; approve it on the prompt and it goes
through. "Cooles" is declined as a lookalike. A gift-card purchase is declined as a prohibited item.
Customer approval only resolves the unknown-merchant question. Budget, caps, prohibited items and lookalikes still apply.

## What changed on this branch

- Overall customer cap: `decide()` takes the tighter of the agent budget and the cap, records which limit applied.
- Agent registry (`agents` table), mandates belong to agents, **Revoke agent** stops all its cards at the bank and the network.
- Pending approvals for `ask_customer`, with approve/reject and receipts.
- `request_id` idempotency on `/api/bank/decide`; the decision runs in an IMMEDIATE transaction so concurrent payments cannot jointly breach a cap.
- Receipts store the `rule` code and `limited_by`.
- Database changes are additive (new tables and columns). If something misbehaves, delete `data/intentpay.db`.

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
