import type { SessionPace } from "@/lib/session-pace";

export type Role = "user" | "admin";

export type MessageRole = "user" | "assistant" | "supervisor" | "system";

export type SessionStatus = "active" | "completed";

export type RiskLevel = "low" | "medium" | "high";

export type SessionProgressPhase = "opening" | "exploring" | "deepening" | "closing";

export type SessionProgressDisplay = "show" | "minimal" | "hidden";

export type AccountStatus = "active" | "suspended" | "banned";

export type BillingPlan = "free" | "plus";

export type BillingOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "expired";

export type BillingProvider = "wechat";

export type UsageLedgerProvider = "anthropic" | "moonshot";

export type UsageLedgerFeatureKind =
  | "chat"
  | "supervision"
  | "thinking_humanizer"
  | "guardrail";

export type ModerationCategory =
  | "prompt_attack"
  | "meaningless_input"
  | "policy_violation"
  | "off_topic_api_abuse";

export type ModerationAction = "warn" | "suspend_1h" | "ban";

export interface UserModerationState {
  status: AccountStatus;
  warningCount: number;
  suspendedUntil?: string;
  bannedAt?: string;
  banReason?: string;
  lastIncidentAt?: string;
}

export interface EncryptedBlob {
  iv: string;
  content: string;
  tag: string;
}

export interface UserBillingState {
  planStartedAt?: string;
  planExpireAt?: string;
  billingCycleAnchor?: string;
  lastPaymentAt?: string;
  wechatOpenId?: string;
}

export interface UserQuotaState {
  monthlySessionLimit: number;
  monthlySessionUsed: number;
  quotaPeriodStart: string;
  quotaPeriodEnd: string;
  lastResetAt?: string;
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
  plan?: BillingPlan;
  billing?: UserBillingState;
  quota?: UserQuotaState;
  moderation?: UserModerationState;
  preferences?: {
    progressDisplay?: SessionProgressDisplay;
  };
  createdAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ChatMessagePhaseMeta {
  phase: SessionProgressPhase;
  confidence: number;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  thinking?: string;
  rawThinking?: string;
  meta?: {
    phase?: ChatMessagePhaseMeta;
  };
}

export interface TherapySessionRecord {
  id: string;
  userId: string;
  title: string;
  mode: string;
  pace: SessionPace;
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
  supervisionFailureReason?: string;
  supervisionFailedAt?: string;
  completionLockId?: string;
  completionLockAt?: string;
  quotaChargedAt?: string;
  quotaChargeId?: string;
  billingPlanAtCompletion?: BillingPlan;
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
    | "supervision_completed"
    | "moderation_warned"
    | "account_suspended"
    | "account_banned";
  createdAt: string;
  sessionId?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ModerationIncidentRecord {
  id: string;
  userId: string;
  sessionId?: string;
  category: ModerationCategory;
  action: ModerationAction;
  reason: string;
  evidencePreview: string;
  createdAt: string;
}

export interface BillingOrderRecord {
  id: string;
  userId: string;
  provider: BillingProvider;
  plan: BillingPlan;
  status: BillingOrderStatus;
  amountCny: number;
  currency: "CNY";
  description: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  expiredAt?: string;
  checkoutUrl?: string;
  checkoutCodeUrl?: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  notifyEventId?: string;
  notifyPreview?: string;
}

export interface UsageLedgerRecord {
  id: string;
  userId: string;
  provider: UsageLedgerProvider;
  model: string;
  featureKind: UsageLedgerFeatureKind;
  createdAt: string;
  sessionId?: string;
  messageId?: string;
  runId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  estimatedCostCny: number;
}

export interface DatabaseShape {
  users: UserRecord[];
  authSessions: AuthSessionRecord[];
  therapySessions: TherapySessionRecord[];
  therapyJournals: TherapyJournalRecord[];
  supervisionRuns: SupervisionRunRecord[];
  supervisionJournals: SupervisionJournalRecord[];
  analyticsEvents: AnalyticsEventRecord[];
  moderationIncidents: ModerationIncidentRecord[];
  billingOrders: BillingOrderRecord[];
  usageLedger: UsageLedgerRecord[];
}
