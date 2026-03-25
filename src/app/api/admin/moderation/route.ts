import { NextResponse } from "next/server";

import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import type { ModerationActionRequestBody } from "@/lib/api-types";
import { parseJsonBody, requireTrimmedString } from "@/lib/api-route";
import { okJson } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { updateModerationAccount } from "@/lib/admin";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function POST(request: Request) {
  try {
    const admin = await requireRole("admin");
    const body = await parseJsonBody<ModerationActionRequestBody>(request);

    const userId = requireTrimmedString(body.userId, "缺少 userId");
    if (userId instanceof NextResponse) {
      return userId;
    }

    if (body.action !== "reinstate" && body.action !== "clear_warnings") {
      return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
    }

    const result = await updateModerationAccount({
      adminUserId: admin.id,
      userId,
      action: body.action
    });

    return okJson(result);
  } catch (error) {
    return errorResponse(
      error,
      "操作失败",
      [
        { match: "NOT_FOUND", status: 404 },
        { match: "FORBIDDEN", status: 403 }
      ],
      401
    );
  }
}
