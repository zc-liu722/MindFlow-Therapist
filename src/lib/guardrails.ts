import { createId } from "@/lib/crypto";
import { readDb, writeDb } from "@/lib/db";
import { assessGuardrailForInput } from "@/lib/moonshot";
import { redactSensitiveText } from "@/lib/redaction";
import type {
  ModerationAction,
  ModerationCategory,
  UserModerationState,
  UserRecord
} from "@/lib/types";

const SUSPENSION_MS = 60 * 60 * 1000;

const DEFAULT_MODERATION_STATE: UserModerationState = {
  status: "active",
  warningCount: 0
};

type ModerationMatch = {
  category: ModerationCategory;
  reason: string;
};

function cloneDefaultModerationState(): UserModerationState {
  return { ...DEFAULT_MODERATION_STATE };
}

export function getEffectiveModerationState(user: UserRecord): UserModerationState {
  const state = user.moderation
    ? {
        ...user.moderation
      }
    : cloneDefaultModerationState();

  if (
    state.status === "suspended" &&
    state.suspendedUntil &&
    new Date(state.suspendedUntil).getTime() <= Date.now()
  ) {
    return {
      status: "active",
      warningCount: state.warningCount,
      lastIncidentAt: state.lastIncidentAt
    };
  }

  return state;
}

export async function syncUserModerationState(userId: string) {
  await writeDb((draft) => {
    const user = draft.users.find((item) => item.id === userId);
    if (!user) {
      return;
    }

    const nextState = getEffectiveModerationState(user);
    const currentState = user.moderation;
    if (JSON.stringify(currentState) === JSON.stringify(nextState)) {
      return;
    }

    user.moderation = nextState;
  });
}

function resolveRestrictionMessage(state: UserModerationState) {
  if (state.status === "banned") {
    return state.banReason
      ? `账号已封禁：${state.banReason}`
      : "账号已封禁，请联系管理员。";
  }

  if (state.status === "suspended" && state.suspendedUntil) {
    return `账号已被限制使用，${new Date(state.suspendedUntil).toLocaleString("zh-CN", {
      hour12: false
    })} 后可重试。`;
  }

  return null;
}

export function assertUserAccountAvailable(user: UserRecord) {
  const state = getEffectiveModerationState(user);
  const message = resolveRestrictionMessage(state);

  if (!message) {
    return state;
  }

  if (state.status === "banned") {
    throw new Error(message);
  }

  throw new Error(message);
}

function buildActionFromWarningCount(warningCount: number): ModerationAction {
  if (warningCount >= 3) {
    return "ban";
  }

  if (warningCount >= 2) {
    return "suspend_1h";
  }

  return "warn";
}

function buildBlockedMessage(input: {
  action: ModerationAction;
  reason: string;
  suspendedUntil?: string;
}) {
  if (input.action === "warn") {
    return `${input.reason} 本次消息不予回复，记 1 次警告；累计 2 次将限制 1 小时，累计 3 次将封禁账号。`;
  }

  if (input.action === "suspend_1h") {
    return `${input.reason} 账号已限制 1 小时，${new Date(
      input.suspendedUntil ?? Date.now() + SUSPENSION_MS
    ).toLocaleString("zh-CN", { hour12: false })} 后可恢复访问。`;
  }

  return `${input.reason} 因多次违规，账号已封禁。`;
}

export async function enforceInputGuardrail(input: {
  user: UserRecord;
  content: string;
  sessionId?: string;
  sessionTitle?: string;
  messages?: Array<{ role: "user" | "assistant" | "system" | "supervisor"; content: string }>;
}) {
  await syncUserModerationState(input.user.id);
  const assessment = await assessGuardrailForInput({
    content: input.content,
    messages: input.messages?.map((message, index) => ({
      id: `guardrail-${index}`,
      role: message.role,
      content: message.content,
      createdAt: new Date().toISOString()
    })) ?? [],
    sessionTitle: input.sessionTitle
  });
  const match: ModerationMatch | null =
    assessment.decision === "block" && assessment.category !== "none"
      ? {
          category: assessment.category,
          reason: assessment.reason
        }
      : null;

  if (!match) {
    return;
  }

  let blockedMessage = "当前输入已被拦截。";

  await writeDb((draft) => {
    const user = draft.users.find((item) => item.id === input.user.id);
    if (!user) {
      return;
    }

    const currentState = getEffectiveModerationState(user);
    const nextWarningCount = currentState.warningCount + 1;
    const action = buildActionFromWarningCount(nextWarningCount);
    const now = new Date().toISOString();
    const nextState: UserModerationState = {
      ...currentState,
      warningCount: nextWarningCount,
      lastIncidentAt: now
    };

    if (action === "suspend_1h") {
      nextState.status = "suspended";
      nextState.suspendedUntil = new Date(Date.now() + SUSPENSION_MS).toISOString();
      delete nextState.bannedAt;
      delete nextState.banReason;
    } else if (action === "ban") {
      nextState.status = "banned";
      nextState.bannedAt = now;
      nextState.banReason = "多次触发输入约束监督机制";
      delete nextState.suspendedUntil;
    } else {
      nextState.status = "active";
      delete nextState.suspendedUntil;
      delete nextState.bannedAt;
      delete nextState.banReason;
    }

    user.moderation = nextState;
    draft.moderationIncidents.push({
      id: createId("mod"),
      userId: user.id,
      sessionId: input.sessionId,
      category: match.category,
      action,
      reason: match.reason,
      evidencePreview: redactSensitiveText(input.content).slice(0, 120),
      createdAt: now
    });
    draft.analyticsEvents.push({
      id: createId("evt"),
      userHash: user.analyticsId,
      type:
        action === "warn"
          ? "moderation_warned"
          : action === "suspend_1h"
            ? "account_suspended"
            : "account_banned",
      sessionId: input.sessionId,
      createdAt: now,
      metadata: {
        category: match.category,
        warningCount: nextWarningCount
      }
    });
    blockedMessage = buildBlockedMessage({
      action,
      reason: match.reason,
      suspendedUntil: nextState.suspendedUntil
    });
  });

  throw new Error(blockedMessage);
}
