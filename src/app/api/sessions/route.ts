import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import type { SessionCreateRequestBody } from "@/lib/api-types";
import {
  applyUserRateLimit,
  parseJsonBody,
  requireTrimmedString
} from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { createSession, listSessionsForUser } from "@/lib/domain";
import { DEFAULT_SESSION_MODE, normalizeSessionMode } from "@/lib/session-modes";
import { DEFAULT_SESSION_PACE, normalizeSessionPace } from "@/lib/session-pace";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function GET(request: Request) {
  try {
    const user = await requireRole("user");
    applyUserRateLimit("sessions-list", user.id, 120, 60_000);
    const sessions = await listSessionsForUser(user.id);
    return jsonWithKey("sessions", sessions);
  } catch (error) {
    return errorResponse(error, "未授权", [{ match: "RATE_LIMITED", status: 429 }], 401);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("user");
    applyUserRateLimit("sessions-create", user.id, 20, 60_000);
    const body = await parseJsonBody<SessionCreateRequestBody>(request);

    const title = requireTrimmedString(body.title, "请输入 session 标题");
    if (title instanceof NextResponse) {
      return title;
    }

    const session = await createSession(user, {
      title,
      mode: normalizeSessionMode(body.mode ?? DEFAULT_SESSION_MODE),
      pace: normalizeSessionPace(body.pace ?? DEFAULT_SESSION_PACE),
      autoSupervision: body.autoSupervision
    });

    return jsonWithKey("session", session);
  } catch (error) {
    return errorResponse(
      error,
      "创建失败",
      [
        { match: "UNAUTHORIZED", status: 401 },
        { match: "FORBIDDEN", status: 403 },
        { match: "ACTIVE_SESSION_EXISTS", status: 409 },
        { match: "RATE_LIMITED", status: 429 },
        {
          match: ({ message }) =>
            message.startsWith("CURSOR_RULE_LOAD_FAILED:") ||
            message.startsWith("CURSOR_MOD_RULE_LOAD_FAILED:"),
          status: 503
        }
      ],
      500
    );
  }
}
