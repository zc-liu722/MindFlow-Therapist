import type {
  AccountStatus,
  ChatMessage as DomainChatMessage,
  RiskLevel,
  SessionStatus
} from "@/lib/types";
import type { SessionPace } from "@/lib/session-pace";

export type DomainSessionRecord = {
  id: string;
  title: string;
  mode: string;
  pace: SessionPace;
  status: SessionStatus;
  autoSupervision: boolean;
  updatedAt: string;
  createdAt: string;
  redactedSummary: string;
  messageCount: number;
  riskLevel: RiskLevel;
  supervisionId?: string;
  supervisionFailureReason?: string;
  supervisionFailedAt?: string;
};

export type DomainSessionDetail = DomainSessionRecord & {
  messages: DomainChatMessage[];
};

export type DomainSupervisionRun = {
  id: string;
  sessionId: string;
  createdAt: string;
  completedAt: string;
  redactedSummary: string;
  transcript: DomainChatMessage[];
};

export type SessionListResult = DomainSessionRecord[];

export type SessionCreateResult = DomainSessionRecord;

export type SessionDetailResult = DomainSessionDetail;

export type SessionUpdateResult = DomainSessionDetail;

export type SessionCompleteResult = {
  sessionId: string;
  supervisionCreated: boolean;
  supervisionFailed: boolean;
  alreadyCompleted: boolean;
};

export type SessionSupervisionResult = {
  sessionId: string;
  supervisionCreated: boolean;
  alreadyCreated: boolean;
};

export type SessionDeleteResult = {
  deletedSessionId: string;
};

export type TherapyJournalResult = {
  updatedAt: string | null;
  content: string;
};

export type SupervisionJournalResult = {
  updatedAt: string | null;
  content: string;
  runs: DomainSupervisionRun[];
};

export type ModerationSummary = {
  totalIncidents: number;
  suspendedUsers: number;
  bannedUsers: number;
};

export type RiskDistribution = {
  low: number;
  medium: number;
  high: number;
};

export type AdminOverviewIncident = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  sessionId?: string;
  category: string;
  action: string;
  reason: string;
  evidencePreview: string;
  createdAt: string;
};

export type AdminOverviewAffectedAccount = {
  userId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  statusLabel: string;
  warningCount: number;
  suspendedUntil?: string;
  bannedAt?: string;
  banReason?: string;
  lastIncidentAt?: string;
  incidentCount: number;
  latestReason: string;
  latestCategory: string;
};

export type AdminOverviewResult = {
  totalUsers: number;
  totalSessions: number;
  completedSessions: number;
  supervisionRate: number;
  averageTurns: number;
  moderationSummary: ModerationSummary;
  riskDistribution: RiskDistribution;
  sessionsByDay: { date: string; count: number }[];
  eventsByType: { type: string; count: number }[];
  recentModerationIncidents: AdminOverviewIncident[];
  affectedAccounts: AdminOverviewAffectedAccount[];
};

export type ModerationAccountUpdateResult = {
  userId: string;
  status: AccountStatus;
  warningCount: number;
};
