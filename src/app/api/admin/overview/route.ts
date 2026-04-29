import { errorResponse } from "@/lib/api-errors";
import { jsonWithKey } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin");
    const overview = await getAdminOverview();
    return jsonWithKey("overview", overview);
  } catch (error) {
    return errorResponse(error, "未授权", [{ match: "FORBIDDEN", status: 403 }], 401);
  }
}
