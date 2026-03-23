import { NextResponse } from "next/server";

import { createAuthSession, registerUser } from "@/lib/auth";
import { createId } from "@/lib/crypto";
import { writeDb } from "@/lib/db";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
      role?: "user" | "admin";
      adminInviteCode?: string;
      privacyConsent?: boolean;
      aiProcessingConsent?: boolean;
    };

    if (!body.username?.trim()) {
      return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
    }

    const username = body.username.trim();
    const password = body.password ?? "";
    const displayName = body.displayName?.trim() || username;

    assertRateLimit({
      key: `auth-register:ip:${getClientIp(request)}`,
      limit: 6,
      windowMs: 10 * 60_000
    });
    assertRateLimit({
      key: `auth-register:user:${username.toLowerCase()}`,
      limit: 4,
      windowMs: 10 * 60_000
    });

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

    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败";
    const status = message === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
