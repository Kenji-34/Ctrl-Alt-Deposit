import test from "node:test";
import assert from "node:assert/strict";
import { lookupMerchant } from "../lib/merchant-lookup.ts";

test("known personal and business merchants are verified", () => {
  for (const n of ["Woolworths", "Coles", "Qantas", "Officeworks", "Cloud hosting invoice", "Domain renewal"]) {
    assert.equal(lookupMerchant(n), "verified", n);
  }
});

test("lookalikes of known merchants are flagged", () => {
  assert.equal(lookupMerchant("Offlceworks"), "lookalike");
  assert.equal(lookupMerchant("Cooles"), "lookalike");
});

test("new suppliers and messy descriptors are unknown", () => {
  assert.equal(lookupMerchant("Paper & Co"), "unknown");
  assert.equal(lookupMerchant("OFFICEWORKS*SYD"), "unknown");
});
