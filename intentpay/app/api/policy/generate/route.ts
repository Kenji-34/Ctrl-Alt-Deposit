
import { GoogleGenAI } from "@google/genai";
import { PolicySchema } from "@/lib/policy-schema";
import { parsePolicyFallback } from "@/lib/policy-fixture";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "missing"
});

export async function POST(request: Request) {
  let promptText = "";
  try {
    const body = await request.json();
    if (typeof body.prompt === "string") promptText = body.prompt;

    if (
      typeof body.prompt !== "string" ||
      !body.prompt.trim() ||
      body.prompt.length > 2000
    ) {
      return Response.json(
        { error: "Please enter a valid instruction" },
        { status: 400 }
      );
    }

    // No key: use the simple pattern reader so setup still works. The customer edits and confirms anyway.
    if (!process.env.GEMINI_API_KEY) {
      return Response.json({
        status: "DRAFT", source: "fixture", originalPrompt: body.prompt, policy: parsePolicyFallback(body.prompt),
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",

      contents: body.prompt,

      config: {
        systemInstruction: `
          Convert customer shopping instructions
          into a structured payment policy.

          Rules:
          - Never invent a spending limit.
          - Convert money into integer cents.
          - Default to AUD.
          - Unspecified merchant = empty string.
          - Unspecified category = "general".
          - period is "week", "month" or "once".
            Use "once" when no repeat is stated.
          - Unspecified prohibitedItems = [].
          - If no spending limit is given, use 0
            and set needsClarification to true.
          - Set needsClarification to true if
            instructions are ambiguous.
          - Use an empty clarificationQuestion
            when clarification is unnecessary.
          - Never approve a payment.
        `,

        responseMimeType: "application/json",

        responseJsonSchema: {
          type: "object",
          properties: {
            maxAmountCents: { type: "integer" },
            currency: { type: "string" },
            merchant: { type: "string" },
            category: { type: "string" },
            period: { type: "string", enum: ["week", "month", "once"] },
            prohibitedItems: {
              type: "array",
              items: { type: "string" }
            },
            needsClarification: { type: "boolean" },
            clarificationQuestion: { type: "string" }
          },
          required: [
            "maxAmountCents",
            "currency",
            "merchant",
            "category",
            "period",
            "prohibitedItems",
            "needsClarification",
            "clarificationQuestion"
          ],
          additionalProperties: false
        }
      }
    });

    if (!response.text) {
      throw new Error("Gemini returned no text");
    }

    const result = JSON.parse(response.text);
    const policy = PolicySchema.parse(result);

    if (
      !Number.isSafeInteger(policy.maxAmountCents) ||
      policy.maxAmountCents < 0 ||
      (!policy.needsClarification &&
        policy.maxAmountCents === 0)
    ) {
      return Response.json(
        { error: "Invalid spending limit" },
        { status: 422 }
      );
    }

    return Response.json({
      status: "DRAFT",
      originalPrompt: body.prompt,
      policy
    });

  } catch (error) {
    console.error("Gemini API error:", error);

    // Gemini failed: fall back to the pattern reader rather than a blank screen.
    try {
      if (promptText.trim()) {
        return Response.json({ status: "DRAFT", source: "fixture", originalPrompt: promptText, policy: parsePolicyFallback(promptText) });
      }
    } catch {}
    return Response.json(
      { error: "Failed to generate policy" },
      { status: 500 }
    );
  }
}
