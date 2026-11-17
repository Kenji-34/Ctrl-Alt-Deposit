// The /api/demo/* routes wipe data and play the part of an agent. They exist only for the demo:
// they run when NODE_ENV is not "production", or when DEMO_MODE=true is set explicitly.
export function demoDisabledResponse(): Response | null {
  if (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true") return null;
  return Response.json(
    { error: "Demo endpoints are disabled. Set DEMO_MODE=true to enable them." },
    { status: 403 }
  );
}
