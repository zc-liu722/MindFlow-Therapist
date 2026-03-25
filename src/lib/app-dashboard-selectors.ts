import {
  DEFAULT_SESSION_PACE,
  getSessionPaceMeta,
  normalizeSessionPace
} from "@/lib/session-pace";
import { estimateSessionProgress } from "@/lib/session-progress";
import type { SessionProgress } from "@/lib/session-progress";
import { resolveSessionForSupervisionRun } from "@/lib/app-dashboard-utils";
import type {
  AppSessionDetail as SessionDetail,
  AppSessionRecord as SessionRecord,
  AppSupervisionRun as SupervisionRun
} from "@/lib/app-dashboard-types";

type DashboardDerivedStateInput = {
  sessions: SessionRecord[];
  selectedSessionId: string | null;
  activeSession: SessionDetail | null;
  supervisionRuns: SupervisionRun[];
  selectedSupervisionRunId: string | null;
  sessionToComplete: SessionRecord | null;
};

export type DashboardDerivedState = {
  activeSessionMeta: SessionRecord | SessionDetail | null;
  headerSession: SessionRecord | SessionDetail | null;
  headerSessionIsActive: boolean;
  activeSessions: SessionRecord[];
  completedSessions: SessionRecord[];
  historySessions: SessionRecord[];
  supervisionSessionMap: Map<string, SessionRecord>;
  activeCount: number;
  completedCount: number;
  selectedSupervisionRun: SupervisionRun | null;
  selectedSupervisionSession: SessionRecord | null;
  lastMessageIsStreaming: boolean;
  activeSessionId?: string;
  activeSessionPace: ReturnType<typeof normalizeSessionPace>;
  activeSessionPaceMeta: ReturnType<typeof getSessionPaceMeta>;
  activeSessionProgress: SessionProgress | null;
  sessionToCompleteProgress: SessionProgress | null;
  sessionToCompleteNeedsMoreConversation: boolean;
};

export function getDashboardDerivedState({
  sessions,
  selectedSessionId,
  activeSession,
  supervisionRuns,
  selectedSupervisionRunId,
  sessionToComplete
}: DashboardDerivedStateInput): DashboardDerivedState {
  const activeSessionMeta =
    sessions.find((session) => session.id === selectedSessionId) ?? activeSession;
  const headerSession = activeSessionMeta ?? activeSession;
  const activeSessions = sessions.filter((session) => session.status === "active");
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const selectedSupervisionRun =
    supervisionRuns.find((run) => run.id === selectedSupervisionRunId) ?? null;
  const activeSessionProgress = activeSession ? estimateSessionProgress(activeSession) : null;
  const sessionToCompleteProgress =
    sessionToComplete && activeSession?.id === sessionToComplete.id ? activeSessionProgress : null;

  return {
    activeSessionMeta,
    headerSession: headerSession ?? null,
    headerSessionIsActive: headerSession?.status === "active",
    activeSessions,
    completedSessions,
    historySessions: [...activeSessions, ...completedSessions],
    supervisionSessionMap: new Map(sessions.map((session) => [session.id, session])),
    activeCount: activeSessions.length,
    completedCount: completedSessions.length,
    selectedSupervisionRun,
    selectedSupervisionSession: selectedSupervisionRun
      ? resolveSessionForSupervisionRun(sessions, selectedSupervisionRun)
      : null,
    lastMessageIsStreaming: Boolean(
      activeSession?.messages.at(-1)?.isStreaming && !activeSession?.messages.at(-1)?.streamingDone
    ),
    activeSessionId: activeSession?.id,
    activeSessionPace: normalizeSessionPace(activeSession?.pace ?? DEFAULT_SESSION_PACE),
    activeSessionPaceMeta: getSessionPaceMeta(
      normalizeSessionPace(activeSession?.pace ?? DEFAULT_SESSION_PACE)
    ),
    activeSessionProgress,
    sessionToCompleteProgress,
    sessionToCompleteNeedsMoreConversation: sessionToCompleteProgress
      ? sessionToCompleteProgress.percent < 80
      : false
  };
}
