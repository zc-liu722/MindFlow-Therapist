"use client";

import {
  type KeyboardEvent,
  type UIEvent,
  type MouseEvent,
  type ReactNode,
  memo,
  useEffect,
  useState
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  useDashboardChatUi
} from "@/hooks/use-dashboard-chat-ui";
import { useSessionActions } from "@/hooks/use-session-actions";
import {
  useDashboardUiState,
  type DashboardViewMode as ViewMode
} from "@/hooks/use-dashboard-ui-state";
import type { SessionProgress } from "@/lib/session-progress";
import {
  formatSessionStatusLabel,
  formatStreamingThinkingLine,
  formatSupervisionRole,
  formatSupervisionTitle,
  getNextSessionTitle,
  isStreamNearBottom,
  parseJournalBlocks,
  parseSupervisionArticle,
  resolveSessionForSupervisionRun
} from "@/lib/app-dashboard-utils";
import { formatDateOnly, formatDateTime } from "@/lib/date-format";
import { getDashboardDerivedState } from "@/lib/app-dashboard-selectors";
import { ACTIVE_SESSION_EXISTS_MESSAGE } from "@/lib/client-errors";
import type {
  AppChatMessage as ChatMessage,
  AppViewerUser as User
} from "@/lib/app-dashboard-types";
import {
  DEFAULT_SESSION_MODE,
  SESSION_MODE_CATALOG,
  normalizeSessionMode,
  type SessionMode
} from "@/lib/session-modes";
import {
  SESSION_PACE_CATALOG,
  type SessionPace
} from "@/lib/session-pace";

const THEME_STORAGE_KEY = "mindflow-theme-preference";

function JournalContent({ content }: { content: string }) {
  const blocks = parseJournalBlocks(content);

  if (blocks.length === 0) {
    return <p className="journal-empty">暂无内容。</p>;
  }

  return (
    <div className="journal-rich-text">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h4 className={`journal-heading journal-heading-${block.level}`} key={`heading-${index}`}>
              {block.content}
            </h4>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag className="journal-list" key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p className="journal-paragraph" key={`paragraph-${index}`}>
            {block.content}
          </p>
        );
      })}
    </div>
  );
}

function IconButton({
  children,
  className,
  dataThemeMode,
  label,
  onClick,
  type = "button"
}: {
  children: ReactNode;
  className?: string;
  dataThemeMode?: string;
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      aria-label={label}
      className={className ? `icon-button ${className}` : "icon-button"}
      data-theme-mode={dataThemeMode}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 18.5 3.5 20l1.1-3.5A7.5 7.5 0 1 1 19.5 9 7.4 7.4 0 0 1 7 18.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 8h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm2-3h12l1 3H5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M10 12h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M14 3.5V8h4M10 12h4M10 16h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m12 3 1.8 4.8L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.2ZM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9ZM6 14l.9 2.1L9 17l-2.1.9L6 20l-.9-2.1L3 17l2.1-.9Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 7h14M9 7V5.5h6V7m-8 0 .7 11a1 1 0 0 0 1 .9h6.6a1 1 0 0 0 1-.9L17 7M10 11.5v4.5M14 11.5v4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6.5 9.5 5.5 5 5.5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M18.5 14.5A7.5 7.5 0 0 1 9.5 5.5a7.8 7.8 0 1 0 9 9Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function AutoThemeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect
        x="4"
        y="5"
        width="16"
        height="12"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="M8 20h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M12 17v3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M12 8.2v5.6M9.2 11h5.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function PaceDialIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M13.4 2.8 6.9 12.2h4.3l-.6 9 6.5-9.4h-4.3Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

const ChatMessageBubble = memo(function ChatMessageBubble({
  expandedThinking,
  message,
  onToggleThinking
}: {
  expandedThinking: boolean;
  message: ChatMessage;
  onToggleThinking: (messageId: string) => void;
}) {
  const bubbleClassName =
    message.role === "user"
      ? "bubble bubble-user"
      : message.role === "assistant"
        ? "bubble bubble-ai"
        : "bubble bubble-support";
  const rowClassName =
    message.role === "user"
      ? "message-row message-row-user"
      : message.role === "assistant"
        ? "message-row message-row-ai"
        : "message-row message-row-support";

  return (
    <div className={rowClassName}>
      <article className={`${bubbleClassName}${message.animateIn ? " bubble-enter" : ""}`}>
        {message.role === "assistant" && message.isStreaming && !message.streamingDone ? (
          <>
            <div className="bubble-head bubble-head-time-only">
              <time>{formatDateTime(message.createdAt)}</time>
            </div>
            <div className="thinking-panel">
              <div className="bubble-thinking bubble-thinking-live" aria-label="咨询师思考中">
                <div className="thinking-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="thinking-inline-viewport">
                  <span className="thinking-inline" aria-live="polite">
                    {formatStreamingThinkingLine(message.thinking)}
                  </span>
                </div>
              </div>
            </div>
            {message.content ? <p>{message.content}</p> : null}
          </>
        ) : message.content ? (
          <>
            <div className="bubble-head bubble-head-time-only">
              <time>{formatDateTime(message.createdAt)}</time>
            </div>
            {message.role === "assistant" && message.rawThinking ? (
              <div className="thinking-panel">
                <button
                  aria-expanded={expandedThinking}
                  className="bubble-thinking bubble-thinking-history thinking-toggle"
                  onClick={() => onToggleThinking(message.id)}
                  type="button"
                >
                  <div className="thinking-copy">
                    <p className="thinking-label">查看咨询师思考记录</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`thinking-chevron${expandedThinking ? " is-open" : ""}`}
                  >
                    <ChevronDownIcon />
                  </span>
                </button>
                {expandedThinking ? (
                  <div className="thinking-transcript" aria-label="完整思考记录">
                    {message.rawThinking
                      .trim()
                      .split(/\n{2,}/)
                      .map((paragraph, index) => (
                        <p key={`${message.id}-thinking-${index}`}>
                          {paragraph.trim()}
                        </p>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <p>{message.content}</p>
          </>
        ) : (
          <div className="bubble-thinking" aria-label="咨询师思考中">
            <div className="thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="thinking-inline-viewport">
              <span className="thinking-inline">咨询师思考中</span>
            </div>
          </div>
        )}
      </article>
    </div>
  );
});

const MessageStreamView = memo(function MessageStreamView({
  expandedThinkingIds,
  messages,
  onScroll,
  onToggleThinking,
  streamRef
}: {
  expandedThinkingIds: string[];
  messages: ChatMessage[];
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onToggleThinking: (messageId: string) => void;
  streamRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="message-stream" ref={streamRef} onScroll={onScroll}>
      {messages.map((message) => (
        <ChatMessageBubble
          expandedThinking={expandedThinkingIds.includes(message.id)}
          key={message.id}
          message={message}
          onToggleThinking={onToggleThinking}
        />
      ))}
    </div>
  );
});

function SessionProgressCard({ progress }: { progress: SessionProgress }) {
  return (
    <div aria-label={`会谈进度 ${progress.percent}%`} className="session-progress-card">
      <div
        className={`session-progress-meta${
          progress.phase === "completed" ? " is-completed" : ""
        }`}
      >
        {progress.phase === "completed" ? (
          <>
            <strong>{progress.phaseLabel}</strong>
            <p>{progress.summary}</p>
          </>
        ) : (
          <div>
            <strong>{progress.phaseLabel}</strong>
            <p>{progress.summary}</p>
          </div>
        )}
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="session-progress-track"
        role="progressbar"
      >
        <span className="session-progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="session-progress-foot">
        <span className="session-progress-detail">{progress.detailLabel}</span>
        <span className="session-progress-percent">{progress.percent}%</span>
      </div>
    </div>
  );
}

export function AppDashboard({ user }: { user: User }) {
  const router = useRouter();
  const [draftTitle, setDraftTitle] = useState("第1次会谈");
  const [draftMode, setDraftMode] = useState<SessionMode>(DEFAULT_SESSION_MODE);
  const [autoSupervision, setAutoSupervision] = useState(true);
  const [messageInput, setMessageInput] = useState("");
  const [isComposerComposing, setIsComposerComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeSessionReminderOpen, setActiveSessionReminderOpen] = useState(false);
  const {
    sessions,
    setSessions,
    selectedSessionId,
    setSelectedSessionId,
    activeSession,
    setActiveSession,
    therapyJournal,
    supervisionJournal,
    supervisionRuns,
    loadSessionDetail,
    loadSessions,
    loadJournals
  } = useDashboardData({ setNotice });
  const {
    view,
    setView,
    sidebarOpen,
    setSidebarOpen,
    createPanelOpen,
    setCreatePanelOpen,
    sessionToComplete,
    setSessionToComplete,
    sessionToDelete,
    setSessionToDelete,
    portalReady,
    pacePanelOpen,
    setPacePanelOpen,
    mobileSessionBarCollapsed,
    setMobileSessionBarCollapsed,
    selectedSupervisionRunId,
    setSelectedSupervisionRunId,
    handleViewChange,
    moveCompleteModalToDeleteFlow: moveCompleteModalToDeleteFlowState
  } = useDashboardUiState(supervisionRuns);
  const { themePreference, cycleThemePreference, getThemeButtonLabel } =
    useAppTheme(THEME_STORAGE_KEY);
  const {
    headerSession,
    headerSessionIsActive,
    activeSessions,
    completedSessions,
    historySessions,
    supervisionSessionMap,
    activeCount,
    completedCount,
    selectedSupervisionRun,
    selectedSupervisionSession,
    lastMessageIsStreaming,
    activeSessionId,
    activeSessionPace,
    activeSessionPaceMeta,
    activeSessionProgress,
    sessionToCompleteProgress,
    sessionToCompleteNeedsMoreConversation
  } = getDashboardDerivedState({
    sessions,
    selectedSessionId,
    activeSession,
    supervisionRuns,
    selectedSupervisionRunId,
    sessionToComplete
  });
  const progressCard = activeSessionProgress ? (
    <SessionProgressCard progress={activeSessionProgress} />
  ) : null;
  const {
    streamRef,
    composerTextareaRef,
    composerRef,
    composerOverlayRef,
    progressCardRef,
    expandedThinkingIds,
    handleStreamScroll,
    toggleThinkingExpanded,
    ensureThinkingExpanded,
    flushAssistantStreamUpdate,
    scheduleAssistantStreamUpdate,
    handleComposerFocus,
    markShouldStickToBottom
  } = useDashboardChatUi({
    activeSessionId,
    activeSessionStatus: activeSession?.status,
    activeSessionProgressPercent: activeSessionProgress?.percent,
    busy,
    lastMessageContent: activeSession?.messages.at(-1)?.content,
    lastMessageThinking: activeSession?.messages.at(-1)?.thinking,
    lastMessageIsStreaming,
    messageInput,
    setActiveSession,
    setMobileSessionBarCollapsed,
    setPacePanelOpen,
    view
  });

  useEffect(() => {
    if (!createPanelOpen) {
      setDraftTitle(getNextSessionTitle(sessions));
    }
  }, [createPanelOpen, sessions]);

  useEffect(() => {
    if (notice === ACTIVE_SESSION_EXISTS_MESSAGE) {
      setActiveSessionReminderOpen(true);
      setNotice("");
    }
  }, [notice]);

  const {
    paceBusy,
    updateSessionPaceValue,
    createNewSession,
    sendMessage,
    completeCurrentSession,
    rerunSupervision,
    openSession,
    openSessionForSupervisionRun,
    deleteSession,
    logout
  } = useSessionActions({
    router,
    sessions,
    selectedSessionId,
    activeSession,
    supervisionRuns,
    busy,
    setBusy,
    setNotice,
    setSessions,
    setSelectedSessionId,
    setActiveSession,
    setView,
    setSidebarOpen,
    setCreatePanelOpen,
    setSessionToComplete,
    sessionToComplete,
    setSessionToDelete,
    sessionToDelete,
    draftTitle,
    draftMode,
    autoSupervision,
    messageInput,
    setMessageInput,
    scheduleAssistantStreamUpdate,
    ensureThinkingExpanded,
    flushAssistantStreamUpdate,
    markShouldStickToBottom,
    loadSessionDetail,
    loadSessions,
    loadJournals
  });

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const nativeEvent = event.nativeEvent;
    const isImeConfirming =
      isComposerComposing ||
      nativeEvent.isComposing ||
      nativeEvent.keyCode === 229;

    if (event.key !== "Enter" || event.shiftKey || isImeConfirming) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function moveCompleteModalToDeleteFlow() {
    moveCompleteModalToDeleteFlowState(busy);
  }

  function handleCreateSessionStart() {
    void createNewSession();
  }

  const sessionTabs: Array<{
    key: ViewMode;
    label: string;
    count?: number;
    icon: ReactNode;
  }> = [
    { key: "chat", label: "会谈", icon: <ChatIcon /> },
    { key: "history", label: "归档", count: completedCount, icon: <ArchiveIcon /> },
    { key: "therapy", label: "手帐", icon: <NoteIcon /> },
    { key: "supervision", label: "督导", count: supervisionRuns.length, icon: <SparkIcon /> }
  ];

  function renderThemeIcon() {
    if (themePreference === "light") {
      return <SunIcon />;
    }
    if (themePreference === "dark") {
      return <MoonIcon />;
    }
    return <AutoThemeIcon />;
  }

  const headerLeadingActions = (
    <div className="header-leading-actions">
      <IconButton className="ghost-button sidebar-toggle" label="打开侧边栏" onClick={() => setSidebarOpen(true)}>
        <MenuIcon />
      </IconButton>
      {view === "chat" ? (
        <div
          className={`pace-control${pacePanelOpen ? " is-open" : ""}`}
          data-pace-control-root="true"
        >
          <button
            aria-expanded={pacePanelOpen}
            aria-haspopup="dialog"
            aria-label={`对话速度，当前${activeSessionPaceMeta.label}`}
            className="signal-pill pace-icon-button"
            disabled={!headerSessionIsActive || !activeSession || paceBusy || busy}
            onClick={() => {
              if (!headerSessionIsActive || !activeSession) {
                return;
              }
              setPacePanelOpen((current) => !current);
            }}
            type="button"
          >
            <PaceDialIcon />
          </button>
          {pacePanelOpen && headerSessionIsActive && activeSession ? (
            <div className="pace-popover" role="dialog" aria-label="对话速度设置">
              <p className="pace-popover-title">对话速度</p>
              <div className="pace-popover-options" role="tablist" aria-label="选择对话速度">
                {SESSION_PACE_CATALOG.map((pace) => (
                  <button
                    aria-selected={activeSessionPace === pace.value}
                    className={
                      activeSessionPace === pace.value
                        ? "pace-popover-option is-active"
                        : "pace-popover-option"
                    }
                    disabled={paceBusy || busy}
                    key={pace.value}
                    onClick={() => {
                      void updateSessionPaceValue(pace.value);
                      setPacePanelOpen(false);
                    }}
                    role="tab"
                    type="button"
                  >
                    <strong>{pace.label}</strong>
                    <span>{pace.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <IconButton
        className="ghost-button theme-toggle-button"
        dataThemeMode={
          themePreference === "system" ? "A" : themePreference === "light" ? "日" : "夜"
        }
        label={getThemeButtonLabel()}
        onClick={cycleThemePreference}
      >
        {renderThemeIcon()}
      </IconButton>
    </div>
  );

  const headerGlobalActions = (
    <div className="header-global-actions">
      <button
        className="ghost-button top-create-button main-create-button"
        aria-label="新建会谈"
        onClick={() => setCreatePanelOpen(true)}
        type="button"
      >
        <PlusIcon />
      </button>
      {view === "chat" ? (
        <button
          className="ghost-button"
          disabled={!headerSessionIsActive || !headerSession || busy}
          onClick={() => {
            if (!headerSession) {
              return;
            }
            setSessionToComplete(headerSession);
          }}
          type="button"
        >
          结束
        </button>
      ) : null}
    </div>
  );

  return (
    <main className={view === "chat" ? "app-shell app-shell-chat-active" : "app-shell"}>
      <div className="app-grid app-grid-immersive">
        <aside className={sidebarOpen ? "studio-rail studio-rail-overlay is-open" : "studio-rail studio-rail-overlay"}>
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          <div className="studio-rail-panel">
            <div className="sidebar-topbar">
              <div className="sidebar-user">
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
              </div>
            </div>

            <div className="sidebar-scroll-area">
              <nav className="mode-switch" aria-label="workspace sections">
                {sessionTabs.map((item) => (
                  <button
                    aria-label={item.label}
                    aria-pressed={view === item.key}
                    className={view === item.key ? "mode-chip is-active" : "mode-chip"}
                    key={item.key}
                    onClick={() => handleViewChange(item.key)}
                    title={item.label}
                    type="button"
                  >
                    <span className="mode-chip-icon">{item.icon}</span>
                    <span className="mode-chip-copy">
                      <strong>{item.label}</strong>
                      {item.count !== undefined ? <small>{item.count}</small> : null}
                    </span>
                  </button>
                ))}
              </nav>

            </div>

            <div className="sidebar-footer">
              <button className="ghost-button" disabled={busy} onClick={logout} type="button">
                退出登录
              </button>
            </div>
          </div>
        </aside>

        <section className={sidebarOpen ? "experience-shell experience-shell-full sidebar-stage is-sidebar-open" : "experience-shell experience-shell-full sidebar-stage"}>
          {view === "chat" ? null : (
            <header className="immersion-header">
              <div className="header-utility-row header-utility-row-main">
                {headerLeadingActions}
                {headerGlobalActions}
              </div>
            </header>
          )}

          {notice ? (
            <div aria-live="polite" className="notice" role="status">
              <span className="notice-copy">{notice}</span>
              <button
                aria-label="关闭提示"
                className="notice-dismiss"
                onClick={() => setNotice("")}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}

          <div className={`view-stage view-stage-${view}`} key={view}>
            {view === "chat" ? (
              <div className="chat-stage-toolbar" aria-label="聊天快捷操作">
                {headerLeadingActions}
                {headerGlobalActions}
              </div>
            ) : null}
            {view === "chat" ? (
              <section className="immersion-layout immersion-layout-full">
                <section className="chat-stage">
                {activeSession ? (
                  <>
                    <div className="chat-stage-scroll-shell">
                      {progressCard ? (
                        <div className="chat-stage-progress-overlay" ref={progressCardRef}>
                          {progressCard}
                        </div>
                      ) : null}
                      <MessageStreamView
                        expandedThinkingIds={expandedThinkingIds}
                        messages={activeSession.messages}
                        onScroll={handleStreamScroll}
                        onToggleThinking={toggleThinkingExpanded}
                        streamRef={streamRef}
                      />
                      {activeSession.status === "active" ? (
                        <div className="chat-stage-composer-overlay" ref={composerOverlayRef}>
                          <form className="composer composer-stage" onSubmit={sendMessage} ref={composerRef}>
                            <div className="composer-input-shell">
                              <textarea
                                data-single-line={!messageInput.includes("\n") ? "true" : "false"}
                                ref={composerTextareaRef}
                                placeholder="说说你此刻最想被理解的一件事..."
                                rows={1}
                                value={messageInput}
                                onChange={(event) => setMessageInput(event.target.value)}
                                onCompositionStart={() => setIsComposerComposing(true)}
                                onCompositionEnd={() => setIsComposerComposing(false)}
                                onFocus={handleComposerFocus}
                                onClick={handleComposerFocus}
                                onKeyDown={handleComposerKeyDown}
                              />
                              <button
                                className="composer-submit"
                                aria-label={busy ? "正在回复" : "发送消息"}
                                disabled={busy || !messageInput.trim()}
                                type="submit"
                              >
                                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                                  <path
                                    d="M10 14.25V5.75M10 5.75L6.5 9.25M10 5.75L13.5 9.25"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.9"
                                  />
                                </svg>
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div className="chat-stage-composer-overlay" ref={composerOverlayRef}>
                          <div className="composer composer-locked">这段会谈已结束</div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-state empty-chat empty-chat-empty-session">点击右上角新建会谈</div>
                )}
                </section>
              </section>
            ) : null}

            {view === "history" ? (
              <section className="history-card">
              <div className="journal-header">
                <div>
                  <h3>会谈归档</h3>
                  <p className="muted">让每一次开口，都通往更懂自己的下一步。</p>
                </div>
                <span className="privacy-badge">
                  {activeCount > 0 ? `${activeCount} 段进行中 · ` : ""}
                  {completedCount} 段已完成
                </span>
              </div>

              <div className="table-list">
                {historySessions.length === 0 ? (
                  <div className="empty-state">还没有会谈记录。开始一次会谈后，这里会自动出现。</div>
                ) : (
                  historySessions.map((session) => (
                    <div className="table-row table-row-button history-row" key={session.id}>
                      <button
                        className="table-row-main history-row-main"
                        onClick={() => void openSession(session.id)}
                        type="button"
                      >
                        <div className="history-row-summary">
                          <strong>{session.title}</strong>
                          <p>{session.redactedSummary}</p>
                          {session.supervisionFailureReason ? (
                            <p className="history-row-warning">
                              自动督导失败：{session.supervisionFailureReason}
                            </p>
                          ) : null}
                        </div>
                        <span className="history-row-cell history-row-mode">{normalizeSessionMode(session.mode)}</span>
                        <span className="history-row-cell history-row-status">
                          {formatSessionStatusLabel(session.status)}
                        </span>
                        <span className="history-row-cell history-row-count">{session.messageCount} 条</span>
                        <span className="history-row-cell history-row-date">{formatDateOnly(session.updatedAt)}</span>
                      </button>
                      <div className="history-row-actions">
                        {session.status === "completed" && !session.supervisionId ? (
                          <button
                            className="ghost-button history-row-supervision"
                            disabled={busy}
                            onClick={() => void rerunSupervision(session)}
                            type="button"
                          >
                            督导
                          </button>
                        ) : null}
                        <button
                          className="ghost-button danger-button history-row-delete"
                          onClick={() => setSessionToDelete(session)}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              </section>
            ) : null}

            {view === "therapy" ? (
              <section className="journal-board">
                <div className="journal-card">
                  <div className="journal-header">
                    <div>
                      <h3>咨询手帐</h3>
                      <p>把散落的感受与线索，整理成能回看的自己。</p>
                    </div>
                  </div>
                  <JournalContent content={therapyJournal} />
                </div>

                <div className="journal-card">
                  <div className="journal-header">
                    <div>
                      <h3>督导手帐</h3>
                      <p>在更高一层的视角里，看见对话背后的方向。</p>
                    </div>
                  </div>
                  <JournalContent content={supervisionJournal} />
                </div>
              </section>
            ) : null}

            {view === "supervision" ? (
              <section className="supervision-records">
              {selectedSupervisionRun ? (
                <article className="journal-card supervision-detail-card">
                  <div className="journal-header supervision-detail-header">
                    <div>
                      <h3>{formatSupervisionTitle(selectedSupervisionSession?.title)}</h3>
                    </div>
                    <div className="supervision-detail-actions">
                      <button
                        className="ghost-button"
                        onClick={() => setSelectedSupervisionRunId(null)}
                        type="button"
                      >
                        返回列表
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => void openSessionForSupervisionRun(selectedSupervisionRun)}
                        type="button"
                      >
                        打开会谈
                      </button>
                    </div>
                  </div>

                  <div className="supervision-detail-meta">
                    <span className="privacy-badge">
                      {selectedSupervisionSession?.mode ?? "-"}
                    </span>
                    <span className="supervision-detail-meta-item">
                      完成于 {formatDateTime(selectedSupervisionRun.completedAt)}
                    </span>
                    <span className="supervision-detail-meta-item">
                      {selectedSupervisionRun.transcript.length} 段记录
                    </span>
                  </div>

                  <div className="supervision-detail-lead">
                    <strong>督导摘要</strong>
                    <p>{selectedSupervisionRun.redactedSummary}</p>
                  </div>

                  <div className="supervision-article">
                    {selectedSupervisionRun.transcript.map((item) => {
                      const blocks = parseSupervisionArticle(item.content);
                      return (
                        <section
                          className="supervision-article-section"
                          data-role={item.role}
                          key={item.id}
                        >
                          <div className="supervision-article-section-head">
                            <span className="supervision-role-badge">
                              {formatSupervisionRole(item.role)}
                            </span>
                            <time>{formatDateTime(item.createdAt)}</time>
                          </div>
                          <div className="supervision-article-body">
                            {blocks.map((block, index) =>
                              block.type === "labeled" ? (
                                <p className="supervision-article-paragraph" key={`${item.id}-${index}`}>
                                  <strong>{block.label}：</strong>
                                  <span>{block.content}</span>
                                </p>
                              ) : (
                                <p className="supervision-article-paragraph" key={`${item.id}-${index}`}>
                                  {block.content}
                                </p>
                              )
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </article>
              ) : (
                <div className="history-card supervision-card">
                  <div className="journal-header">
                    <div>
                      <h3>督导记录</h3>
                      <p>每一次复盘，都是下一次靠近自己的预演。</p>
                    </div>
                    <span className="privacy-badge">{supervisionRuns.length} 条</span>
                  </div>

                  <div className="table-list">
                  {supervisionRuns.length === 0 ? (
                    <div className="empty-state">
                      还没有督导记录。完成一次会谈后，这里会出现。
                    </div>
                  ) : (
                    supervisionRuns.map((run) => {
                      const matchedSession =
                        supervisionSessionMap.get(run.sessionId) ??
                        resolveSessionForSupervisionRun(sessions, run);

                      return (
                        <div className="table-row table-row-button history-row" key={run.id}>
                          <button
                            className="table-row-main history-row-main"
                            onClick={() => setSelectedSupervisionRunId(run.id)}
                            type="button"
                          >
                            <div className="history-row-summary">
                              <strong>{formatSupervisionTitle(matchedSession?.title)}</strong>
                              <p>{run.redactedSummary}</p>
                            </div>
                            <span className="history-row-cell history-row-mode">
                              {matchedSession?.mode ?? "-"}
                            </span>
                            <span className="history-row-cell history-row-status">completed</span>
                            <span className="history-row-cell history-row-count">{run.transcript.length} 轮</span>
                            <span className="history-row-cell history-row-date">
                              {formatDateOnly(run.completedAt)}
                            </span>
                          </button>
                          <div className="history-row-actions">
                            <button
                              className="ghost-button history-row-supervision"
                              onClick={() => setSelectedSupervisionRunId(run.id)}
                              type="button"
                            >
                              查看
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  </div>
                </div>
              )}
              </section>
            ) : null}
          </div>
        </section>
      </div>

      {portalReady && sessionToDelete
        ? createPortal(
            <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
              <div className="modal-backdrop" onClick={() => setSessionToDelete(null)} />
              <div className="modal-card">
                <span className="eyebrow">privacy check</span>
                <h3 id="delete-session-title">确认删除这段会谈？</h3>
                <p>
                  删除后，这段会谈、对应消息、关联督导记录，以及从它派生的手帐内容都会一并清理，无法恢复。
                </p>
                <div className="modal-session-brief">
                  <strong>{sessionToDelete.title}</strong>
                  <span>{normalizeSessionMode(sessionToDelete.mode)}</span>
                  <span>{sessionToDelete.messageCount} 条消息</span>
                </div>
                <div className="modal-actions">
                  <button className="ghost-button" disabled={busy} onClick={() => setSessionToDelete(null)} type="button">
                    取消
                  </button>
                  <button className="primary-button danger-solid-button" disabled={busy} onClick={deleteSession} type="button">
                    {busy ? "正在删除..." : "确认删除"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {portalReady && sessionToComplete
        ? createPortal(
            <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="complete-session-title">
              <div className="modal-backdrop" onClick={() => setSessionToComplete(null)} />
              <div className="modal-card">
                <span className="eyebrow">session close</span>
                <h3 id="complete-session-title">
                  {sessionToCompleteNeedsMoreConversation ? "这会儿结束，好像还有点早" : "确认结束这段会谈？"}
                </h3>
                <p>
                  {sessionToCompleteNeedsMoreConversation
                    ? `当前进度刚走到 ${sessionToCompleteProgress?.percent ?? 0}%，这段对话还在热身发力中。要不先回去再聊两句？它还没到适合体面谢幕的时候。`
                    : `结束后将停止继续发送消息。${
                        sessionToComplete.autoSupervision
                          ? "系统会自动启动一次督导复盘，请确认这是你想要的结束时点。"
                          : "当前这段会谈未开启自动督导。"
                      }`}
                </p>
                <div className="modal-session-brief">
                  <strong>{sessionToComplete.title}</strong>
                  <span>{normalizeSessionMode(sessionToComplete.mode)}</span>
                  <span>{sessionToComplete.messageCount} 条消息</span>
                </div>
                {sessionToCompleteNeedsMoreConversation ? (
                  <div className="modal-inline-alert">
                    <div className="modal-inline-alert-copy">
                      <strong>小提醒</strong>
                      <p>如果只是手滑点到结束，返回对话就好；如果这段会谈确定不留了，再用删除按钮把它轻轻送走。</p>
                    </div>
                  </div>
                ) : (
                  <div className="modal-inline-alert">
                    <div className="modal-inline-alert-copy">
                      <strong>如果这段会谈不需要保留</strong>
                      <p>可以直接删除。删除会清理消息、关联督导记录与派生手帐，且无法恢复。</p>
                    </div>
                    <IconButton
                      className="ghost-button danger-button modal-inline-delete-button"
                      label="删除这段会谈"
                      onClick={moveCompleteModalToDeleteFlow}
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
                )}
                <div className="modal-actions">
                  <button className="ghost-button" disabled={busy} onClick={() => setSessionToComplete(null)} type="button">
                    {sessionToCompleteNeedsMoreConversation ? "返回对话" : "继续会谈"}
                  </button>
                  {sessionToCompleteNeedsMoreConversation ? (
                    <button className="ghost-button danger-button" disabled={busy} onClick={moveCompleteModalToDeleteFlow} type="button">
                      删除
                    </button>
                  ) : (
                    <button className="primary-button" disabled={busy} onClick={completeCurrentSession} type="button">
                      {busy ? "正在结束..." : "确认结束"}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {portalReady && createPanelOpen
        ? createPortal(
            <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="create-session-title">
              <div className="modal-backdrop" onClick={() => setCreatePanelOpen(false)} />
              <div className="modal-card modal-card-compact modal-card-create-session">
                <div className="modal-card-header">
                  <h3 id="create-session-title">新建对话</h3>
                  <p>在安静而清晰的时空里，开始真正的对话。</p>
                </div>
                <div className="create-session-form">
                  <label className="create-session-field">
                    <span>标题</span>
                    <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="比如：第 1 次会谈" />
                  </label>

                  <label className="create-session-field">
                    <span>流派</span>
                    <div className="mode-selector-field">
                      <div className="mode-selector-shell" role="listbox" aria-label="选择会谈流派">
                        <div className="mode-selector-grid">
                          {SESSION_MODE_CATALOG.map((mode) => (
                            <button
                              aria-pressed={draftMode === mode.value}
                              className={draftMode === mode.value ? "mode-selector-option is-selected" : "mode-selector-option"}
                              key={mode.value}
                              onClick={() => setDraftMode(mode.value)}
                              type="button"
                            >
                              <strong className="mode-selector-option-label">{mode.shortLabel}</strong>
                              <span className="mode-selector-option-acronym">{mode.acronym}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
                <div className="modal-actions modal-actions-create-session">
                  <button className="ghost-button" disabled={busy} onClick={() => setCreatePanelOpen(false)} type="button">
                    取消
                  </button>
                  <button className="primary-button" disabled={busy} onClick={handleCreateSessionStart} type="button">
                    {busy ? "处理中..." : "开始"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {portalReady && activeSessionReminderOpen
        ? createPortal(
            <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="active-session-reminder-title">
              <div className="modal-backdrop" onClick={() => setActiveSessionReminderOpen(false)} />
              <div className="modal-card modal-card-compact modal-card-create-session">
                <div className="modal-card-header">
                  <h3 id="active-session-reminder-title">温馨提醒</h3>
                  <p>{ACTIVE_SESSION_EXISTS_MESSAGE}</p>
                </div>
                <div className="modal-actions modal-actions-create-session">
                  <button className="primary-button" onClick={() => setActiveSessionReminderOpen(false)} type="button">
                    我知道了
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </main>
  );
}
