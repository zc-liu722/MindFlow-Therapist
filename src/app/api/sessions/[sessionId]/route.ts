import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { deleteSessionForUser, getSessionForUser } from "@/lib/domain";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    assertRateLimit({
      key: `session-detail:${getClientIp(request)}`,
      limit: 120,
      windowMs: 60_000
    });
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    const session = await getSessionForUser(user.id, sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败";
    const status = message === "RATE_LIMITED" ? 429 : message === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    assertRateLimit({
      key: `session-delete:${getClientIp(request)}`,
      limit: 20,
      windowMs: 60_000
    });
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    const result = await deleteSessionForUser(user, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    const status = message === "RATE_LIMITED" ? 429 : message === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
