import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import { okJson } from "@/lib/api-response";
import { clearAuthSession } from "@/lib/auth";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

export async function POST() {
  await clearAuthSession();
  return okJson();
}
