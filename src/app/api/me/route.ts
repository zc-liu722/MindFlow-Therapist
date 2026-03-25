import { NextResponse } from "next/server";

import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { jsonWithKey } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonWithKey("user", null);
  }

  return jsonWithKey("user", {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  });
}
