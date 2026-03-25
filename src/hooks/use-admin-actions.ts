"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useCallback, useState } from "react";
import type { ApiErrorPayload, ModerationAction } from "@/lib/api-types";
import { readJsonResponse, readOkResult } from "@/lib/client-response";
import type { ModerationAccountUpdateResult } from "@/lib/domain-types";

type AdminRouter = {
  push: AppRouterInstance["push"];
  refresh: AppRouterInstance["refresh"];
};

type UseAdminActionsOptions = {
  router: AdminRouter;
  loadOverview: () => Promise<void>;
  setNotice: (value: string) => void;
};

export function useAdminActions({
  router,
  loadOverview,
  setNotice
}: UseAdminActionsOptions) {
  const [busyAction, setBusyAction] = useState("");

  const runModerationAction = useCallback(async (userId: string, action: ModerationAction) => {
    const key = `${action}:${userId}`;
    setBusyAction(key);
    setNotice("");

    try {
      const response = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action })
      });

      const payloadResponse = response.clone();
      const result = response.ok
        ? await readOkResult<ModerationAccountUpdateResult>(payloadResponse)
        : null;
      const payload = response.ok ? null : await readJsonResponse<ApiErrorPayload>(response);
      if (!response.ok) {
        setNotice(payload?.error ?? "操作失败");
        return;
      }

      if (!result) {
        setNotice("操作失败");
        return;
      }

      setNotice(action === "reinstate" ? "已恢复该账号访问权限" : "已清零该账号警告计数");
      await loadOverview();
    } catch {
      setNotice("操作失败");
    } finally {
      setBusyAction("");
    }
  }, [loadOverview, setNotice]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }, [router]);

  return {
    busyAction,
    runModerationAction,
    logout
  };
}
