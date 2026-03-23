"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "user" | "admin";
type AuthMode = "login" | "register";
type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "mindflow-theme-preference";

type AuthResponse = {
  error?: string;
  user?: {
    id: string;
    displayName: string;
    username: string;
    role: Role;
  };
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function mapErrorMessage(message?: string) {
  switch (message) {
    case "USER_NOT_FOUND":
      return "未找到该账号，请先注册。";
    case "INVALID_CREDENTIALS":
      return "用户名或密码不正确。";
    case "FORBIDDEN_ROLE":
      return "该账号没有对应入口权限。";
    case "PRIVACY_CONSENT_REQUIRED":
      return "请先同意内容加密存储于服务器。";
    case "AI_CONSENT_REQUIRED":
      return "请先同意内容上传模型进行分析。";
    case "RATE_LIMITED":
      return "操作过于频繁，请稍后再试。";
    default:
      return message ?? "暂时无法继续，请稍后再试。";
  }
}

function SunIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <circle cx="12" cy="12" fill="currentColor" opacity="0.18" r="4.2" />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path
        d="M18.5 14.6A6.6 6.6 0 0 1 9.4 5.5a7.8 7.8 0 1 0 9.1 9.1Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M18.5 14.6A6.6 6.6 0 0 1 9.4 5.5a7.8 7.8 0 1 0 9.1 9.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function AutoThemeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path
        d="M12 4.2a7.8 7.8 0 1 0 7.8 7.8A7.8 7.8 0 0 0 12 4.2Zm0 0V2.8m0 18.4v-1.4m9.2-7.8h-1.4M4.2 12H2.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M12 8.2v5.6M9.2 11h5.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export function AuthPanel() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [adminInviteCode, setAdminInviteCode] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [aiProcessingConsent, setAiProcessingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const root = document.documentElement;
    const storedPreference = root.dataset.themePreference;

    if (
      storedPreference === "light" ||
      storedPreference === "dark" ||
      storedPreference === "system"
    ) {
      setThemePreference(storedPreference);
      return;
    }

    try {
      const savedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (
        savedPreference === "light" ||
        savedPreference === "dark" ||
        savedPreference === "system"
      ) {
        setThemePreference(savedPreference);
      }
    } catch {
      // Ignore storage failures and keep system mode.
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme(preference: ThemePreference) {
      const resolvedTheme =
        preference === "system" ? (mediaQuery.matches ? "dark" : "light") : preference;

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = resolvedTheme;

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // Ignore storage failures and still apply the in-memory preference.
      }
    }

    applyTheme(themePreference);

    const handleChange = () => {
      if (themePreference === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themePreference]);

  const nextThemePreference: Record<ThemePreference, ThemePreference> = {
    system: "light",
    light: "dark",
    dark: "system"
  };

  function renderThemeIcon() {
    if (themePreference === "light") {
      return <SunIcon />;
    }
    if (themePreference === "dark") {
      return <MoonIcon />;
    }
    return <AutoThemeIcon />;
  }

  function getThemeButtonLabel() {
    if (themePreference === "light") {
      return "切换主题，当前为白天模式";
    }
    if (themePreference === "dark") {
      return "切换主题，当前为黑夜模式";
    }
    return "切换主题，当前跟随系统";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeUsername(username);
    if (!normalized) {
      setError("请输入用户名");
      return;
    }

    if (!password.trim()) {
      setError("请输入密码");
      return;
    }

    if (authMode === "register" && password.trim().length < 8) {
      setError("密码至少需要 8 位");
      return;
    }

    if (authMode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (!privacyConsent) {
      setError("请先同意内容加密存储于服务器");
      return;
    }

    if (!aiProcessingConsent) {
      setError("请先同意内容上传模型进行分析");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalized,
          displayName: (displayName || username).trim(),
          password,
          role: adminMode ? "admin" : "user",
          adminInviteCode: adminMode && authMode === "register" ? adminInviteCode.trim() : undefined,
          privacyConsent,
          aiProcessingConsent
        })
      });

      const payload = (await response.json()) as AuthResponse;
      if (!response.ok || !payload.user) {
        setError(mapErrorMessage(payload.error));
        return;
      }

      router.push(payload.user.role === "admin" ? "/admin" : "/app");
      router.refresh();
    } catch {
      setError("网络暂时不可用，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing-shell">
      <div className="landing-motion landing-motion-mist" />
      <div className="landing-motion landing-motion-orbit" />
      <div className="landing-motion landing-motion-beam" />
      <div className="landing-ribbon landing-ribbon-left" />
      <div className="landing-ribbon landing-ribbon-right" />
      <div className="landing-prism landing-prism-top" />
      <div className="landing-prism landing-prism-bottom" />
      <div className="landing-particles" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="landing-glow landing-glow-left" />
      <div className="landing-glow landing-glow-right" />
      <div className="landing-gridline" />

      <section className="hero auth-hero">
        <div className="hero-copy auth-hero-copy">
          <span className="eyebrow auth-eyebrow">MindFlow Therapist</span>
          <p className="auth-kicker">AI 心理支持工作台</p>
          <h1>
            <span>把说不清的感受，</span>
            <span>慢慢说清楚。</span>
          </h1>
          <p className="auth-subtitle">
            面向爱思考者的 AI
            心理支持平台，既能陪你完成每一次真实对话，也会自动整理会谈脉络、生成手帐与督导记录，让你的情绪表达不只被回应，还能被持续看见和慢慢梳理。
          </p>

          <div className="auth-value-strip" aria-label="产品功能概览">
            <article>
              <strong>顶级模型，深度思考</strong>
              <p>
                基于目前全球最顶级通用模型 Claude Opus 4.6 与 High Thinking
                模式，产品能更深入地理解情绪、组织回应与把握上下文，我们相信深度咨询是高智力活动，最聪明的模型才能最胜任这份工作。
              </p>
            </article>
            <article>
              <strong>拟人沉淀，长期进化</strong>
              <p>
                每次会谈后，系统会自动生成咨询手帐与督导记录，让 AI
                咨询师像真人咨询师一样在复盘和督导中不断调整、学习与进化，形成很强的拟人感与成长感。
              </p>
            </article>
            <article>
              <strong>边界清晰，隐私加密</strong>
              <p>
                聊天内容、手帐与督导记录都会加密存储，管理员只能统计数据，无法查看内容，让用户在被理解和陪伴的同时，也能获得更可靠的安全感与信任感。
              </p>
            </article>
          </div>
        </div>

        <div className="auth-card auth-card-refined">
          <div className="auth-card-top auth-card-top-refined">
            <div className="auth-card-heading">
              <h2>{authMode === "login" ? "欢迎回来" : "创建你的入口"}</h2>
            </div>
            <button
              aria-label={getThemeButtonLabel()}
              className="ghost-button icon-button theme-toggle-button auth-theme-toggle"
              data-theme-mode={
                themePreference === "system" ? "A" : themePreference === "light" ? "日" : "夜"
              }
              onClick={() => setThemePreference(nextThemePreference[themePreference])}
              type="button"
            >
              {renderThemeIcon()}
            </button>
          </div>

          <div className="auth-segment" role="tablist" aria-label="认证模式">
            <button
              className={authMode === "login" ? "auth-segment-button is-active" : "auth-segment-button"}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              登录
            </button>
            <button
              className={authMode === "register" ? "auth-segment-button is-active" : "auth-segment-button"}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              注册
            </button>
          </div>

          <div className="auth-role-switch" role="tablist" aria-label="角色入口">
            <button
              className={!adminMode ? "auth-role-button is-active" : "auth-role-button"}
              onClick={() => setAdminMode(false)}
              type="button"
            >
              用户入口
            </button>
            <button
              className={adminMode ? "auth-role-button is-active" : "auth-role-button"}
              onClick={() => setAdminMode(true)}
              type="button"
            >
              管理员入口
            </button>
          </div>

          <form className="auth-form auth-form-refined" onSubmit={submit}>
            <label>
              <span>用户名</span>
              <input
                autoComplete="username"
                autoFocus
                placeholder="your-id"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>

            {authMode === "register" ? (
              <label>
                <span>显示名称</span>
                <input
                  autoComplete="nickname"
                  placeholder="对话中展示的名字"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            ) : null}

            <label>
              <span>密码</span>
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                placeholder={authMode === "login" ? "输入密码" : "至少 8 位"}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {authMode === "register" ? (
              <label>
                <span>确认密码</span>
                <input
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            ) : null}

            {adminMode && authMode === "register" ? (
              <label>
                <span>管理员邀请码</span>
                <input
                  autoComplete="one-time-code"
                  placeholder="输入邀请码"
                  value={adminInviteCode}
                  onChange={(event) => setAdminInviteCode(event.target.value)}
                />
              </label>
            ) : null}

            <div className="auth-consent-group">
              <label className="create-session-toggle auth-consent-row">
                <span className="create-session-toggle-copy">
                  <strong>同意内容加密存储于服务器</strong>
                  <small>你的聊天内容、咨询手帐与督导记录会以加密方式保存于服务端，用于支持连续会谈、长期回看与稳定整理；我们只保留提供服务所必需的信息。</small>
                </span>
                <input
                  checked={privacyConsent}
                  onChange={(event) => setPrivacyConsent(event.target.checked)}
                  type="checkbox"
                />
              </label>

              <label className="create-session-toggle auth-consent-row">
                <span className="create-session-toggle-copy">
                  <strong>同意内容上传模型进行分析</strong>
                  <small>为了生成更准确的回应、总结与督导建议，当前对话中必要的上下文会发送给模型处理；系统会尽量控制范围，仅使用完成本次生成所需要的内容。</small>
                </span>
                <input
                  checked={aiProcessingConsent}
                  onChange={(event) => setAiProcessingConsent(event.target.checked)}
                  type="checkbox"
                />
              </label>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <button className="primary-button auth-submit-button" disabled={loading} type="submit">
              {loading ? "正在进入..." : authMode === "login" ? "进入工作台" : "注册并进入"}
            </button>
          </form>

          {adminMode && authMode === "register" ? <p className="form-hint auth-form-hint">管理员注册需要邀请码。</p> : null}
        </div>
      </section>
    </main>
  );
}
