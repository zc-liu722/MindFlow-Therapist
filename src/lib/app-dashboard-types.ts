import type { PublicUser } from "@/lib/api-types";
import type {
  DomainSessionDetail,
  DomainSessionRecord,
  DomainSupervisionRun
} from "@/lib/domain-types";
import type {
  ChatMessage as DomainChatMessage,
  SessionProgressDisplay
} from "@/lib/types";

export type AppViewerUser = Pick<
  PublicUser,
  "id" | "displayName" | "username" | "preferences" | "plan" | "quota" | "billing"
>;

export type AppChatMessage = DomainChatMessage & {
  isStreaming?: boolean;
  streamingDone?: boolean;
  animateIn?: boolean;
};

export type AppSessionRecord = DomainSessionRecord;

export type AppSessionDetail = Omit<DomainSessionDetail, "messages"> & {
  stableMessages: AppChatMessage[];
  streamingMessage: AppChatMessage | null;
};

export type AppSupervisionRun = Omit<DomainSupervisionRun, "transcript"> & {
  transcript: AppChatMessage[];
};

export function hydrateAppSessionDetail(session: DomainSessionDetail): AppSessionDetail {
  return {
    ...session,
    stableMessages: session.messages,
    streamingMessage: null
  };
}

export function getSessionMessages(session: Pick<AppSessionDetail, "stableMessages" | "streamingMessage"> | null | undefined) {
  if (!session) {
    return [] as AppChatMessage[];
  }

  return session.streamingMessage
    ? [...session.stableMessages, session.streamingMessage]
    : session.stableMessages;
}

export function getLastSessionMessage(
  session: Pick<AppSessionDetail, "stableMessages" | "streamingMessage"> | null | undefined
) {
  if (!session) {
    return null;
  }

  return session.streamingMessage ?? session.stableMessages.at(-1) ?? null;
}

export function normalizeProgressDisplay(
  value?: SessionProgressDisplay | string | null
): SessionProgressDisplay {
  return value === "minimal" || value === "hidden" ? value : "show";
}
