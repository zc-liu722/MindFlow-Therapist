import { readDb } from "@/lib/db";

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

export async function getAdminOverview() {
  const db = await readDb();
  const sessions = db.therapySessions;
  const completed = sessions.filter((item) => item.status === "completed");
  const supervisionCount = completed.filter((item) => item.supervisionId).length;

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
    riskDistribution,
    sessionsByDay: groupByDay(sessions.map((item) => item.createdAt)),
    eventsByType: Object.entries(
      db.analyticsEvents.reduce<Record<string, number>>((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([type, count]) => ({ type, count }))
  };
}
