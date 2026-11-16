
import { z } from "zod";

export const PolicySchema = z.object({
  maxAmountCents: z.number().int(),
  currency: z.string(),
  merchant: z.string(),
  category: z.string(),
  period: z.enum(["week", "month", "once"]).default("once"),
  prohibitedItems: z.array(z.string()),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string()
});
