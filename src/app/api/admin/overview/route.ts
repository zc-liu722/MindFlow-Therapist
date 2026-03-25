import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import { jsonWithKey } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function GET() {
  try {
    await requireRole("admin");
    const overview = await getAdminOverview();
    return jsonWithKey("overview", overview);
  } catch (error) {
    return errorResponse(error, "未授权", [{ match: "FORBIDDEN", status: 403 }], 401);
  }
}
