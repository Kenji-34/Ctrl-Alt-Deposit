# network: mock card-network token service

Stands in for Visa VTS / Mastercard MDES. The bank (intentpay) is a separate service.
Zero dependencies, Node 18+.

```
node server.mjs                      # port 4000, BANK_URL defaults to http://localhost:3000
BANK_URL=http://localhost:4001 node server.mjs   # point at the test stub instead
node mock-bank.mjs                   # optional test stub for the bank (port 4001)
```
Open http://localhost:4000 for a live view of the vault and activity.

## Network endpoints (agent / bank UI call these)
- `POST /tokens` `{ card_ref, agent_id, scope:{categories:[], max_per_txn}, expiry, policy_id }` -> 201 token, or 403 if the bank declines provisioning
- `POST /authorise` `{ token, merchant:{name, category, flags?}, amount, currency?, description? }` -> `{ outcome: approve | approve_narrower | ask_customer | decline, reason, declined_by?, receipt_id?, approved_amount? }`
- `POST /tokens/:id/revoke` -> token with status `revoked`
- `GET /tokens`, `GET /tokens/:id`, `GET /log`

## Bank endpoints the network calls (intentpay must implement)
- `POST /api/bank/approve-provisioning` `{ card_ref, agent_id, scope, expiry, policy_id }` -> `{ approved: bool, reason }`
- `POST /api/bank/decide` `{ token, card_ref, agent_id, policy_id, merchant, amount, currency, description }` -> `{ outcome, reason, receipt_id, approved_amount? }`
- `POST /api/bank/decline-notice` `{ token, card_ref, agent_id, policy_id, merchant, amount, reason, declined_by }` -> `{ receipt_id }` (network-side declines, so the bank logs every attempt)

The network checks token exists, active, unexpired, category and per-txn amount first; the bank decides the rest.
If the bank is unreachable the network fails closed (decline).

## Quick test
```
curl -s localhost:4000/tokens -H 'content-type: application/json' -d '{"card_ref":"card_001","agent_id":"agent_shopper_7","scope":{"categories":["groceries"],"max_per_txn":150},"expiry":"2026-11-23T00:00:00Z","policy_id":"pol_001"}'
curl -s localhost:4000/authorise -H 'content-type: application/json' -d '{"token":"<tok_id>","merchant":{"name":"Coles","category":"groceries"},"amount":42}'
```
