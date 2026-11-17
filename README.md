# intentpay: a bank-side control layer for AI-agent payments

Westpac Innovation and Coding Competition entry (Ctrl-Alt-Deposit).

AI agents (ChatGPT, Gemini, Perplexity, ...) are about to spend customers' money. Card networks can check each agent's token, but **only the bank sees every agent at once**. intentpay is the bank-side layer that does that: one customer, many agents, each with its own mandates, all under one overall spending cap.

> **Everything involving a card network is simulated.** `network/` is a stand-in service, not Visa or Mastercard. No real money, cards or schemes are involved. It is modelled loosely on public descriptions of Visa Intelligent Commerce and Mastercard Agent Pay.

## The idea in 30 seconds
- **Customer, then agents, then mandates.** An agent is an AI platform identity (ChatGPT, Gemini...). Its mandates say what it may spend, where, and how much. A purpose (groceries, travel) belongs to the mandate, not the agent.
- **Overall cap across all agents** (for example $300 per week). The tighter of an agent's budget and the overall cap wins, so a payment can be cut down or declined even when the agent's own budget has room. No single token can see this.
- **Rules decide, AI only advises.** Decisions come from deterministic rules (approve, approve narrower, ask the customer, decline). An optional AI check (Gemini) can only make the outcome *stricter*, never looser.
- **Agent identity comes from the network**, not the bank. The network registry verifies agents, and payments carry a signature; a spoofed agent is blocked at the network and the bank still records the attempt.
- **Plain-English mandates.** The customer types a sentence, the app fills in the rules, and the customer confirms a plain-English summary.
- **Audit view.** Every decision has a receipt: who delegated, which rule fired, the token, and a timeline.
- **Revoke at the bank** blocks the very next payment. Cancelling only at the network does not stop an already-issued card. Scene C shows the difference.

## Repo layout
| Folder | What it is |
| --- | --- |
| `intentpay/` | The bank: Next.js app (Cards screen, mandate creation, demo page, audit view) and the decision API (`/api/bank/decide`). Details in `intentpay/README.md`. |
| `network/` | The simulated card network (plain Node, no dependencies): token vault, agent registry, signatures, `/authorise`. |
| `demo-autoplay/` | Playwright script that drives the real UI and records the demo video. |

## Run it
Needs Node 22.5 or newer.
```
# terminal 1: the bank
cd intentpay
npm install
npm run dev            # http://localhost:3000

# terminal 2: the simulated network
cd network
node server.mjs        # http://localhost:4000
```
Open http://localhost:3000/agent (best in a phone-sized window). Press **Reset demo** on `/demo` any time to return to the seeded state: ChatGPT, Gemini and Perplexity with mandates, $240 of a $300 weekly cap already spent.

**Optional Gemini.** Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in `intentpay/.env.local` for the real AI check and rule reader. Without it, clearly labelled "demo fixture" stand-ins are used so everything still works.

**Tests:** `cd intentpay && npm test` (rule engine, 26 tests).

## Demo scenes (`/demo`)
| Scene | Shows |
| --- | --- |
| A | The overall cap wins over an agent's own budget |
| B | New merchants go to the customer; lookalikes are declined |
| C | Network-only cancel vs bank revoke |
| D | AI check: advisory, can only make decisions stricter |
| E | Fixed-price vs flexible mandates |
| F | A spoofed agent is blocked at the network |

## Autoplay video
```
cd demo-autoplay
npm install
npx playwright install ffmpeg
npm run demo:play                    # watch it
npm run demo:record                  # video saved to demo-autoplay/out/
npm run demo:record -- --scene A     # retake one scene
```
See `demo-autoplay/README.md` and edit `demo-autoplay/src/beats.mjs` to change captions and timing.

## Known limits
- The legacy `/api/transaction/authorize` path is left untouched; the new flow goes through `/api/bank/decide`.
- The overall cap counts spending made through this bank only.
- Merchant recognition uses a stub (`lib/merchant-lookup.ts`) behind a stable interface, ready to swap for a real merchant database.
- The Gemini model name default is unverified; set `GEMINI_MODEL` if needed.
