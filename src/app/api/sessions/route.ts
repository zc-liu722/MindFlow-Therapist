import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { createSession, listSessionsForUser } from "@/lib/domain";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";
import { DEFAULT_SESSION_MODE, normalizeSessionMode } from "@/lib/session-modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertRateLimit({
      key: `sessions-list:${getClientIp(request)}`,
      limit: 120,
      windowMs: 60_000
    });
    const user = await requireRole("user");
    const sessions = await listSessionsForUser(user.id);
    return NextResponse.json({ sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未授权";
    const status = message === "RATE_LIMITED" ? 429 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    assertRateLimit({
      key: `sessions-create:${getClientIp(request)}`,
      limit: 20,
      windowMs: 60_000
    });
    const user = await requireRole("user");
    const body = (await request.json()) as {
      title?: string;
      mode?: string;
    };

    if (!body.title) {
      return NextResponse.json({ error: "请输入 session 标题" }, { status: 400 });
    }

    const session = await createSession(user, {
      title: body.title,
      mode: normalizeSessionMode(body.mode ?? DEFAULT_SESSION_MODE)
    });

    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建失败";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "FORBIDDEN"
          ? 403
          : message === "RATE_LIMITED"
            ? 429
          : message.startsWith("CURSOR_RULE_LOAD_FAILED:") ||
              message.startsWith("CURSOR_MOD_RULE_LOAD_FAILED:")
            ? 503
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
