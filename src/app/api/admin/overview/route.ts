import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin");
    const overview = await getAdminOverview();
    return NextResponse.json(overview);
  } catch {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
}
