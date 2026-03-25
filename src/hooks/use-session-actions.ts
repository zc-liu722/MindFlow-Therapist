"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { type Dispatch, type FormEvent, type SetStateAction, useCallback, useState } from "react";
import type {
  ApiErrorPayload,
  SessionCompleteOkPayload,
  SessionDeleteOkPayload,
  SessionsPayload,
  SessionSupervisionOkPayload
} from "@/lib/api-types";
import {
  ACTIVE_SESSION_EXISTS_MESSAGE,
  DELETE_SESSION_SUCCESS_MESSAGE,
  getCreateSessionErrorMessage,
  getCompleteSessionErrorMessage,
  getCompleteSessionSuccessMessage,
  getRerunSupervisionErrorMessage,
  getRerunSupervisionSuccessMessage,
  SUPERVISION_SESSION_NOT_FOUND_MESSAGE
} from "@/lib/client-errors";
import {
  readJsonResponse,
  readKeyedResponse,
  readOkResult,
  resolveApiErrorMessage
} from "@/lib/client-response";
import {
  parseSessionMessageStreamChunk,
  type SessionMessageStreamEvent
} from "@/lib/session-message-stream";
import { normalizeSessionPace, type SessionPace } from "@/lib/session-pace";
import { resolveSessionForSupervisionRun } from "@/lib/app-dashboard-utils";
import type {
  AppChatMessage as ChatMessage,
  AppSessionDetail as SessionDetail,
  AppSessionRecord as SessionRecord,
  AppSupervisionRun as SupervisionRun
} from "@/lib/app-dashboard-types";
import type { DashboardViewMode } from "@/hooks/use-dashboard-ui-state";
import type { SessionMode } from "@/lib/session-modes";

type DashboardRouter = {
  push: AppRouterInstance["push"];
  refresh: AppRouterInstance["refresh"];
};

type UseSessionActionsOptions = {
  router: DashboardRouter;
  sessions: SessionRecord[];
  selectedSessionId: string | null;
  activeSession: SessionDetail | null;
  supervisionRuns: SupervisionRun[];
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<SessionRecord[]>>;
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>;
  setActiveSession: Dispatch<SetStateAction<SessionDetail | null>>;
  setView: Dispatch<SetStateAction<DashboardViewMode>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setCreatePanelOpen: Dispatch<SetStateAction<boolean>>;
  setSessionToComplete: Dispatch<SetStateAction<SessionRecord | null>>;
  sessionToComplete: SessionRecord | null;
  setSessionToDelete: Dispatch<SetStateAction<SessionRecord | null>>;
  sessionToDelete: SessionRecord | null;
  draftTitle: string;
  draftMode: SessionMode;
  autoSupervision: boolean;
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  scheduleAssistantStreamUpdate: (
    messageId: string,
    partialUpdate: { content?: string; thinking?: string }
  ) => void;
  ensureThinkingExpanded: (messageId: string) => void;
  flushAssistantStreamUpdate: (messageId: string) => void;
  markShouldStickToBottom: () => void;
  loadSessionDetail: (sessionId: string) => Promise<void>;
  loadSessions: (selectedId?: string) => Promise<void>;
  loadJournals: () => Promise<void>;
};

function removePendingMessages(
  current: SessionDetail | null,
  temporaryUserMessageId: string,
  temporaryAssistantMessageId: string
) {
  if (!current) {
    return current;
  }

  return {
    ...current,
    messages: current.messages.filter(
      (message) =>
        message.id !== temporaryUserMessageId && message.id !== temporaryAssistantMessageId
    ),
    messageCount: Math.max(current.messageCount - 2, 0)
  };
}

export function useSessionActions({
  router,
  sessions,
  selectedSessionId,
  activeSession,
  supervisionRuns,
  busy,
  setBusy,
  setNotice,
  setSessions,
  setSelectedSessionId,
  setActiveSession,
  setView,
  setSidebarOpen,
  setCreatePanelOpen,
  setSessionToComplete,
  sessionToComplete,
  setSessionToDelete,
  sessionToDelete,
  draftTitle,
  draftMode,
  autoSupervision,
  messageInput,
  setMessageInput,
  scheduleAssistantStreamUpdate,
  ensureThinkingExpanded,
  flushAssistantStreamUpdate,
  markShouldStickToBottom,
  loadSessionDetail,
  loadSessions,
  loadJournals
}: UseSessionActionsOptions) {
  const [paceBusy, setPaceBusy] = useState(false);

  const createNewSession = useCallback(async () => {
    if (sessions.some((session) => session.status === "active")) {
      setNotice(ACTIVE_SESSION_EXISTS_MESSAGE);
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          mode: draftMode,
          autoSupervision
        })
      });

      const payloadResponse = response.clone();
      const session = response.ok
        ? await readKeyedResponse<"session", SessionRecord>(payloadResponse, "session")
        : null;
      const payload = response.ok ? null : await readJsonResponse<ApiErrorPayload>(response);
      if (!response.ok || !session) {
        setNotice(getCreateSessionErrorMessage(payload?.error));
        return;
      }

      setView("chat");
      setSidebarOpen(false);
      setCreatePanelOpen(false);
      await loadSessions(session.id);
    } finally {
      setBusy(false);
    }
  }, [
    autoSupervision,
    draftMode,
    draftTitle,
    loadSessions,
    sessions,
    setBusy,
    setCreatePanelOpen,
    setNotice,
    setSidebarOpen,
    setView
  ]);

  const updateSessionPaceValue = useCallback(async (nextPace: SessionPace) => {
    if (!activeSession || paceBusy || normalizeSessionPace(activeSession.pace) === nextPace) {
      return;
    }

    const previousPace = normalizeSessionPace(activeSession.pace);

    setPaceBusy(true);
    setNotice("");
    setActiveSession((current) => (current ? { ...current, pace: nextPace } : current));
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSession.id ? { ...session, pace: nextPace } : session
      )
    );

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pace: nextPace })
      });
      const payloadResponse = response.clone();
      const session = response.ok
        ? await readKeyedResponse<"session", SessionDetail>(payloadResponse, "session")
        : null;
      const payload = response.ok ? null : await readJsonResponse<ApiErrorPayload>(response);

      if (!response.ok || !session) {
        setActiveSession((current) => (current ? { ...current, pace: previousPace } : current));
        setSessions((current) =>
          current.map((session) =>
            session.id === activeSession.id ? { ...session, pace: previousPace } : session
          )
        );
        setNotice(resolveApiErrorMessage(payload, "速度更新失败"));
        return;
      }

      setActiveSession(session);
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id
            ? {
                ...item,
                pace: session.pace,
                updatedAt: session.updatedAt,
                messageCount: session.messageCount,
                riskLevel: session.riskLevel,
                redactedSummary: session.redactedSummary
              }
            : item
        )
      );
    } finally {
      setPaceBusy(false);
    }
  }, [activeSession, paceBusy, setActiveSession, setNotice, setSessions]);

  const sendMessage = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeSession || busy) {
      return;
    }

    const content = messageInput.trim();
    if (!content) {
      return;
    }

    const temporaryUserMessage: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const temporaryAssistantMessage: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      thinking: "",
      isStreaming: true,
      animateIn: true
    };
    const pendingUserMessage: ChatMessage = {
      ...temporaryUserMessage,
      animateIn: true
    };

    setBusy(true);
    setNotice("");
    setMessageInput("");
    markShouldStickToBottom();
    setActiveSession((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, pendingUserMessage, temporaryAssistantMessage],
            messageCount: current.messageCount + 2,
            updatedAt: temporaryAssistantMessage.createdAt
          }
        : current
    );

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-page-language":
            document.documentElement.lang || navigator.language || "zh-CN"
        },
        body: JSON.stringify({ content })
      });

      if (!response.ok || !response.body) {
        const payload = await readJsonResponse<ApiErrorPayload & {
          userMessage?: ChatMessage;
          assistantMessage?: ChatMessage;
        }>(response);
        setMessageInput(content);
        setActiveSession((current) =>
          removePendingMessages(current, temporaryUserMessage.id, temporaryAssistantMessage.id)
        );
        setNotice(resolveApiErrorMessage(payload, "发送失败"));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalUserMessage: ChatMessage | undefined;
      let finalAssistantMessage: ChatMessage | undefined;
      let streamFailed = false;
      let streamError = "发送失败";

      function applyStreamEvent(eventItem: SessionMessageStreamEvent) {
        if (eventItem.type === "thinking") {
          scheduleAssistantStreamUpdate(temporaryAssistantMessage.id, {
            thinking: eventItem.payload.summary ?? ""
          });
          ensureThinkingExpanded(temporaryAssistantMessage.id);
          return;
        }

        if (eventItem.type === "reply") {
          scheduleAssistantStreamUpdate(temporaryAssistantMessage.id, {
            content: eventItem.payload.content ?? ""
          });
          return;
        }

        if (eventItem.type === "done") {
          finalUserMessage = eventItem.payload.userMessage;
          finalAssistantMessage = eventItem.payload.assistantMessage;
          return;
        }

        if (eventItem.type === "error") {
          streamFailed = true;
          streamError = resolveApiErrorMessage(eventItem.payload, "发送失败");
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const item of parts) {
          for (const eventItem of parseSessionMessageStreamChunk(item)) {
            applyStreamEvent(eventItem);
          }
        }

        if (done) {
          if (buffer.trim()) {
            for (const eventItem of parseSessionMessageStreamChunk(buffer)) {
              applyStreamEvent(eventItem);
            }
          }
          break;
        }
      }

      flushAssistantStreamUpdate(temporaryAssistantMessage.id);

      if (streamFailed || !finalUserMessage || !finalAssistantMessage) {
        setMessageInput(content);
        setActiveSession((current) =>
          removePendingMessages(current, temporaryUserMessage.id, temporaryAssistantMessage.id)
        );
        setNotice(streamError);
        return;
      }

      const userMessage = finalUserMessage;
      const assistantMessage = finalAssistantMessage;

      setActiveSession((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message): ChatMessage => {
                if (message.id === temporaryUserMessage.id) {
                  return { ...userMessage, animateIn: message.animateIn };
                }
                if (message.id === temporaryAssistantMessage.id) {
                  return {
                    ...assistantMessage,
                    animateIn: message.animateIn,
                    content: assistantMessage.content || message.content,
                    thinking: assistantMessage.thinking ?? message.thinking,
                    rawThinking: assistantMessage.rawThinking,
                    isStreaming: false,
                    streamingDone: false
                  };
                }
                return message;
              }),
              updatedAt: assistantMessage.createdAt
            }
          : current
      );
      const sessionsResponse = await fetch("/api/sessions");
      if (sessionsResponse.ok) {
        const payload = await readJsonResponse<SessionsPayload>(sessionsResponse);
        if (payload?.sessions) {
          setSessions(payload.sessions);
        }
      }
    } catch {
      setMessageInput(content);
      setActiveSession((current) =>
        removePendingMessages(current, temporaryUserMessage.id, temporaryAssistantMessage.id)
      );
      setNotice("发送失败");
    } finally {
      setBusy(false);
    }
  }, [
    activeSession,
    busy,
    ensureThinkingExpanded,
    flushAssistantStreamUpdate,
    markShouldStickToBottom,
    messageInput,
    scheduleAssistantStreamUpdate,
    setActiveSession,
    setBusy,
    setMessageInput,
    setNotice,
    setSessions
  ]);

  const completeCurrentSession = useCallback(async () => {
    if (!sessionToComplete || busy) {
      return;
    }

    const targetSession = sessionToComplete;
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/sessions/${targetSession.id}/complete`, {
        method: "POST"
      });
      const payloadResponse = response.clone();
      const result = response.ok
        ? await readOkResult<SessionCompleteOkPayload["result"]>(payloadResponse)
        : null;
      const payload = response.ok ? null : await readJsonResponse<ApiErrorPayload>(response);

      if (!response.ok) {
        setNotice(getCompleteSessionErrorMessage(payload?.error));
        return;
      }

      setSessionToComplete(null);
      setNotice(getCompleteSessionSuccessMessage(result ?? undefined));
      await loadSessions(targetSession.id);
      await loadJournals();
    } catch {
      setNotice("结束会谈时出现异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    loadJournals,
    loadSessions,
    sessionToComplete,
    setBusy,
    setNotice,
    setSessionToComplete
  ]);

  const rerunSupervision = useCallback(async (session: SessionRecord) => {
    if (busy) {
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/sessions/${session.id}/supervision`, {
        method: "POST"
      });
      const payloadResponse = response.clone();
      const result = response.ok
        ? await readOkResult<SessionSupervisionOkPayload["result"]>(payloadResponse)
        : null;
      const payload = response.ok ? null : await readJsonResponse<ApiErrorPayload>(response);

      if (!response.ok) {
        setNotice(getRerunSupervisionErrorMessage(payload?.error));
        return;
      }

      setNotice(getRerunSupervisionSuccessMessage(result ?? undefined));
      await loadSessions(session.id);
      await loadJournals();
    } catch {
      setNotice("手动督导时出现异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }, [busy, loadJournals, loadSessions, setBusy, setNotice]);

  const openSession = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setView("chat");
    setSidebarOpen(false);
    await loadSessionDetail(sessionId);
  }, [loadSessionDetail, setSelectedSessionId, setSidebarOpen, setView]);

  const openSessionForSupervisionRun = useCallback(async (run: SupervisionRun) => {
    const matchedSession = resolveSessionForSupervisionRun(sessions, run);
    if (!matchedSession) {
      setNotice(SUPERVISION_SESSION_NOT_FOUND_MESSAGE);
      return;
    }

    await openSession(matchedSession.id);
  }, [openSession, sessions, setNotice]);

  const deleteSession = useCallback(async () => {
    if (!sessionToDelete || busy) {
      return;
    }

    const targetSession = sessionToDelete;
    const remainingSessions = sessions.filter((session) => session.id !== targetSession.id);
    const fallbackSessionId =
      selectedSessionId === targetSession.id
        ? remainingSessions[0]?.id ?? null
        : selectedSessionId;

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(targetSession.id)}`, {
        method: "DELETE"
      });
      const payloadResponse = response.clone();
      const result = response.ok
        ? await readOkResult<SessionDeleteOkPayload["result"]>(payloadResponse)
        : null;
      const payload = response.ok ? null : await readJsonResponse<ApiErrorPayload>(response);

      if (!response.ok) {
        setNotice(resolveApiErrorMessage(payload, "删除失败"));
        return;
      }

      if (!result?.deletedSessionId) {
        setNotice("删除失败");
        return;
      }

      setSessionToDelete(null);
      setSessions(remainingSessions);
      setSelectedSessionId(fallbackSessionId);
      if (!fallbackSessionId) {
        setActiveSession(null);
      }
      setNotice(DELETE_SESSION_SUCCESS_MESSAGE);
      await loadSessions(fallbackSessionId ?? undefined);
      await loadJournals();
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    loadJournals,
    loadSessions,
    selectedSessionId,
    sessionToDelete,
    sessions,
    setActiveSession,
    setBusy,
    setNotice,
    setSelectedSessionId,
    setSessions,
    setSessionToDelete
  ]);

  const logout = useCallback(async () => {
    setBusy(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router, setBusy]);

  return {
    paceBusy,
    updateSessionPaceValue,
    createNewSession,
    sendMessage,
    completeCurrentSession,
    rerunSupervision,
    openSession,
    openSessionForSupervisionRun,
    deleteSession,
    logout
  };
}
