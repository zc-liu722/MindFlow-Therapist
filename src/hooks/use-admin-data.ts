"use client";

import { useCallback, useEffect, useState } from "react";
import { readKeyedResponse } from "@/lib/client-response";
import type { AdminOverviewResult } from "@/lib/domain-types";

type UseAdminDataOptions = {
  setNotice: (value: string) => void;
};

export function useAdminData({ setNotice }: UseAdminDataOptions) {
  const [overview, setOverview] = useState<AdminOverviewResult | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/overview");
      if (!response.ok) {
        setNotice("统计概览加载失败");
        return;
      }

      const nextOverview = await readKeyedResponse<"overview", AdminOverviewResult>(
        response,
        "overview"
      );
      setOverview(nextOverview);
    } catch {
      setNotice("统计概览加载失败");
    }
  }, [setNotice]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return {
    overview,
    loadOverview
  };
}
