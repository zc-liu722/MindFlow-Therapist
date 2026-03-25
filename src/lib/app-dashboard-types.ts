import type { PublicUser } from "@/lib/api-types";
import type {
  DomainSessionDetail,
  DomainSessionRecord,
  DomainSupervisionRun
} from "@/lib/domain-types";
import type { ChatMessage as DomainChatMessage } from "@/lib/types";

export type AppViewerUser = Pick<PublicUser, "id" | "displayName" | "username">;

export type AppChatMessage = DomainChatMessage & {
  isStreaming?: boolean;
  streamingDone?: boolean;
  animateIn?: boolean;
};

export type AppSessionRecord = DomainSessionRecord;

export type AppSessionDetail = Omit<DomainSessionDetail, "messages"> & {
  messages: AppChatMessage[];
};

export type AppSupervisionRun = Omit<DomainSupervisionRun, "transcript"> & {
  transcript: AppChatMessage[];
};
