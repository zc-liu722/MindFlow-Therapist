import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getSupervisionJournal } from "@/lib/domain";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireRole("user");
    assertRateLimit({
      key: `supervision-journal:user:${user.id}`,
      limit: 120,
      windowMs: 60_000
    });
    const journal = await getSupervisionJournal(user.id);
    return NextResponse.json(journal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未授权";
    const status = message === "RATE_LIMITED" ? 429 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
