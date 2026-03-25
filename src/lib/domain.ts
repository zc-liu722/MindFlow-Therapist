import { decryptForUser, encryptForUser, createId } from "@/lib/crypto";
import {
  preloadModeRules,
  preloadTherapistCoreRule
} from "@/lib/cursor-rules";
import { readDb, writeDb } from "@/lib/db";
import { buildTherapyJournal } from "@/lib/ai";
import { generateSupervisionArtifacts, generateTherapyReply } from "@/lib/anthropic";
import { createThinkingHumanizer } from "@/lib/moonshot";
import type {
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
import { normalizeSessionMode } from "@/lib/session-modes";
import { DEFAULT_SESSION_PACE, normalizeSessionPace } from "@/lib/session-pace";
import type {
  AnalyticsEventRecord,
  ChatMessage,
  SupervisionJournalRecord,
  SupervisionRunRecord,
  TherapyJournalRecord,
  TherapySessionRecord,
  UserRecord
} from "@/lib/types";

function parseTranscript(session: TherapySessionRecord): ChatMessage[] {
  return JSON.parse(decryptForUser(session.userId, session.transcript)) as ChatMessage[];
}

function parseVisibleTranscript(session: TherapySessionRecord): ChatMessage[] {
  return visibleMessages(parseTranscript(session));
}

function formatSupervisionFailureReason(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }

  return "自动督导生成失败，请稍后重试。";
}

function isVisibleMessage(message: ChatMessage) {
  return message.role !== "system";
}

function visibleMessages(messages: ChatMessage[]) {
  return messages.filter(isVisibleMessage);
}

function findSessionForUser(
  sessions: TherapySessionRecord[],
  userId: string,
  sessionId: string
) {
  return sessions.find((item) => item.id === sessionId && item.userId === userId);
}

function buildSessionResponse(session: TherapySessionRecord): SessionDetailResult {
  const messages = parseVisibleTranscript(session);

  return {
    ...session,
    mode: normalizeSessionMode(session.mode),
    pace: normalizeSessionPace(session.pace),
    messageCount: messages.length,
    messages
  };
}

function parseTranscriptSafely(session: TherapySessionRecord): ChatMessage[] | null {
  try {
    return parseTranscript(session);
  } catch {
    return null;
  }
}

function logEvent(user: UserRecord, type: AnalyticsEventRecord["type"], metadata: AnalyticsEventRecord["metadata"], sessionId?: string) {
  const event: AnalyticsEventRecord = {
    id: createId("evt"),
    userHash: user.analyticsId,
    type,
    sessionId,
    createdAt: new Date().toISOString(),
    metadata
  };

  return writeDb((draft) => {
    draft.analyticsEvents.push(event);
  });
}

export async function listSessionsForUser(userId: string): Promise<SessionListResult> {
  const db = await readDb();
  return db.therapySessions
    .filter((session) => session.userId === userId)
    .map((session) => ({
      ...session,
      mode: normalizeSessionMode(session.mode),
      pace: normalizeSessionPace(session.pace)
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSessionForUser(
  userId: string,
  sessionId: string
): Promise<SessionDetailResult> {
  const db = await readDb();
  const session = findSessionForUser(db.therapySessions, userId, sessionId);
  if (!session) {
    throw new Error("NOT_FOUND");
  }

  return buildSessionResponse(session);
}

function readJournalContentFromDb(
  db: Awaited<ReturnType<typeof readDb>>,
  userId: string,
  journalType: "therapy" | "supervision"
) {
  const record =
    journalType === "therapy"
      ? db.therapyJournals.find((item) => item.userId === userId)
      : db.supervisionJournals.find((item) => item.userId === userId);

  if (!record) {
    return null;
  }

  try {
    return decryptForUser(userId, record.content);
  } catch {
    return null;
  }
}

function buildSessionContextMessages(input: {
  therapyJournal: string | null;
  supervisionJournal: string | null;
  modeRuleBodies: string[];
}) {
  const messages: ChatMessage[] = [];
  const now = new Date().toISOString();

  if (input.therapyJournal) {
    messages.push({
      id: createId("msg"),
      role: "system",
      content: `THERAPY_JOURNAL_CONTEXT\n${input.therapyJournal}`,
      createdAt: now
    });
  }

  if (input.supervisionJournal) {
    messages.push({
      id: createId("msg"),
      role: "system",
      content: `SUPERVISION_JOURNAL_CONTEXT\n${input.supervisionJournal}`,
      createdAt: now
    });
  }

  input.modeRuleBodies.forEach((ruleBody, index) => {
    messages.push({
      id: createId("msg"),
      role: "system",
      content: `MODE_RULE_CONTEXT_${index + 1}\n${ruleBody}`,
      createdAt: now
    });
  });

  return messages;
}

export async function createSession(
  user: UserRecord,
  input: { title: string; mode: string; pace?: string; autoSupervision?: boolean }
): Promise<SessionCreateResult> {
  const normalizedMode = normalizeSessionMode(input.mode);
  const normalizedPace = normalizeSessionPace(input.pace);
  const autoSupervision = input.autoSupervision ?? true;
  await preloadTherapistCoreRule();
  const modeRules = await preloadModeRules(normalizedMode);
  const db = await readDb();
  const activeSession = db.therapySessions.find(
    (session) => session.userId === user.id && session.status === "active"
  );

  if (activeSession) {
    throw new Error("ACTIVE_SESSION_EXISTS");
  }

  const therapyJournal = readJournalContentFromDb(db, user.id, "therapy");
  const supervisionJournal = readJournalContentFromDb(db, user.id, "supervision");
  const contextMessages = buildSessionContextMessages({
    therapyJournal,
    supervisionJournal,
    modeRuleBodies: modeRules.map((rule) => rule.body)
  });
  const initialMessages = [...contextMessages];
  const now = new Date().toISOString();

  const session: TherapySessionRecord = {
    id: createId("session"),
    userId: user.id,
    title: input.title.trim(),
    mode: normalizedMode,
    pace: normalizedPace,
    status: "active",
    autoSupervision,
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: "等待来访者开始",
    redactedSummary: therapyJournal
      ? "已加载历史咨询/督导上下文，等待来访者继续。"
      : "已加载规则与历史上下文，等待来访者开始。",
    messageCount: 0,
    riskLevel: "low",
    transcript: encryptForUser(user.id, JSON.stringify(initialMessages))
  };

  await writeDb((draft) => {
    draft.therapySessions.push(session);
  });
  await logEvent(
    user,
    "session_created",
    { autoSupervision, pace: normalizedPace },
    session.id
  );
  return session;
}

function buildMergedTherapyJournalContent(
  userId: string,
  sessions: TherapySessionRecord[]
) {
  const completedSessions = sessions
    .filter((session) => session.userId === userId && session.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (completedSessions.length === 0) {
    return null;
  }

  const blocks = completedSessions
    .map((session) => {
      const messages = parseTranscriptSafely(session);
      if (!messages) {
        return null;
      }
      return buildTherapyJournal(messages, session.title);
    })
    .filter((block): block is ReturnType<typeof buildTherapyJournal> => Boolean(block));

  if (blocks.length === 0) {
    return null;
  }

  const content = blocks.map((block) => block.content).join("\n\n---\n\n");

  return {
    updatedAt: new Date().toISOString(),
    content: encryptForUser(userId, content),
    redactedSummary: blocks[0]?.redactedSummary ?? "暂无摘要"
  };
}

function buildMergedSupervisionArtifacts(
  db: Awaited<ReturnType<typeof readDb>>,
  userId: string,
  sessions: TherapySessionRecord[]
) {
  const eligibleSessionIds = new Set(
    sessions
      .filter(
        (session) =>
          session.userId === userId && session.status === "completed" && session.autoSupervision
      )
      .map((session) => session.id)
  );
  const runs = db.supervisionRuns
    .filter((run) => run.userId === userId && eligibleSessionIds.has(run.sessionId))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  if (runs.length === 0) {
    return {
      runs: [] as SupervisionRunRecord[],
      journal: null
    };
  }

  const journalEntries = runs
    .map((run) => {
      if (!run.journalEntry) {
        return null;
      }

      try {
        return decryptForUser(userId, run.journalEntry);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is string => Boolean(entry));

  return {
    runs,
    journal:
      journalEntries.length > 0
        ? {
            updatedAt: new Date().toISOString(),
            content: encryptForUser(userId, journalEntries.join("\n\n---\n\n")),
            redactedSummary: runs[0]?.redactedSummary ?? "暂无摘要"
          }
        : null
  };
}

function resolveSupervisionRunSessionId(
  sessions: TherapySessionRecord[],
  run: SupervisionRunRecord
): string | null {
  const directMatch = sessions.find((session) => session.id === run.sessionId);
  if (directMatch) {
    return directMatch.id;
  }

  const supervisionMatch = sessions.find((session) => session.supervisionId === run.id);
  if (supervisionMatch) {
    return supervisionMatch.id;
  }

  return null;
}

function buildUserMessage(userContent: string): ChatMessage {
  return {
    id: createId("msg"),
    role: "user" as const,
    content: userContent.trim(),
    createdAt: new Date().toISOString()
  };
}

function updateSessionAfterReply(input: {
  session: TherapySessionRecord;
  userId: string;
  nextMessages: ChatMessage[];
  replyContent: string;
  themes: string[];
  riskLevel: TherapySessionRecord["riskLevel"];
  pace?: string;
}): void {
  input.session.transcript = encryptForUser(input.userId, JSON.stringify(input.nextMessages));
  input.session.updatedAt = new Date().toISOString();
  input.session.lastMessagePreview = input.replyContent.slice(0, 80);
  input.session.redactedSummary = `近期聚焦 ${input.themes.join("、")}。`;
  input.session.messageCount = visibleMessages(input.nextMessages).length;
  input.session.riskLevel = input.riskLevel;

  if (input.pace) {
    input.session.pace = normalizeSessionPace(input.pace);
  }
}

function buildSupervisionRecords(input: {
  userId: string;
  session: TherapySessionRecord;
  journalContent: string | null;
  output: Awaited<ReturnType<typeof generateSupervisionArtifacts>>;
  now?: string;
}): { run: SupervisionRunRecord; journal: SupervisionJournalRecord } {
  const now = input.now ?? new Date().toISOString();
  const run: SupervisionRunRecord = {
    id: createId("supervision"),
    userId: input.userId,
    sessionId: input.session.id,
    status: "completed",
    createdAt: now,
    completedAt: now,
    transcript: encryptForUser(input.userId, JSON.stringify(input.output.transcript)),
    journalEntry: encryptForUser(input.userId, input.output.journalEntry),
    redactedSummary: input.output.redactedSummary,
    journalEntryPreview: input.output.journalEntryPreview
  };

  const journal: SupervisionJournalRecord = {
    id: createId("supervision_journal"),
    userId: input.userId,
    updatedAt: now,
    content: encryptForUser(
      input.userId,
      mergeJournalContent(input.journalContent, input.output.journalEntry)
    ),
    redactedSummary: input.output.redactedSummary
  };

  return { run, journal };
}

export async function updateSessionPace(
  user: UserRecord,
  sessionId: string,
  pace: string
): Promise<SessionUpdateResult> {
  const normalizedPace = normalizeSessionPace(pace);
  let updated = false;

  await writeDb((draft) => {
    const session = draft.therapySessions.find(
      (item) => item.id === sessionId && item.userId === user.id
    );

    if (!session) {
      return;
    }

    session.pace = normalizedPace;
    updated = true;
  });

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return getSessionForUser(user.id, sessionId);
}

export async function appendMessageStream(
  user: UserRecord,
  sessionId: string,
  userContent: string,
  language?: string | null,
  handlers?: {
    onThinkingSummary?: (payload: {
      summary: string;
    }) => void;
    onTextDelta?: (payload: { delta: string; content: string }) => void;
  }
) {
  const db = await readDb();
  const session = db.therapySessions.find(
    (item) => item.id === sessionId && item.userId === user.id
  );

  if (!session) {
    throw new Error("NOT_FOUND");
  }
  if (session.status !== "active") {
    throw new Error("SESSION_CLOSED");
  }

  const transcript = parseTranscript(session);
  const thinkingHumanizer = createThinkingHumanizer({
    language,
    onSummary(summary) {
      handlers?.onThinkingSummary?.({ summary });
    }
  });
  const userMessage = buildUserMessage(userContent);

  const draftMessages = [...transcript, userMessage];
  const assistantOutput = await generateTherapyReply({
    title: session.title,
    mode: session.mode,
    pace: normalizeSessionPace(session.pace),
    messages: draftMessages,
    onThinkingDelta(delta, rawThinking) {
      void delta;
      thinkingHumanizer.ingest(rawThinking);
    },
    onTextDelta(delta, content) {
      handlers?.onTextDelta?.({ delta, content });
    }
  });
  const humanizedThinking = await thinkingHumanizer.finalize(
    assistantOutput.message.rawThinking ?? assistantOutput.message.thinking ?? ""
  );
  const assistantMessage: ChatMessage = {
    ...assistantOutput.message,
    thinking: humanizedThinking.summary,
    rawThinking: humanizedThinking.transcript
  };
  const nextMessages = [...draftMessages, assistantMessage];
  let persisted = false;

  await writeDb((draft) => {
    const mutableSession = draft.therapySessions.find((item) => item.id === sessionId);
    if (!mutableSession) {
      return;
    }
    if (mutableSession.status !== "active") {
      return;
    }

    updateSessionAfterReply({
      session: mutableSession,
      userId: user.id,
      nextMessages,
      replyContent: assistantMessage.content,
      themes: assistantOutput.themes,
      riskLevel: assistantOutput.riskLevel,
      pace: mutableSession.pace ?? DEFAULT_SESSION_PACE
    });
    persisted = true;
  });

  if (!persisted) {
    throw new Error("SESSION_CLOSED");
  }

  await logEvent(
    user,
    "message_sent",
    {
      messageLength: userContent.length,
      riskLevel: assistantOutput.riskLevel,
      pace: normalizeSessionPace(session.pace)
    },
    sessionId
  );

  return {
    userMessage,
    assistantMessage,
    riskLevel: assistantOutput.riskLevel
  };
}

function mergeJournalContent(previous: string | null, nextBlock: string) {
  if (!previous) {
    return nextBlock;
  }
  return `${nextBlock}\n\n---\n\n${previous}`;
}

const COMPLETION_LOCK_TTL_MS = 10 * 60_000;

async function acquireCompletionLock(userId: string, sessionId: string) {
  const lockId = createId("completion_lock");
  let acquired = false;
  let sessionAlreadyCompleted = false;

  await writeDb((draft) => {
    const mutableSession = draft.therapySessions.find(
      (item) => item.id === sessionId && item.userId === userId
    );
    if (!mutableSession) {
      return;
    }

    if (mutableSession.status === "completed") {
      sessionAlreadyCompleted = true;
      return;
    }

    const lockAt = mutableSession.completionLockAt
      ? new Date(mutableSession.completionLockAt).getTime()
      : 0;
    const lockExpired = !lockAt || Number.isNaN(lockAt) || Date.now() - lockAt > COMPLETION_LOCK_TTL_MS;
    if (mutableSession.completionLockId && !lockExpired) {
      return;
    }

    mutableSession.completionLockId = lockId;
    mutableSession.completionLockAt = new Date().toISOString();
    acquired = true;
  });

  return { acquired, lockId, sessionAlreadyCompleted };
}

async function releaseCompletionLock(userId: string, sessionId: string, lockId: string) {
  await writeDb((draft) => {
    const mutableSession = draft.therapySessions.find(
      (item) => item.id === sessionId && item.userId === userId
    );
    if (!mutableSession || mutableSession.completionLockId !== lockId) {
      return;
    }

    delete mutableSession.completionLockId;
    delete mutableSession.completionLockAt;
  });
}

export async function completeSession(
  user: UserRecord,
  sessionId: string
): Promise<SessionCompleteResult> {
  const db = await readDb();
  const session = db.therapySessions.find(
    (item) => item.id === sessionId && item.userId === user.id
  );

  if (!session) {
    throw new Error("NOT_FOUND");
  }

  if (session.status === "completed") {
    return {
      sessionId: session.id,
      supervisionCreated: Boolean(session.supervisionId),
      supervisionFailed: false,
      alreadyCompleted: true
    };
  }

  const completionLock = await acquireCompletionLock(user.id, sessionId);
  if (completionLock.sessionAlreadyCompleted) {
    return {
      sessionId: session.id,
      supervisionCreated: Boolean(session.supervisionId),
      supervisionFailed: false,
      alreadyCompleted: true
    };
  }
  if (!completionLock.acquired) {
    throw new Error("SESSION_COMPLETING");
  }

  try {
    const messages = parseTranscript(session);
    const therapyJournalDraft = buildTherapyJournal(messages, session.title);
    const therapyJournalExisting = db.therapyJournals.find((item) => item.userId === user.id);
    const mergedTherapy = mergeJournalContent(
      therapyJournalExisting
        ? decryptForUser(user.id, therapyJournalExisting.content)
        : null,
      therapyJournalDraft.content
    );

    const therapyJournal: TherapyJournalRecord = therapyJournalExisting ?? {
      id: createId("therapy_journal"),
      userId: user.id,
      updatedAt: new Date().toISOString(),
      content: encryptForUser(user.id, mergedTherapy),
      redactedSummary: therapyJournalDraft.redactedSummary
    };

    const hasExistingTherapyJournal = Boolean(therapyJournalExisting);

    let supervisionRun: SupervisionRunRecord | undefined;
    let supervisionJournal: SupervisionJournalRecord | undefined;
    let supervisionFailed = false;
    let supervisionFailureReason: string | undefined;
    let alreadyCompleted = false;

    if (session.autoSupervision) {
      try {
        const supervisionJournalExisting = db.supervisionJournals.find(
          (item) => item.userId === user.id
        );
        const supervisionOutput = await generateSupervisionArtifacts({
          sessionTitle: session.title,
          messages,
          supervisionJournal: supervisionJournalExisting
            ? decryptForUser(user.id, supervisionJournalExisting.content)
            : null
        });
        const supervisionArtifacts = buildSupervisionRecords({
          userId: user.id,
          session,
          journalContent: supervisionJournalExisting
            ? decryptForUser(user.id, supervisionJournalExisting.content)
            : null,
          output: supervisionOutput
        });
        supervisionRun = supervisionArtifacts.run;
        supervisionJournal = supervisionJournalExisting
          ? {
              ...supervisionJournalExisting,
              updatedAt: supervisionArtifacts.journal.updatedAt,
              content: supervisionArtifacts.journal.content,
              redactedSummary: supervisionArtifacts.journal.redactedSummary
            }
          : supervisionArtifacts.journal;
      } catch (error) {
        supervisionFailed = true;
        supervisionFailureReason = formatSupervisionFailureReason(error);
      }
    }

    if (therapyJournalExisting) {
      therapyJournal.updatedAt = new Date().toISOString();
      therapyJournal.content = encryptForUser(user.id, mergedTherapy);
      therapyJournal.redactedSummary = therapyJournalDraft.redactedSummary;
    }

    let finalized = false;
    await writeDb((draft) => {
      const mutableSession = draft.therapySessions.find((item) => item.id === session.id);
      if (!mutableSession) {
        return;
      }

      if (mutableSession.status === "completed") {
        alreadyCompleted = true;
        return;
      }

      if (mutableSession.completionLockId !== completionLock.lockId) {
        return;
      }

      mutableSession.status = "completed";
      mutableSession.completedAt = new Date().toISOString();
      mutableSession.updatedAt = new Date().toISOString();
      mutableSession.redactedSummary = therapyJournalDraft.redactedSummary;
      delete mutableSession.completionLockId;
      delete mutableSession.completionLockAt;
      finalized = true;
      if (supervisionRun) {
        mutableSession.supervisionId = supervisionRun.id;
        delete mutableSession.supervisionFailureReason;
        delete mutableSession.supervisionFailedAt;
      } else if (supervisionFailed) {
        mutableSession.supervisionFailureReason = supervisionFailureReason;
        mutableSession.supervisionFailedAt = new Date().toISOString();
      }

      if (hasExistingTherapyJournal) {
        const existing = draft.therapyJournals.find((item) => item.userId === user.id);
        if (existing) {
          existing.updatedAt = therapyJournal.updatedAt;
          existing.content = therapyJournal.content;
          existing.redactedSummary = therapyJournal.redactedSummary;
        }
      } else {
        draft.therapyJournals.push(therapyJournal);
      }

      if (supervisionRun) {
        draft.supervisionRuns.push(supervisionRun);
      }

      if (supervisionJournal) {
        const existing = draft.supervisionJournals.find((item) => item.userId === user.id);
        if (existing) {
          existing.updatedAt = supervisionJournal.updatedAt;
          existing.content = supervisionJournal.content;
          existing.redactedSummary = supervisionJournal.redactedSummary;
        } else {
          draft.supervisionJournals.push(supervisionJournal);
        }
      }
    });

    if (alreadyCompleted) {
      return {
        sessionId: session.id,
        supervisionCreated: Boolean(session.supervisionId),
        supervisionFailed: false,
        alreadyCompleted: true
      };
    }

    if (!finalized) {
      throw new Error("SESSION_COMPLETING");
    }

    await logEvent(user, "session_completed", { autoSupervision: session.autoSupervision }, session.id);
    if (supervisionRun) {
      await logEvent(user, "supervision_completed", { sessionTitle: session.title }, session.id);
    }

    return {
      sessionId: session.id,
      supervisionCreated: Boolean(supervisionRun),
      supervisionFailed,
      alreadyCompleted: false
    };
  } catch (error) {
    await releaseCompletionLock(user.id, session.id, completionLock.lockId);
    throw error;
  };
}

export async function rerunSupervisionForSession(
  user: UserRecord,
  sessionId: string
): Promise<SessionSupervisionResult> {
  const db = await readDb();
  const session = db.therapySessions.find(
    (item) => item.id === sessionId && item.userId === user.id
  );

  if (!session) {
    throw new Error("NOT_FOUND");
  }

  if (session.status !== "completed") {
    throw new Error("SESSION_NOT_COMPLETED");
  }

  if (session.supervisionId) {
    return {
      sessionId: session.id,
      supervisionCreated: true,
      alreadyCreated: true
    };
  }

  const messages = parseTranscript(session);
  const supervisionJournalExisting = db.supervisionJournals.find(
    (item) => item.userId === user.id
  );
  const existingJournalContent = supervisionJournalExisting
    ? decryptForUser(user.id, supervisionJournalExisting.content)
    : null;
  const supervisionOutput = await generateSupervisionArtifacts({
    sessionTitle: session.title,
    messages,
    supervisionJournal: existingJournalContent
  });
  const supervisionArtifacts = buildSupervisionRecords({
    userId: user.id,
    session,
    journalContent: existingJournalContent,
    output: supervisionOutput
  });
  const supervisionRun = supervisionArtifacts.run;
  const supervisionJournal = supervisionJournalExisting
    ? {
        ...supervisionJournalExisting,
        updatedAt: supervisionArtifacts.journal.updatedAt,
        content: supervisionArtifacts.journal.content,
        redactedSummary: supervisionArtifacts.journal.redactedSummary
      }
    : supervisionArtifacts.journal;

  await writeDb((draft) => {
    const mutableSession = draft.therapySessions.find(
      (item) => item.id === session.id && item.userId === user.id
    );
    if (!mutableSession) {
      return;
    }

    if (mutableSession.supervisionId) {
      return;
    }

    mutableSession.supervisionId = supervisionRun.id;
    delete mutableSession.supervisionFailureReason;
    delete mutableSession.supervisionFailedAt;
    draft.supervisionRuns.push(supervisionRun);

    const existing = draft.supervisionJournals.find((item) => item.userId === user.id);
    if (existing) {
      existing.updatedAt = supervisionJournal.updatedAt;
      existing.content = supervisionJournal.content;
      existing.redactedSummary = supervisionJournal.redactedSummary;
    } else {
      draft.supervisionJournals.push(supervisionJournal);
    }
  });

  await logEvent(user, "supervision_completed", { sessionTitle: session.title }, session.id);

  return {
    sessionId: session.id,
    supervisionCreated: true,
    alreadyCreated: false
  };
}

export async function deleteSessionForUser(
  user: UserRecord,
  sessionId: string
): Promise<SessionDeleteResult> {
  const db = await readDb();
  const session = db.therapySessions.find(
    (item) => item.id === sessionId && item.userId === user.id
  );

  if (!session) {
    throw new Error("NOT_FOUND");
  }

  const remainingSessions = db.therapySessions.filter(
    (item) => !(item.id === sessionId && item.userId === user.id)
  );
  const nextTherapyJournal = buildMergedTherapyJournalContent(user.id, remainingSessions);
  const nextSupervision = buildMergedSupervisionArtifacts(db, user.id, remainingSessions);

  await writeDb((draft) => {
    draft.therapySessions = draft.therapySessions.filter(
      (item) => !(item.id === sessionId && item.userId === user.id)
    );
    draft.supervisionRuns = draft.supervisionRuns.filter(
      (item) => !(item.userId === user.id && item.sessionId === sessionId)
    );
    draft.analyticsEvents = draft.analyticsEvents.filter(
      (item) => !(item.userHash === user.analyticsId && item.sessionId === sessionId)
    );

    if (nextTherapyJournal) {
      const existing = draft.therapyJournals.find((item) => item.userId === user.id);
      if (existing) {
        existing.updatedAt = nextTherapyJournal.updatedAt;
        existing.content = nextTherapyJournal.content;
        existing.redactedSummary = nextTherapyJournal.redactedSummary;
      } else {
        draft.therapyJournals.push({
          id: createId("therapy_journal"),
          userId: user.id,
          updatedAt: nextTherapyJournal.updatedAt,
          content: nextTherapyJournal.content,
          redactedSummary: nextTherapyJournal.redactedSummary
        });
      }
    } else {
      draft.therapyJournals = draft.therapyJournals.filter((item) => item.userId !== user.id);
    }

    if (nextSupervision.journal) {
      const existing = draft.supervisionJournals.find((item) => item.userId === user.id);
      if (existing) {
        existing.updatedAt = nextSupervision.journal.updatedAt;
        existing.content = nextSupervision.journal.content;
        existing.redactedSummary = nextSupervision.journal.redactedSummary;
      } else {
        draft.supervisionJournals.push({
          id: createId("supervision_journal"),
          userId: user.id,
          updatedAt: nextSupervision.journal.updatedAt,
          content: nextSupervision.journal.content,
          redactedSummary: nextSupervision.journal.redactedSummary
        });
      }
    } else {
      draft.supervisionJournals = draft.supervisionJournals.filter((item) => item.userId !== user.id);
    }

    const userRunIds = new Set(nextSupervision.runs.map((item) => item.id));
    draft.supervisionRuns = draft.supervisionRuns.filter(
      (item) => item.userId !== user.id || userRunIds.has(item.id)
    );
    nextSupervision.runs.forEach((run) => {
      const existing = draft.supervisionRuns.find((item) => item.id === run.id);
      if (existing) {
        existing.createdAt = run.createdAt;
        existing.completedAt = run.completedAt;
        existing.transcript = run.transcript;
        existing.redactedSummary = run.redactedSummary;
        existing.journalEntryPreview = run.journalEntryPreview;
      } else {
        draft.supervisionRuns.push(run);
      }
    });
  });

  return {
    deletedSessionId: sessionId
  };
}

export async function getTherapyJournal(userId: string): Promise<TherapyJournalResult> {
  const db = await readDb();
  const journal = db.therapyJournals.find((item) => item.userId === userId);
  if (!journal) {
    return {
      updatedAt: null,
      content: "还没有咨询师手帐。完成一次 session 后，这里会自动生成结构化记录。"
    };
  }

  try {
    return {
      updatedAt: journal.updatedAt,
      content: decryptForUser(userId, journal.content)
    };
  } catch {
    return {
      updatedAt: journal.updatedAt,
      content: "当前手帐暂时无法读取，建议重新完成一次会谈后自动刷新。"
    };
  }
}

export async function getSupervisionJournal(
  userId: string
): Promise<SupervisionJournalResult> {
  const db = await readDb();
  const journal = db.supervisionJournals.find((item) => item.userId === userId);
  const completedSessions = db.therapySessions.filter(
    (session) => session.userId === userId && session.status === "completed"
  );
  const runs = db.supervisionRuns
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const resolvedSessionId = resolveSupervisionRunSessionId(completedSessions, item);
      if (!resolvedSessionId) {
        return null;
      }

      try {
        return {
          id: item.id,
          sessionId: resolvedSessionId,
          createdAt: item.createdAt,
          completedAt: item.completedAt,
          redactedSummary: item.redactedSummary,
          transcript: JSON.parse(decryptForUser(userId, item.transcript)) as ChatMessage[]
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  let content = "还没有督导手帐。完成一次会谈后，这里会累积督导洞见。";
  if (journal) {
    try {
      content = decryptForUser(userId, journal.content);
    } catch {
      content = "当前督导手帐暂时无法读取，后续完成会谈后会自动重建。";
    }
  }

  return {
    updatedAt: journal?.updatedAt ?? null,
    content,
    runs
  };
}
