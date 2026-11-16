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

## What is simulated

- The card network (`../network`) is a stand-in, labelled "Simulated card network" in the UI. No real card scheme or money.
- Merchant verification is a small stub (`lib/merchant-lookup.ts`). The interface `lookupMerchant(name, abn?)` is stable so the real merchant database can replace it.
- One hard-coded demo customer.

## Known limits and what is left

- The overall cap only covers spending made **through this bank**. It cannot see spending elsewhere.
- Gemini rule generation has no offline fixture yet; without a key the box shows a notice.
- **Legacy path, left untouched:** `app/api/transaction/authorize/route.ts` (Kenji's original) is a separate decision path with a lifetime budget, no receipts and no overall cap. The demo and all UI use only `/api/bank/decide`. It should be retired or routed through `lib/bank-pipeline.ts`.
- Not built yet: audit view, revocation contrast scene, network-field mirroring (P1).
