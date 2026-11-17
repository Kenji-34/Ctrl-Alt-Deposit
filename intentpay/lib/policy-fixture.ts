// Fallback when Gemini has no key or fails: a simple pattern reader, so the setup step never dies.
// It is NOT AI. The customer still edits and confirms every field.
import type { z } from "zod";
import type { PolicySchema } from "@/lib/policy-schema";

type Policy = z.infer<typeof PolicySchema>;

const MERCHANTS = ["Woolworths", "Coles", "Aldi", "IGA", "Qantas", "Jetstar", "Netflix", "Spotify", "Officeworks"];

export function parsePolicyFallback(prompt: string): Policy {
  const text = prompt.toLowerCase();
  const m = /\$\s?(\d+(?:\.\d{1,2})?)/.exec(prompt) ?? /(\d+(?:\.\d{1,2})?)\s*(?:dollars|aud)/i.exec(prompt);
  const cents = m ? Math.round(Number(m[1]) * 100) : 0;

  const period = /(week|weekly)/.test(text) ? "week" : /(month|monthly)/.test(text) ? "month" : "once";
  const merchant = MERCHANTS.find((x) => text.includes(x.toLowerCase())) ?? "";
  const category = /(supplier|invoice)/.test(text)
    ? "supplier invoices"
    : /(office|stationery)/.test(text)
      ? "office supplies"
      : /(grocer|food|supermarket)/.test(text)
    ? "groceries"
    : /(netflix|spotify|subscription|streaming)/.test(text)
      ? "subscriptions"
      : /(flight|qantas|jetstar|travel)/.test(text)
        ? "travel"
        : "general";

  return {
    maxAmountCents: cents,
    currency: "AUD",
    merchant,
    category,
    period,
    amountType: category === "subscriptions" || category === "supplier invoices" || category === "travel" ? "fixed" : "flexible",
    prohibitedItems: [],
    needsClarification: cents === 0,
    clarificationQuestion: cents === 0 ? "How much can the agent spend?" : "",
  } as Policy;
}
