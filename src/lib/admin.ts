import { createId } from "@/lib/crypto";
import { ensureUserBillingState, resolveQuotaWindow } from "@/lib/billing";
import { readDb, writeDb } from "@/lib/db";
import type {
  AdminOverviewResult,
  ModerationAccountUpdateResult
} from "@/lib/domain-types";
import { getEffectiveModerationState } from "@/lib/guardrails";

function formatModerationStatus(status: "active" | "suspended" | "banned") {
  switch (status) {
    case "suspended":
      return "已限制";
    case "banned":
      return "已封禁";
    default:
      return "正常";
  }
}

function buildSessionOverviewMetrics(sessions: Awaited<ReturnType<typeof readDb>>["therapySessions"]) {
  const metrics = sessions.reduce(
    (acc, session) => {
      if (session.status === "completed") {
        acc.completedCount += 1;
        if (session.supervisionId) {
          acc.supervisionCount += 1;
        }
      }

      acc.totalTurns += session.messageCount;
      acc.riskDistribution[session.riskLevel] += 1;

      const day = session.createdAt.slice(0, 10);
      acc.sessionCountByDay.set(day, (acc.sessionCountByDay.get(day) ?? 0) + 1);
      return acc;
    },
    {
      completedCount: 0,
      supervisionCount: 0,
      totalTurns: 0,
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0
      },
      sessionCountByDay: new Map<string, number>()
    }
  );

  return {
    ...metrics,
    sessionsByDay: [...metrics.sessionCountByDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }))
  };
}

function buildEventTypeSummary(events: Awaited<ReturnType<typeof readDb>>["analyticsEvents"]) {
  const counts = events.reduce((acc, event) => {
    acc.set(event.type, (acc.get(event.type) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return [...counts.entries()].map(([type, count]) => ({ type, count }));
}

export async function getAdminOverview(): Promise<AdminOverviewResult> {
  const db = await readDb();
  const sessions = db.therapySessions;
  const quotaWindow = resolveQuotaWindow();
  const sessionMetrics = buildSessionOverviewMetrics(sessions);
  const incidents = [...db.moderationIncidents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const userById = new Map(db.users.map((user) => [user.id, user]));
  const affectedAccounts = db.users
    .filter((user) => user.role === "user")
    .map((user) => {
      const moderation = getEffectiveModerationState(user);
      const relatedIncidents = incidents.filter((item) => item.userId === user.id);
      const latestIncident = relatedIncidents[0];

      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        status: moderation.status,
        statusLabel: formatModerationStatus(moderation.status),
        warningCount: moderation.warningCount,
        suspendedUntil: moderation.suspendedUntil,
        bannedAt: moderation.bannedAt,
        banReason: moderation.banReason,
        lastIncidentAt: moderation.lastIncidentAt,
        incidentCount: relatedIncidents.length,
        latestReason: latestIncident?.reason ?? "",
        latestCategory: latestIncident?.category ?? ""
      };
    })
    .filter((user) => user.warningCount > 0 || user.status !== "active" || user.incidentCount > 0)
    .sort((a, b) => {
      const score = (item: {
        status: "active" | "suspended" | "banned";
        warningCount: number;
        lastIncidentAt?: string;
      }) =>
        (item.status === "banned" ? 2 : item.status === "suspended" ? 1 : 0) * 10_000 +
        item.warningCount * 100 +
        (item.lastIncidentAt ? new Date(item.lastIncidentAt).getTime() : 0);

      return score(b) - score(a);
    });

  const recentModerationIncidents = incidents.slice(0, 100).map((incident) => {
    const user = userById.get(incident.userId);
    return {
      ...incident,
      username: user?.username ?? "unknown",
      displayName: user?.displayName ?? "未知用户"
    };
  });

  const averageTurns =
    sessions.length === 0
      ? 0
      : Number(
          (
            sessionMetrics.totalTurns / sessions.length
          ).toFixed(1)
        );
  const billedUsers = db.users.filter((item) => item.role === "user").map((item) => ensureUserBillingState(item));
  const usageEntries = db.usageLedger;
  const monthlyUsageEntries = usageEntries.filter(
    (item) =>
      item.createdAt >= quotaWindow.quotaPeriodStart &&
      item.createdAt <= quotaWindow.quotaPeriodEnd
  );
  const monthlySessionsConsumed = sessions.filter(
    (item) =>
      item.quotaChargedAt &&
      item.quotaChargedAt >= quotaWindow.quotaPeriodStart &&
      item.quotaChargedAt <= quotaWindow.quotaPeriodEnd
  ).length;

  return {
    totalUsers: db.users.filter((item) => item.role === "user").length,
    totalSessions: sessions.length,
    completedSessions: sessionMetrics.completedCount,
    supervisionRate:
      sessionMetrics.completedCount === 0
        ? 0
        : Number(
            ((sessionMetrics.supervisionCount / sessionMetrics.completedCount) * 100).toFixed(1)
          ),
    averageTurns,
    billingSummary: {
      freeUsers: billedUsers.filter((item) => item.plan === "free").length,
      plusUsers: billedUsers.filter((item) => item.plan === "plus").length,
      activePlusUsers: billedUsers.filter((item) => item.billing.isPlusActive).length,
      monthlySessionsConsumed,
      monthlyUsageCostCny: Number(
        monthlyUsageEntries.reduce((sum, item) => sum + item.estimatedCostCny, 0).toFixed(2)
      ),
      totalUsageCostCny: Number(
        usageEntries.reduce((sum, item) => sum + item.estimatedCostCny, 0).toFixed(2)
      )
    },
    moderationSummary: {
      totalIncidents: incidents.length,
      suspendedUsers: affectedAccounts.filter((item) => item.status === "suspended").length,
      bannedUsers: affectedAccounts.filter((item) => item.status === "banned").length
    },
    riskDistribution: sessionMetrics.riskDistribution,
    sessionsByDay: sessionMetrics.sessionsByDay,
    eventsByType: buildEventTypeSummary(db.analyticsEvents),
    recentModerationIncidents,
    affectedAccounts
  };
}

export async function updateModerationAccount(input: {
  adminUserId: string;
  userId: string;
  action: "reinstate" | "clear_warnings";
}): Promise<ModerationAccountUpdateResult> {
  let updated = false;
  let result:
    | {
        userId: string;
        status: "active" | "suspended" | "banned";
        warningCount: number;
      }
    | undefined;

  await writeDb((draft) => {
    const user = draft.users.find((item) => item.id === input.userId && item.role === "user");
    const admin = draft.users.find((item) => item.id === input.adminUserId);
    if (!user || !admin) {
      return;
    }

    const moderation = getEffectiveModerationState(user);

    if (input.action === "reinstate") {
      user.moderation = {
        ...moderation,
        status: "active",
        warningCount: moderation.warningCount,
        lastIncidentAt: moderation.lastIncidentAt
      };
      delete user.moderation.suspendedUntil;
      delete user.moderation.bannedAt;
      delete user.moderation.banReason;
    } else {
      user.moderation = {
        ...moderation,
        warningCount: 0
      };
    }

    draft.analyticsEvents.push({
      id: createId("evt"),
      userHash: user.analyticsId,
      type: input.action === "reinstate" ? "account_suspended" : "moderation_warned",
      createdAt: new Date().toISOString(),
      metadata: {
        adminUserId: admin.id,
        manualAction: input.action,
        resultingStatus: user.moderation.status,
        resultingWarningCount: user.moderation.warningCount
      }
    });

    updated = true;
    result = {
      userId: user.id,
      status: user.moderation.status,
      warningCount: user.moderation.warningCount
    };
  });

  if (!updated || !result) {
    throw new Error("NOT_FOUND");
  }

  return result;
}
