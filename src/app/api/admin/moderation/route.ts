import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { updateModerationAccount } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await requireRole("admin");
    const body = (await request.json()) as {
      userId?: string;
      action?: "reinstate" | "clear_warnings";
    };

    if (!body.userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    if (body.action !== "reinstate" && body.action !== "clear_warnings") {
      return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
    }

    const result = await updateModerationAccount({
      adminUserId: admin.id,
      userId: body.userId,
      action: body.action
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    const status = message === "NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
