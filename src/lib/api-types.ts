import type {
  AdminOverviewResult,
  ModerationAccountUpdateResult,
  SessionCompleteResult,
  SessionCreateResult,
  SessionDeleteResult,
  SessionDetailResult,
  SessionListResult,
  SessionSupervisionResult,
  SessionUpdateResult,
  SupervisionJournalResult,
  TherapyJournalResult
} from "@/lib/domain-types";
import type { Role } from "@/lib/types";

export type ApiErrorPayload = {
  error?: string;
};

export type ApiOkPayload<Result = undefined> = Result extends undefined
  ? {
      ok: true;
    }
  : {
      ok: true;
      result: Result;
    };

export type KeyedPayload<Key extends string, Value> = {
  [K in Key]: Value;
};

export type PublicUser = {
  id: string;
  displayName: string;
  username: string;
  role: Role;
};

export type UserPayload = KeyedPayload<"user", PublicUser | null>;
export type SessionPayload = KeyedPayload<
  "session",
  SessionCreateResult | SessionDetailResult | SessionUpdateResult
>;
export type SessionsPayload = KeyedPayload<"sessions", SessionListResult>;
export type TherapyJournalPayload = KeyedPayload<"therapyJournal", TherapyJournalResult>;
export type SupervisionJournalPayload = KeyedPayload<
  "supervisionJournal",
  SupervisionJournalResult
>;
export type AdminOverviewPayload = KeyedPayload<"overview", AdminOverviewResult>;

export type SessionCompleteOkPayload = ApiOkPayload<SessionCompleteResult>;
export type SessionSupervisionOkPayload = ApiOkPayload<SessionSupervisionResult>;
export type SessionDeleteOkPayload = ApiOkPayload<SessionDeleteResult>;
export type ModerationAccountUpdateOkPayload = ApiOkPayload<ModerationAccountUpdateResult>;

export type LoginRequestBody = {
  username?: string;
  password?: string;
  role?: Role;
  privacyConsent?: boolean;
  aiProcessingConsent?: boolean;
};

export type RegisterRequestBody = LoginRequestBody & {
  displayName?: string;
  adminInviteCode?: string;
};

export type SessionCreateRequestBody = {
  title?: string;
  mode?: string;
  pace?: string;
  autoSupervision?: boolean;
};

export type SessionUpdateRequestBody = {
  pace?: string;
};

export type SessionMessageRequestBody = {
  content?: string;
};

export type ModerationAction = "reinstate" | "clear_warnings";

export type ModerationActionRequestBody = {
  userId?: string;
  action?: ModerationAction;
};

export type SessionRouteParams = {
  sessionId: string;
};

export type SessionRouteContext = {
  params: Promise<SessionRouteParams>;
};
