import { NextResponse } from "next/server";

import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import type { RegisterRequestBody } from "@/lib/api-types";
import {
  applyOptionalIpRateLimit,
  applyUserRateLimit,
  parseJsonBody,
  requireTrimmedString
} from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { createAuthSession, registerUser } from "@/lib/auth";
import { createId } from "@/lib/crypto";
import { writeDb } from "@/lib/db";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<RegisterRequestBody>(request);

    const username = requireTrimmedString(body.username, "请输入用户名");
    if (username instanceof NextResponse) {
      return username;
    }

    const password = body.password ?? "";
    const displayName = body.displayName?.trim() || username;

    applyOptionalIpRateLimit(request, "auth-register", 6, 10 * 60_000);
    applyUserRateLimit("auth-register", username.toLowerCase(), 4, 10 * 60_000);

    const user = await registerUser({
      username,
      displayName,
      password,
      role: body.role ?? "user",
      adminInviteCode: body.adminInviteCode,
      privacyConsent: body.privacyConsent,
      aiProcessingConsent: body.aiProcessingConsent
    });

    await createAuthSession(user.id);
    await writeDb((draft) => {
      draft.analyticsEvents.push({
        id: createId("evt"),
        userHash: user.analyticsId,
        type: "register",
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
      "注册失败",
      [
        { match: "RATE_LIMITED", status: 429 },
        {
          match: ["ADMIN_INVITE_CODE_MISSING", "ADMIN_INVITE_CODE_INSECURE"],
          status: 503
        }
      ],
      400
    );
  }
}
