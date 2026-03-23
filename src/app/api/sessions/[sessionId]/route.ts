import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { deleteSessionForUser, getSessionForUser, updateSessionPace } from "@/lib/domain";
import { assertRateLimit } from "@/lib/rate-limit";
import { normalizeSessionPace } from "@/lib/session-pace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    assertRateLimit({
      key: `session-detail:user:${user.id}:${sessionId}`,
      limit: 120,
      windowMs: 60_000
    });
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
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    assertRateLimit({
      key: `session-delete:user:${user.id}:${sessionId}`,
      limit: 20,
      windowMs: 60_000
    });
    const result = await deleteSessionForUser(user, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    const status = message === "RATE_LIMITED" ? 429 : message === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    assertRateLimit({
      key: `session-update:user:${user.id}:${sessionId}`,
      limit: 60,
      windowMs: 60_000
    });
    const body = (await request.json()) as { pace?: string };

    const session = await updateSessionPace(user, sessionId, normalizeSessionPace(body.pace));
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败";
    const status =
      message === "RATE_LIMITED" ? 429 : message === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
