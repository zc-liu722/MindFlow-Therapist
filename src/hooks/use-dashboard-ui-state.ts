"use client";

import { useEffect, useState } from "react";
import type {
  AppSessionRecord as SessionRecord,
  AppSupervisionRun as SupervisionRun
} from "@/lib/app-dashboard-types";

export type DashboardViewMode = "chat" | "history" | "therapy" | "supervision";

export function useDashboardUiState(supervisionRuns: SupervisionRun[]) {
  const [view, setView] = useState<DashboardViewMode>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [sessionToComplete, setSessionToComplete] = useState<SessionRecord | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<SessionRecord | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [pacePanelOpen, setPacePanelOpen] = useState(false);
  const [mobileSessionBarCollapsed, setMobileSessionBarCollapsed] = useState(false);
  const [selectedSupervisionRunId, setSelectedSupervisionRunId] = useState<string | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!pacePanelOpen) {
      return;
    }

    function handleWindowPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest("[data-pace-control-root]")) {
        return;
      }

      setPacePanelOpen(false);
    }

    window.addEventListener("pointerdown", handleWindowPointerDown);
    return () => window.removeEventListener("pointerdown", handleWindowPointerDown);
  }, [pacePanelOpen]);

  useEffect(() => {
    if (
      selectedSupervisionRunId &&
      !supervisionRuns.some((run) => run.id === selectedSupervisionRunId)
    ) {
      setSelectedSupervisionRunId(null);
    }
  }, [selectedSupervisionRunId, supervisionRuns]);

  function handleViewChange(nextView: DashboardViewMode) {
    setCreatePanelOpen(false);
    setSessionToComplete(null);
    setSessionToDelete(null);
    setPacePanelOpen(false);
    setView(nextView);
    if (nextView !== "supervision") {
      setSelectedSupervisionRunId(null);
    }
    setSidebarOpen(false);
  }

  function moveCompleteModalToDeleteFlow(busy: boolean) {
    if (!sessionToComplete || busy) {
      return;
    }

    setSessionToDelete(sessionToComplete);
    setSessionToComplete(null);
  }

  return {
    view,
    setView,
    sidebarOpen,
    setSidebarOpen,
    createPanelOpen,
    setCreatePanelOpen,
    sessionToComplete,
    setSessionToComplete,
    sessionToDelete,
    setSessionToDelete,
    portalReady,
    pacePanelOpen,
    setPacePanelOpen,
    mobileSessionBarCollapsed,
    setMobileSessionBarCollapsed,
    selectedSupervisionRunId,
    setSelectedSupervisionRunId,
    handleViewChange,
    moveCompleteModalToDeleteFlow
  };
}
