import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { AnthropicConfigError, AnthropicRequestError } from "@/lib/anthropic";
import { completeSession } from "@/lib/domain";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    assertRateLimit({
      key: `session-complete:${getClientIp(request)}`,
      limit: 20,
      windowMs: 60_000
    });
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    const result = await completeSession(user, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "结束失败";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "FORBIDDEN"
          ? 403
          : message === "RATE_LIMITED"
            ? 429
          : message === "NOT_FOUND"
            ? 404
            : error instanceof AnthropicConfigError
              ? 503
              : error instanceof AnthropicRequestError
                ? error.status
                : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
