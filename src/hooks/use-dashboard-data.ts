"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SessionsPayload,
  SupervisionJournalPayload,
  TherapyJournalPayload
} from "@/lib/api-types";
import { readJsonResponse, readKeyedResponse } from "@/lib/client-response";
import type {
  AppSessionDetail as SessionDetail,
  AppSessionRecord as SessionRecord,
  AppSupervisionRun as SupervisionRun
} from "@/lib/app-dashboard-types";

type UseDashboardDataOptions = {
  setNotice: (value: string) => void;
};

export function useDashboardData({ setNotice }: UseDashboardDataOptions) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [therapyJournal, setTherapyJournal] = useState("加载中...");
  const [supervisionJournal, setSupervisionJournal] = useState("加载中...");
  const [supervisionRuns, setSupervisionRuns] = useState<SupervisionRun[]>([]);
  const sessionRequestRef = useRef(0);
  const initialLoadRef = useRef(false);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const requestId = sessionRequestRef.current + 1;
    sessionRequestRef.current = requestId;

    const response = await fetch(`/api/sessions/${sessionId}`);
    const session = await readKeyedResponse<"session", SessionDetail>(response, "session");

    if (!response.ok || !session) {
      setNotice("会谈内容加载失败");
      return;
    }
    if (sessionRequestRef.current !== requestId) {
      return;
    }

    setSelectedSessionId(session.id);
    setActiveSession(session);
  }, [setNotice]);

  const loadSessions = useCallback(async (selectedId?: string) => {
    const response = await fetch("/api/sessions");
    const payload = await readJsonResponse<SessionsPayload>(response);

    if (!response.ok || !payload?.sessions) {
      setNotice("会谈列表加载失败");
      return;
    }

    setSessions(payload.sessions);

    const requestedId = selectedId ?? selectedSessionId;
    const nextId = payload.sessions.some((session) => session.id === requestedId)
      ? requestedId
      : payload.sessions[0]?.id;

    if (nextId) {
      await loadSessionDetail(nextId);
      return;
    }

    setSelectedSessionId(null);
    setActiveSession(null);
  }, [loadSessionDetail, selectedSessionId, setNotice]);

  const loadJournals = useCallback(async () => {
    const [therapyResponse, supervisionResponse] = await Promise.all([
      fetch("/api/journal/therapy"),
      fetch("/api/journal/supervision")
    ]);

    if (therapyResponse.ok) {
      const payload = await readJsonResponse<TherapyJournalPayload>(therapyResponse);
      setTherapyJournal(payload?.therapyJournal.content ?? "暂无咨询师手帐。");
    } else {
      setTherapyJournal("暂无咨询师手帐。");
    }

    if (supervisionResponse.ok) {
      const payload = await readJsonResponse<SupervisionJournalPayload>(supervisionResponse);
      setSupervisionJournal(payload?.supervisionJournal.content ?? "暂无督导手帐。");
      setSupervisionRuns(payload?.supervisionJournal.runs ?? []);
    } else {
      setSupervisionJournal("暂无督导手帐。");
      setSupervisionRuns([]);
    }
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }

    initialLoadRef.current = true;
    void loadSessions();
    void loadJournals();
  }, [loadJournals, loadSessions]);

  return {
    sessions,
    setSessions,
    selectedSessionId,
    setSelectedSessionId,
    activeSession,
    setActiveSession,
    therapyJournal,
    supervisionJournal,
    supervisionRuns,
    setSupervisionRuns,
    loadSessionDetail,
    loadSessions,
    loadJournals
  };
}
