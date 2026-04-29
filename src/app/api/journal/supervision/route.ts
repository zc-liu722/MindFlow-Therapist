import { errorResponse } from "@/lib/api-errors";
import { applyUserRateLimit } from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getSupervisionJournal } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireRole("user");
    applyUserRateLimit("supervision-journal", user.id, 120, 60_000);
    const journal = await getSupervisionJournal(user.id);
    return jsonWithKey("supervisionJournal", journal);
  } catch (error) {
    return errorResponse(error, "未授权", [{ match: "RATE_LIMITED", status: 429 }], 401);
  }
}
