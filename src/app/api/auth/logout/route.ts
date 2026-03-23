import { NextResponse } from "next/server";

import { clearAuthSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearAuthSession();
  return NextResponse.json({ ok: true });
}
