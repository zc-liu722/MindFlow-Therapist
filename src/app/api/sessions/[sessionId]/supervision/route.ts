import { requireRole } from "@/lib/auth";
import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { errorResponse } from "@/lib/api-errors";
import type { SessionRouteContext } from "@/lib/api-types";
import { applyUserRateLimit } from "@/lib/api-route";
import { okJson } from "@/lib/api-response";
import { AnthropicConfigError, AnthropicRequestError } from "@/lib/anthropic";
import { rerunSupervisionForSession } from "@/lib/domain";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function POST(
  request: Request,
  context: SessionRouteContext
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    applyUserRateLimit("session-supervision", user.id, 20, 60_000, sessionId);
    const result = await rerunSupervisionForSession(user, sessionId);
    return okJson(result);
  } catch (error) {
    return errorResponse(
      error,
      "督导失败",
      [
        { match: "UNAUTHORIZED", status: 401 },
        { match: "FORBIDDEN", status: 403 },
        { match: "RATE_LIMITED", status: 429 },
        { match: "NOT_FOUND", status: 404 },
        { match: "SESSION_NOT_COMPLETED", status: 409 },
        { match: ({ error: current }) => current instanceof AnthropicConfigError, status: 503 },
        {
          match: ({ error: current }) => current instanceof AnthropicRequestError,
          status: error instanceof AnthropicRequestError ? error.status : 400
        }
      ],
      400
    );
  }
}
