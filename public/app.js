const app = document.getElementById("app");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bindAuthPage() {
  const form = document.querySelector("#auth-form");
  const role = document.querySelector("#role");
  const displayNameWrap = document.querySelector("#display-name-wrap");
  const adminCodeWrap = document.querySelector("#admin-code-wrap");
  const modeInputs = document.querySelectorAll("input[name='mode']");
  const errorEl = document.querySelector("#auth-error");

  function refreshMode() {
    const mode = document.querySelector("input[name='mode']:checked").value;
    const roleValue = role.value;
    displayNameWrap.style.display = mode === "register" ? "block" : "none";
    adminCodeWrap.style.display = mode === "register" && roleValue === "admin" ? "block" : "none";
  }

  role.addEventListener("change", refreshMode);
  modeInputs.forEach((item) => item.addEventListener("change", refreshMode));
  refreshMode();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    const formData = new FormData(form);
    const mode = formData.get("mode");
    try {
      const payload =
        mode === "login"
          ? await api("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({
                username: formData.get("username"),
                password: formData.get("password")
              })
            })
          : await api("/api/auth/register", {
              method: "POST",
              body: JSON.stringify({
                role: formData.get("role"),
                displayName: formData.get("displayName"),
                username: formData.get("username"),
                password: formData.get("password"),
                adminInviteCode: formData.get("adminInviteCode")
              })
            });
      location.href = payload.user.role === "admin" ? "/admin" : "/app";
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
}

async function renderGuest() {
  app.innerHTML = `
    <main class="landing-shell">
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">MindFlow Therapist</span>
          <h1>可分享的 AI 咨询网页，默认按隐私边界来设计。</h1>
          <p>每位用户拥有独立信息流。聊天原文、咨询师手帐和督导记录统一按用户加密存储；管理员界面只能看匿名统计，看不到聊天内容。</p>
          <ul class="feature-list">
            <li>session 对话、开启新 session、查看旧 session</li>
            <li>咨询师手帐自动沉淀</li>
            <li>每次咨询结束后自动生成督导与督导手帐</li>
            <li>管理员只看统计与技术指标，不看原文</li>
          </ul>
        </div>
        <div class="auth-card">
          <form id="auth-form" class="stack">
            <div class="segmented">
              <label><input type="radio" name="mode" value="register" checked /> 注册</label>
              <label><input type="radio" name="mode" value="login" /> 登录</label>
            </div>
            <label>
              <span>账户角色</span>
              <select id="role" name="role">
                <option value="user">来访者 / 咨询用户</option>
                <option value="admin">管理员</option>
              </select>
            </label>
            <label id="display-name-wrap">
              <span>显示名称</span>
              <input name="displayName" />
            </label>
            <label>
              <span>用户名</span>
              <input name="username" />
            </label>
            <label>
              <span>密码</span>
              <input type="password" name="password" />
            </label>
            <label id="admin-code-wrap">
              <span>管理员邀请码</span>
              <input type="password" name="adminInviteCode" />
            </label>
            <p id="auth-error" class="error-text"></p>
            <button class="primary-button" type="submit">进入工作台</button>
            <p class="form-hint">生产环境请设置 APP_ENCRYPTION_KEY 和 ADMIN_INVITE_CODE，并把 JSON 存储升级到数据库与 KMS。</p>
          </form>
        </div>
      </section>
    </main>
  `;
  bindAuthPage();
}

function bindLogout() {
  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      location.href = "/";
    });
  });
}

async function renderAdmin(user) {
  const overview = await api("/api/admin/overview");
  app.innerHTML = `
    <main class="admin-shell">
      <header class="admin-header">
        <div>
          <span class="eyebrow">管理员统计台</span>
          <h1>${escapeHtml(user.displayName)}</h1>
          <p>${escapeHtml(user.username)}</p>
        </div>
        <div class="admin-actions">
          <span class="privacy-badge">此页面不提供聊天正文查询能力</span>
          <button class="ghost-button" data-action="logout" type="button">退出登录</button>
        </div>
      </header>

      <section class="metrics-grid">
        <article class="metric-card"><span>用户数</span><strong>${overview.totalUsers}</strong></article>
        <article class="metric-card"><span>Session 数</span><strong>${overview.totalSessions}</strong></article>
        <article class="metric-card"><span>已完成会谈</span><strong>${overview.completedSessions}</strong></article>
        <article class="metric-card"><span>督导触发率</span><strong>${overview.supervisionRate}%</strong></article>
        <article class="metric-card"><span>平均轮数</span><strong>${overview.averageTurns}</strong></article>
      </section>

      <section class="admin-panels">
        <article class="chart-card">
          <h3>风险等级分布</h3>
          <div class="risk-bars">
            ${Object.entries(overview.riskDistribution).map(([key, count]) => `
              <div>
                <div class="bar-label"><span>${key}</span><span>${count}</span></div>
                <div class="bar-track"><div class="bar-fill bar-${key}" style="width:${Math.max(10, count * 100 / Math.max(...Object.values(overview.riskDistribution), 1))}%"></div></div>
              </div>
            `).join("")}
          </div>
        </article>
        <article class="chart-card">
          <h3>按日会话量</h3>
          <div class="mini-table">
            ${overview.sessionsByDay.map((item) => `<div class="mini-row"><span>${item.date}</span><strong>${item.count}</strong></div>`).join("") || "<p class='muted'>暂无数据</p>"}
          </div>
        </article>
        <article class="chart-card">
          <h3>技术事件概览</h3>
          <div class="mini-table">
            ${overview.eventsByType.map((item) => `<div class="mini-row"><span>${item.type}</span><strong>${item.count}</strong></div>`).join("") || "<p class='muted'>暂无数据</p>"}
          </div>
        </article>
        <article class="chart-card">
          <h3>隐私边界说明</h3>
          <ul class="feature-list compact">
            <li>管理员查询只命中聚合统计接口</li>
            <li>聊天、手帐、督导原文统一按用户加密</li>
            <li>统计数据只保留匿名 ID、计数与流程事件</li>
            <li>方便后续接数据库、队列与 KMS</li>
          </ul>
        </article>
      </section>
    </main>
  `;
  bindLogout();
}

async function renderUser(user) {
  const state = {
    sessions: [],
    activeSessionId: null,
    therapyJournal: "",
    supervisionJournal: "",
    supervisionRuns: [],
    tab: "chat"
  };

  async function load() {
    const [sessionPayload, therapyJournal, supervisionJournal] = await Promise.all([
      api("/api/sessions"),
      api("/api/journal/therapy"),
      api("/api/journal/supervision")
    ]);
    state.sessions = sessionPayload.sessions;
    state.activeSessionId = state.activeSessionId || state.sessions[0]?.id || null;
    state.therapyJournal = therapyJournal.content;
    state.supervisionJournal = supervisionJournal.content;
    state.supervisionRuns = supervisionJournal.runs;
    if (state.activeSessionId) {
      const detail = await api(`/api/sessions/${state.activeSessionId}`);
      state.activeSession = detail.session;
    } else {
      state.activeSession = null;
    }
  }

  async function repaint() {
    const active = state.activeSession;
    app.innerHTML = `
      <main class="app-shell">
        <aside class="sidebar">
          <div>
            <span class="eyebrow">咨询工作台</span>
            <h2>${escapeHtml(user.displayName)}</h2>
            <p class="muted">${escapeHtml(user.username)}</p>
          </div>
          <nav class="nav-column">
            <button class="${state.tab === "chat" ? "nav-active" : ""}" data-tab="chat">当前咨询</button>
            <button class="${state.tab === "history" ? "nav-active" : ""}" data-tab="history">历史 session</button>
            <button class="${state.tab === "therapy" ? "nav-active" : ""}" data-tab="therapy">咨询师手帐</button>
            <button class="${state.tab === "supervision" ? "nav-active" : ""}" data-tab="supervision">督导</button>
          </nav>
          <form id="new-session-form" class="sidebar-section stack">
            <h3>新建 session</h3>
            <label><span>标题</span><input name="title" value="新的支持性会谈" /></label>
            <label><span>取向</span><input name="mode" value="整合取向" /></label>
            <button class="primary-button" type="submit">开启新会谈</button>
          </form>
          <button class="ghost-button" data-action="logout" type="button">退出登录</button>
        </aside>
        <section class="main-panel">
          <header class="panel-header">
            <div>
              <span class="eyebrow">隐私策略</span>
              <h1>原文加密存储，管理员端不可见</h1>
            </div>
            <p class="privacy-badge">分析面板仅使用匿名统计与脱敏元数据</p>
          </header>

          ${
            state.tab === "chat"
              ? `<section class="workspace-grid">
                  <div class="list-card">
                    <div class="list-card-header"><h3>我的会谈</h3><span>${state.sessions.length} 条</span></div>
                    <div class="session-list">
                      ${state.sessions
                        .map(
                          (session) => `
                            <button class="session-item ${session.id === state.activeSessionId ? "is-selected" : ""}" data-session="${session.id}">
                              <div><strong>${escapeHtml(session.title)}</strong><p>${escapeHtml(session.redactedSummary)}</p></div>
                              <div class="risk-dot risk-${session.riskLevel}">${session.riskLevel}</div>
                            </button>
                          `
                        )
                        .join("") || `<div class="empty-state">先创建一个新的 session。</div>`}
                    </div>
                  </div>

                  <div class="chat-card">
                    ${
                      active
                        ? `<div class="chat-head">
                            <div><h3>${escapeHtml(active.title)}</h3><p>${escapeHtml(active.mode)} · ${active.status === "active" ? "进行中" : "已完成"}</p></div>
                            ${
                              active.status === "active"
                                ? `<button class="primary-button" id="complete-session" type="button">结束并自动督导</button>`
                                : `<span class="pill">已归档</span>`
                            }
                          </div>
                          <div class="message-stream">
                            ${active.messages
                              .map(
                                (message) => `
                                  <article class="bubble ${message.role === "user" ? "bubble-user" : "bubble-ai"}">
                                    <span>${message.role === "user" ? "你" : message.role === "supervisor" ? "督导师" : "咨询师"}</span>
                                    <p>${escapeHtml(message.content)}</p>
                                  </article>
                                `
                              )
                              .join("")}
                          </div>
                          ${
                            active.status === "active"
                              ? `<form id="message-form" class="composer">
                                  <textarea name="content" placeholder="从你此刻最想说的那一部分开始。"></textarea>
                                  <button class="primary-button" type="submit">发送</button>
                                </form>`
                              : ""
                          }`
                        : `<div class="empty-state">先在左侧创建一个新的 session，我们就能开始了。</div>`
                    }
                  </div>

                  <div class="context-card">
                    <h3>本次上下文</h3>
                    <dl class="meta-grid">
                      <div><dt>消息数</dt><dd>${active?.messageCount ?? 0}</dd></div>
                      <div><dt>风险等级</dt><dd>${active?.riskLevel ?? "low"}</dd></div>
                      <div><dt>自动督导</dt><dd>会谈结束后自动进行</dd></div>
                      <div><dt>最近更新时间</dt><dd>${active?.updatedAt?.slice(0, 16).replace("T", " ") ?? "-"}</dd></div>
                    </dl>
                    <div class="context-block"><h4>咨询师手帐摘要</h4><p>${escapeHtml(state.therapyJournal.slice(0, 180))}...</p></div>
                    <div class="context-block"><h4>督导提醒</h4><p>${escapeHtml(state.supervisionJournal.slice(0, 180))}...</p></div>
                  </div>
                </section>`
              : ""
          }

          ${
            state.tab === "history"
              ? `<section class="history-card"><h3>历史 session</h3><div class="table-list">
                ${state.sessions
                  .map(
                    (session) => `
                      <div class="table-row">
                        <div><strong>${escapeHtml(session.title)}</strong><p>${escapeHtml(session.redactedSummary)}</p></div>
                        <span>${escapeHtml(session.mode)}</span>
                        <span>${session.status}</span>
                        <span>${session.messageCount} 条</span>
                        <span>${session.updatedAt.slice(0, 10)}</span>
                      </div>
                    `
                  )
                  .join("")}
              </div></section>`
              : ""
          }

          ${
            state.tab === "therapy"
              ? `<section class="journal-card"><div class="journal-header"><h3>咨询师手帐</h3><span>自动从已完成 session 提炼</span></div><pre>${escapeHtml(state.therapyJournal)}</pre></section>`
              : ""
          }

          ${
            state.tab === "supervision"
              ? `<section class="supervision-layout">
                  <div class="journal-card"><div class="journal-header"><h3>督导手帐</h3><span>结束咨询后自动生成</span></div><pre>${escapeHtml(state.supervisionJournal)}</pre></div>
                  <div class="runs-card">
                    <h3>督导记录</h3>
                    ${
                      state.supervisionRuns.length
                        ? state.supervisionRuns
                            .map(
                              (run) => `
                                <article class="run-card">
                                  <header><strong>${escapeHtml(run.redactedSummary)}</strong><span>${run.createdAt.slice(0, 10)}</span></header>
                                  ${run.transcript
                                    .map(
                                      (item) => `
                                        <div class="run-line"><span>${item.role === "supervisor" ? "督导师" : "咨询师"}</span><p>${escapeHtml(item.content)}</p></div>
                                      `
                                    )
                                    .join("")}
                                </article>
                              `
                            )
                            .join("")
                        : `<div class="empty-state">还没有督导记录，完成一次会谈后这里会出现。</div>`
                    }
                  </div>
                </section>`
              : ""
          }
        </section>
      </main>
    `;

    bindLogout();

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.tab = button.dataset.tab;
        await repaint();
      });
    });

    document.querySelector("#new-session-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: formData.get("title"),
          mode: formData.get("mode")
        })
      });
      await load();
      state.tab = "chat";
      await repaint();
    });

    document.querySelectorAll("[data-session]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.activeSessionId = button.dataset.session;
        const detail = await api(`/api/sessions/${state.activeSessionId}`);
        state.activeSession = detail.session;
        await repaint();
      });
    });

    document.querySelector("#message-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await api(`/api/sessions/${state.activeSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: formData.get("content") })
      });
      const detail = await api(`/api/sessions/${state.activeSessionId}`);
      state.activeSession = detail.session;
      state.sessions = (await api("/api/sessions")).sessions;
      await repaint();
    });

    document.querySelector("#complete-session")?.addEventListener("click", async () => {
      await api(`/api/sessions/${state.activeSessionId}/complete`, { method: "POST" });
      await load();
      state.tab = "supervision";
      await repaint();
    });
  }

  await load();
  await repaint();
}

async function main() {
  try {
    const me = await api("/api/me");
    if (!me.user) {
      return renderGuest();
    }
    if (location.pathname === "/admin" || me.user.role === "admin") {
      return renderAdmin(me.user);
    }
    return renderUser(me.user);
  } catch {
    return renderGuest();
  }
}

main();
