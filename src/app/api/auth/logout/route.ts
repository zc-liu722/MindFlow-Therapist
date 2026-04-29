import { okJson } from "@/lib/api-response";
import { clearAuthSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearAuthSession();
  return okJson();
}
