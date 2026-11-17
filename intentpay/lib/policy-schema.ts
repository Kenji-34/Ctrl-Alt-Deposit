
import { z } from "zod";

export const PolicySchema = z.object({
  maxAmountCents: z.number().int(),
  currency: z.string(),
  merchant: z.string(),
  category: z.string(),
  period: z.enum(["week", "month", "once"]).default("once"),
  // "fixed": the price cannot be partly paid (subscriptions, flights). Over the limit means no, never a part-payment.
  amountType: z.enum(["flexible", "fixed"]).default("flexible"),
  prohibitedItems: z.array(z.string()),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string()
});
