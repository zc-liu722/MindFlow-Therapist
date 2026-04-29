import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-errors";
import { toPublicUserBillingState } from "@/lib/billing";
import type { UserPreferencesUpdateRequestBody } from "@/lib/api-types";
import {
  parseJsonBody
} from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { getCurrentUser, requireRole, updateUserPreferences } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonWithKey("user", null);
  }

  return jsonWithKey("user", toPublicUserBillingState(user));
}

export async function PATCH(request: Request) {
  try {
    const user = await requireRole("user");
    const body = await parseJsonBody<UserPreferencesUpdateRequestBody>(request);
    const progressDisplay = body.progressDisplay;

    if (
      progressDisplay !== undefined &&
      progressDisplay !== "show" &&
      progressDisplay !== "minimal" &&
      progressDisplay !== "hidden"
    ) {
      return NextResponse.json({ error: "进度条显示模式不合法" }, { status: 400 });
    }

    const updatedUser = await updateUserPreferences(user.id, {
      progressDisplay
    });

    return jsonWithKey("user", toPublicUserBillingState(updatedUser));
  } catch (error) {
    return errorResponse(error, "用户设置更新失败", [{ match: "UNAUTHORIZED", status: 401 }], 400);
  }
}
