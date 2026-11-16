// For the activity feed in the bank app.
import { listReceipts } from "@/lib/bank-receipts";

export async function GET() {
  try {
    return Response.json({ receipts: listReceipts() });
  } catch (error) {
    console.error("Receipts error:", error);
    return Response.json({ error: "Failed to retrieve receipts" }, { status: 500 });
  }
}
