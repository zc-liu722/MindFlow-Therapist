import { NextResponse } from "next/server";

import { createAuthSession, loginUser } from "@/lib/auth";
import { createId } from "@/lib/crypto";
import { writeDb } from "@/lib/db";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      role?: "user" | "admin";
      privacyConsent?: boolean;
      aiProcessingConsent?: boolean;
    };

    if (!body.username?.trim()) {
      return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
    }

    const clientIp = getClientIp(request);
    if (clientIp) {
      assertRateLimit({
        key: `auth-login:ip:${clientIp}`,
        limit: 10,
        windowMs: 60_000
      });
    }
    assertRateLimit({
      key: `auth-login:user:${body.username.trim().toLowerCase()}`,
      limit: 8,
      windowMs: 60_000
    });

    const role = body.role ?? "user";
    const { user } = await loginUser(body.username, body.password ?? "", {
      requiredRole: role,
      privacyConsent: body.privacyConsent,
      aiProcessingConsent: body.aiProcessingConsent
    });

    await createAuthSession(user.id);
    await writeDb((draft) => {
      draft.analyticsEvents.push({
        id: createId("evt"),
        userHash: user.analyticsId,
        type: "login",
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
    const message = error instanceof Error ? error.message : "登录失败";
    const status =
      message === "FORBIDDEN_ROLE"
        ? 403
        : message === "INVALID_CREDENTIALS"
          ? 401
          : message === "RATE_LIMITED"
            ? 429
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
