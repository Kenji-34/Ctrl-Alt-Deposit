// STUB: replace the body of lookupMerchant with the real merchant database.
// Contract: given what the transaction says about the merchant, return
//   "verified"  - known, legitimate merchant
//   "lookalike" - name imitates a known merchant but is not it
//   "unknown"   - not in the database (new business)
import type { MerchantStatus } from "./bank-decide";
import { BUSINESS_MERCHANTS } from "./business-data.ts"; // invented suppliers for the simulated Harbour Print Co demo

const KNOWN = [
  "coles", "woolworths", "aldi", "iga",
  "qantas", "jetstar", "virgin australia", "netflix", "spotify",
  "officeworks", // business office supplies
  "cloud hosting invoice", "domain renewal", // business supplier invoices
  ...BUSINESS_MERCHANTS, // simulated suppliers and payees of the business profile
];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length][b.length];
}

export function lookupMerchant(name: string, abn?: string): MerchantStatus {
  void abn; // the real lookup should prefer the ABN when present
  const n = name.trim().toLowerCase();
  if (KNOWN.includes(n)) return "verified";
  const close = KNOWN.some((k) => distance(n, k) <= (k.length <= 5 ? 1 : 2));
  return close ? "lookalike" : "unknown";
}
