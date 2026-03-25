import { requireRole } from "@/lib/auth";
import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import type { SessionRouteContext, SessionUpdateRequestBody } from "@/lib/api-types";
import { applyUserRateLimit, parseJsonBody } from "@/lib/api-route";
import { jsonWithKey, okJson } from "@/lib/api-response";
import { deleteSessionForUser, getSessionForUser, updateSessionPace } from "@/lib/domain";
import { normalizeSessionPace } from "@/lib/session-pace";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function GET(
  request: Request,
  context: SessionRouteContext
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    applyUserRateLimit("session-detail", user.id, 120, 60_000, sessionId);
    const session = await getSessionForUser(user.id, sessionId);
    return jsonWithKey("session", session);
  } catch (error) {
    return errorResponse(
      error,
      "读取失败",
      [
        { match: "RATE_LIMITED", status: 429 },
        { match: "NOT_FOUND", status: 404 }
      ],
      401
    );
  }
}

export async function DELETE(
  request: Request,
  context: SessionRouteContext
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    applyUserRateLimit("session-delete", user.id, 20, 60_000, sessionId);
    const result = await deleteSessionForUser(user, sessionId);
    return okJson(result);
  } catch (error) {
    return errorResponse(
      error,
      "删除失败",
      [
        { match: "RATE_LIMITED", status: 429 },
        { match: "NOT_FOUND", status: 404 }
      ],
      401
    );
  }
}

export async function PATCH(
  request: Request,
  context: SessionRouteContext
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    applyUserRateLimit("session-update", user.id, 60, 60_000, sessionId);
    const body = await parseJsonBody<SessionUpdateRequestBody>(request);

    const session = await updateSessionPace(user, sessionId, normalizeSessionPace(body.pace));
    return jsonWithKey("session", session);
  } catch (error) {
    return errorResponse(
      error,
      "更新失败",
      [
        { match: "RATE_LIMITED", status: 429 },
        { match: "NOT_FOUND", status: 404 }
      ],
      401
    );
  }
}
