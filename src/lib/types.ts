export type Role = "user" | "admin";

export type MessageRole = "user" | "assistant" | "supervisor" | "system";

export type SessionStatus = "active" | "completed";

export type RiskLevel = "low" | "medium" | "high";

export interface EncryptedBlob {
  iv: string;
  content: string;
  tag: string;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  analyticsId: string;
  consentVersion?: string;
  privacyConsentAt?: string;
  aiProcessingConsentAt?: string;
  createdAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface TherapySessionRecord {
  id: string;
  userId: string;
  title: string;
  mode: string;
  status: SessionStatus;
  autoSupervision: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastMessagePreview: string;
  redactedSummary: string;
  messageCount: number;
  riskLevel: RiskLevel;
  transcript: EncryptedBlob;
  supervisionId?: string;
}

export interface TherapyJournalRecord {
  id: string;
  userId: string;
  updatedAt: string;
  content: EncryptedBlob;
  redactedSummary: string;
}

export interface SupervisionRunRecord {
  id: string;
  userId: string;
  sessionId: string;
  status: "completed";
  createdAt: string;
  completedAt: string;
  transcript: EncryptedBlob;
  journalEntry?: EncryptedBlob;
  redactedSummary: string;
  journalEntryPreview: string;
}

export interface SupervisionJournalRecord {
  id: string;
  userId: string;
  updatedAt: string;
  content: EncryptedBlob;
  redactedSummary: string;
}

export interface AnalyticsEventRecord {
  id: string;
  userHash: string;
  type:
    | "register"
    | "login"
    | "session_created"
    | "message_sent"
    | "session_completed"
    | "supervision_completed";
  createdAt: string;
  sessionId?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface DatabaseShape {
  users: UserRecord[];
  authSessions: AuthSessionRecord[];
  therapySessions: TherapySessionRecord[];
  therapyJournals: TherapyJournalRecord[];
  supervisionRuns: SupervisionRunRecord[];
  supervisionJournals: SupervisionJournalRecord[];
  analyticsEvents: AnalyticsEventRecord[];
}
