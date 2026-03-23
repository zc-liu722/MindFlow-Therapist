import { AppDashboard } from "@/components/app-dashboard";
import { requireUserPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await requireUserPage();
  return <AppDashboard user={user} />;
}
