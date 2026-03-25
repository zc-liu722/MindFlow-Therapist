import { NextResponse } from "next/server";

import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import type { LoginRequestBody } from "@/lib/api-types";
import {
  applyOptionalIpRateLimit,
  applyUserRateLimit,
  parseJsonBody,
  requireTrimmedString
} from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { createAuthSession, loginUser } from "@/lib/auth";
import { createId } from "@/lib/crypto";
import { writeDb } from "@/lib/db";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<LoginRequestBody>(request);

    const username = requireTrimmedString(body.username, "请输入用户名");
    if (username instanceof NextResponse) {
      return username;
    }

    applyOptionalIpRateLimit(request, "auth-login", 10, 60_000);
    applyUserRateLimit("auth-login", username.toLowerCase(), 8, 60_000);

    const role = body.role ?? "user";
    const { user } = await loginUser(username, body.password ?? "", {
      requiredRole: role,
      privacyConsent: body.privacyConsent,
      aiProcessingConsent: body.aiProcessingConsent
    });

    await createAuthSession(user.id);
    await writeDb((draft) => {
      draft.analyticsEvents.push({
        id: createId("evt"),
        userHash: user.analyticsId,
        type: "login",
        createdAt: new Date().toISOString(),
        metadata: { role: user.role }
      });
    });

    return jsonWithKey("user", {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    return errorResponse(
      error,
      "登录失败",
      [
        { match: "FORBIDDEN_ROLE", status: 403 },
        { match: "INVALID_CREDENTIALS", status: 401 },
        { match: "RATE_LIMITED", status: 429 },
        { match: ({ message }) => message.includes("账号已"), status: 403 }
      ],
      400
    );
  }
}
