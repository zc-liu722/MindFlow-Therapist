import { createId } from "@/lib/crypto";
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

function groupByDay(dates: string[]) {
  const map = new Map<string, number>();
  dates.forEach((value) => {
    const day = value.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  });

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

export async function getAdminOverview(): Promise<AdminOverviewResult> {
  const db = await readDb();
  const sessions = db.therapySessions;
  const completed = sessions.filter((item) => item.status === "completed");
  const supervisionCount = completed.filter((item) => item.supervisionId).length;
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

  const riskDistribution = {
    low: sessions.filter((item) => item.riskLevel === "low").length,
    medium: sessions.filter((item) => item.riskLevel === "medium").length,
    high: sessions.filter((item) => item.riskLevel === "high").length
  };

  const averageTurns =
    sessions.length === 0
      ? 0
      : Number(
          (
            sessions.reduce((sum, item) => sum + item.messageCount, 0) / sessions.length
          ).toFixed(1)
        );

  return {
    totalUsers: db.users.filter((item) => item.role === "user").length,
    totalSessions: sessions.length,
    completedSessions: completed.length,
    supervisionRate:
      completed.length === 0 ? 0 : Number(((supervisionCount / completed.length) * 100).toFixed(1)),
    averageTurns,
    moderationSummary: {
      totalIncidents: incidents.length,
      suspendedUsers: affectedAccounts.filter((item) => item.status === "suspended").length,
      bannedUsers: affectedAccounts.filter((item) => item.status === "banned").length
    },
    riskDistribution,
    sessionsByDay: groupByDay(sessions.map((item) => item.createdAt)),
    eventsByType: Object.entries(
      db.analyticsEvents.reduce<Record<string, number>>((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([type, count]) => ({ type, count })),
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
