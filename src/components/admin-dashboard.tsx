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
  riskDistribution: { low: number; medium: number; high: number };
  sessionsByDay: { date: string; count: number }[];
  eventsByType: { type: string; count: number }[];
};

export function AdminDashboard({ user }: { user: User }) {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/overview");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as Overview;
      setOverview(payload);
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
      </section>

      <section className="admin-panels">
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
                <span>{item.date}</span>
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
            <li>适合后续接数据库、任务队列与 KMS 升级</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
