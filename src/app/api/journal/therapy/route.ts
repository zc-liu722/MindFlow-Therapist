import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import { applyUserRateLimit } from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getTherapyJournal } from "@/lib/domain";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function GET(request: Request) {
  try {
    const user = await requireRole("user");
    applyUserRateLimit("therapy-journal", user.id, 120, 60_000);
    const journal = await getTherapyJournal(user.id);
    return jsonWithKey("therapyJournal", journal);
  } catch (error) {
    return errorResponse(error, "未授权", [{ match: "RATE_LIMITED", status: 429 }], 401);
  }
}
