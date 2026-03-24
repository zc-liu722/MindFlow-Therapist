"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  displayName: string;
  username: string;
};

type Overview = {
  totalUsers: number;
  totalSessions: number;
  completedSessions: number;
  supervisionRate: number;
  averageTurns: number;
  moderationSummary: {
    totalIncidents: number;
    suspendedUsers: number;
    bannedUsers: number;
  };
  riskDistribution: { low: number; medium: number; high: number };
  sessionsByDay: { date: string; count: number }[];
  eventsByType: { type: string; count: number }[];
  recentModerationIncidents: {
    id: string;
    userId: string;
    username: string;
    displayName: string;
    sessionId?: string;
    category: string;
    action: string;
    reason: string;
    evidencePreview: string;
    createdAt: string;
  }[];
  affectedAccounts: {
    userId: string;
    username: string;
    displayName: string;
    status: "active" | "suspended" | "banned";
    statusLabel: string;
    warningCount: number;
    suspendedUntil?: string;
    bannedAt?: string;
    banReason?: string;
    lastIncidentAt?: string;
    incidentCount: number;
    latestReason: string;
    latestCategory: string;
  }[];
};

function formatDateOnly(value?: string) {
  if (!value) {
    return "-";
  }

  const [year = "", month = "", day = ""] = value.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${year.slice(-2)}/${month}/${day}`;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export function AdminDashboard({ user }: { user: User }) {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  async function loadOverview() {
    const response = await fetch("/api/admin/overview");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as Overview;
    setOverview(payload);
  }

  async function runModerationAction(userId: string, action: "reinstate" | "clear_warnings") {
    const key = `${action}:${userId}`;
    setBusyAction(key);
    setNotice("");

    try {
      const response = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "操作失败");
        return;
      }

      setNotice(action === "reinstate" ? "已恢复该账号访问权限" : "已清零该账号警告计数");
      await loadOverview();
    } catch {
      setNotice("操作失败");
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
    void (async () => {
      await loadOverview();
    })();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="eyebrow">管理员统计台</span>
          <h1>{user.displayName}</h1>
          <p>{user.username}</p>
        </div>
        <div className="admin-actions">
          <span className="privacy-badge">此页面不提供聊天正文查询能力</span>
          <button className="ghost-button" onClick={logout} type="button">
            退出登录
          </button>
        </div>
      </header>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>用户数</span>
          <strong>{overview?.totalUsers ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>Session 数</span>
          <strong>{overview?.totalSessions ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>已完成会谈</span>
          <strong>{overview?.completedSessions ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>督导触发率</span>
          <strong>{overview ? `${overview.supervisionRate}%` : "-"}</strong>
        </article>
        <article className="metric-card">
          <span>平均轮数</span>
          <strong>{overview?.averageTurns ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>违规事件</span>
          <strong>{overview?.moderationSummary.totalIncidents ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>限制中账号</span>
          <strong>{overview?.moderationSummary.suspendedUsers ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>封禁账号</span>
          <strong>{overview?.moderationSummary.bannedUsers ?? "-"}</strong>
        </article>
      </section>

      {notice ? <div className="notice">{notice}</div> : null}

      <section className="admin-panels">
        <article className="chart-card">
          <h3>受影响账号</h3>
          <div className="mini-table">
            {overview?.affectedAccounts.length ? (
              overview.affectedAccounts.map((account) => {
                const reinstateKey = `reinstate:${account.userId}`;
                const clearWarningsKey = `clear_warnings:${account.userId}`;

                return (
                  <div className="moderation-account-card" key={account.userId}>
                    <div className="moderation-account-head">
                      <div>
                        <strong>{account.displayName}</strong>
                        <p>@{account.username}</p>
                      </div>
                      <span className={`privacy-badge moderation-badge moderation-${account.status}`}>
                        {account.statusLabel}
                      </span>
                    </div>
                    <p className="muted">
                      警告 {account.warningCount} 次，事件 {account.incidentCount} 条
                    </p>
                    <p>{account.latestReason || "暂无最近说明"}</p>
                    <p className="muted">
                      最近分类：{account.latestCategory || "-"} · 最近触发：{formatDateOnly(account.lastIncidentAt)}
                    </p>
                    <div className="admin-inline-actions">
                      <button
                        className="ghost-button"
                        disabled={busyAction === reinstateKey || account.status === "active"}
                        onClick={() => void runModerationAction(account.userId, "reinstate")}
                        type="button"
                      >
                        {busyAction === reinstateKey ? "处理中..." : "恢复访问"}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={busyAction === clearWarningsKey || account.warningCount === 0}
                        onClick={() => void runModerationAction(account.userId, "clear_warnings")}
                        type="button"
                      >
                        {busyAction === clearWarningsKey ? "处理中..." : "清零警告"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="muted">暂无需要处理的账号</p>
            )}
          </div>
        </article>

        <article className="chart-card">
          <h3>违规事件流</h3>
          <div className="mini-table">
            {overview?.recentModerationIncidents.length ? (
              overview.recentModerationIncidents.map((incident) => (
                <div className="moderation-incident-row" key={incident.id}>
                  <div className="moderation-incident-head">
                    <strong>{incident.displayName}</strong>
                    <span>{formatDateTime(incident.createdAt)}</span>
                  </div>
                  <p>
                    @{incident.username} · {incident.category} · {incident.action}
                  </p>
                  <p>{incident.reason}</p>
                  <p className="muted">输入摘录：{incident.evidencePreview || "-"}</p>
                </div>
              ))
            ) : (
              <p className="muted">暂无违规记录</p>
            )}
          </div>
        </article>

        <article className="chart-card">
          <h3>风险等级分布</h3>
          <div className="risk-bars">
            {overview
              ? (Object.entries(overview.riskDistribution) as Array<[string, number]>).map(
                  ([key, count]) => (
                    <div key={key}>
                      <div className="bar-label">
                        <span>{key}</span>
                        <span>{count}</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className={`bar-fill bar-${key}`}
                          style={{
                            width: `${Math.max(
                              10,
                              (count / Math.max(...Object.values(overview.riskDistribution), 1)) * 100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  )
                )
              : null}
          </div>
        </article>

        <article className="chart-card">
          <h3>按日会话量</h3>
          <div className="mini-table">
            {overview?.sessionsByDay.map((item) => (
              <div className="mini-row" key={item.date}>
                <span>{formatDateOnly(item.date)}</span>
                <strong>{item.count}</strong>
              </div>
            )) ?? <p className="muted">暂无数据</p>}
          </div>
        </article>

        <article className="chart-card">
          <h3>技术事件概览</h3>
          <div className="mini-table">
            {overview?.eventsByType.map((item) => (
              <div className="mini-row" key={item.type}>
                <span>{item.type}</span>
                <strong>{item.count}</strong>
              </div>
            )) ?? <p className="muted">暂无数据</p>}
          </div>
        </article>

        <article className="chart-card">
          <h3>隐私边界说明</h3>
          <ul className="feature-list compact">
            <li>管理员查询只命中聚合统计接口</li>
            <li>聊天、手帐、督导原文统一按用户加密</li>
            <li>统计数据只保留匿名 ID、计数与流程事件</li>
            <li>违规后台仅展示事件摘要，不暴露完整聊天原文</li>
            <li>适合后续接数据库、任务队列与 KMS 升级</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
