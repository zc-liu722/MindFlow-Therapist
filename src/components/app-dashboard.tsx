"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type UIEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { estimateSessionProgress } from "@/lib/session-progress";
import {
  DEFAULT_SESSION_MODE,
  SESSION_MODE_CATALOG,
  normalizeSessionMode,
  type SessionMode
} from "@/lib/session-modes";
import {
  DEFAULT_SESSION_PACE,
  SESSION_PACE_CATALOG,
  getSessionPaceMeta,
  normalizeSessionPace,
  type SessionPace
} from "@/lib/session-pace";

type User = {
  id: string;
  displayName: string;
  username: string;
};

type SessionRecord = {
  id: string;
  title: string;
  mode: string;
  pace: SessionPace;
  status: "active" | "completed";
  autoSupervision: boolean;
  updatedAt: string;
  createdAt: string;
  redactedSummary: string;
  messageCount: number;
  riskLevel: "low" | "medium" | "high";
  supervisionId?: string;
  supervisionFailureReason?: string;
  supervisionFailedAt?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "supervisor" | "system";
  content: string;
  createdAt: string;
  thinking?: string;
  rawThinking?: string;
  isStreaming?: boolean;
  streamingDone?: boolean;
  animateIn?: boolean;
};

type SessionDetail = SessionRecord & {
  messages: ChatMessage[];
};

type SupervisionRun = {
  id: string;
  sessionId: string;
  createdAt: string;
  completedAt: string;
  redactedSummary: string;
  transcript: ChatMessage[];
};

type ViewMode = "chat" | "history" | "therapy" | "supervision";
type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "mindflow-theme-preference";

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function formatDateOnly(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function getNextSessionTitle(sessions: SessionRecord[]) {
  const highestIndex = sessions.reduce((max, session) => {
    const match = session.title.match(/^第(\d+)次会谈$/);
    if (!match) {
      return max;
    }
    return Math.max(max, Number(match[1]));
  }, 0);

  return `第${highestIndex + 1}次会谈`;
}

function formatStreamingThinkingLine(thinking?: string) {
  const normalized = thinking?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "咨询师思考中";
  }
  return normalized;
}

function isStreamNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function parseSseChunk(chunk: string) {
  const events = chunk
    .split("\n\n")
    .map((part) => part.trim())
    .filter(Boolean);

  return events.flatMap((event) => {
    const lines = event.split("\n");
    const type = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!type || !data) {
      return [];
    }

    try {
      return [{ type, payload: JSON.parse(data) as unknown }];
    } catch {
      return [];
    }
  });
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

export function AppDashboard({ user }: { user: User }) {
  const router = useRouter();
  const streamRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastStreamScrollTopRef = useRef(0);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const composerOverlayRef = useRef<HTMLDivElement | null>(null);
  const progressCardRef = useRef<HTMLDivElement | null>(null);
  const sessionRequestRef = useRef(0);
  const initialLoadRef = useRef(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [therapyJournal, setTherapyJournal] = useState("加载中...");
  const [supervisionJournal, setSupervisionJournal] = useState("加载中...");
  const [supervisionRuns, setSupervisionRuns] = useState<SupervisionRun[]>([]);
  const [view, setView] = useState<ViewMode>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("第1次会谈");
  const [draftMode, setDraftMode] = useState<SessionMode>(DEFAULT_SESSION_MODE);
  const [autoSupervision, setAutoSupervision] = useState(true);
  const [messageInput, setMessageInput] = useState("");
  const [isComposerComposing, setIsComposerComposing] = useState(false);
  const [sessionToComplete, setSessionToComplete] = useState<SessionRecord | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<SessionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [portalReady, setPortalReady] = useState(false);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<string[]>([]);
  const [paceBusy, setPaceBusy] = useState(false);
  const [pacePanelOpen, setPacePanelOpen] = useState(false);
  const [mobileSessionBarCollapsed, setMobileSessionBarCollapsed] = useState(false);

  const activeSessionMeta =
    sessions.find((session) => session.id === selectedSessionId) ?? activeSession;
  const headerSession = activeSessionMeta ?? activeSession;
  const headerSessionIsActive = headerSession?.status === "active";
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const supervisionSessionMap = new Map(sessions.map((session) => [session.id, session]));
  const completedCount = completedSessions.length;
  const lastMessage = activeSession?.messages.at(-1);
  const activeSessionId = activeSession?.id;
  const activeSessionPace = normalizeSessionPace(activeSession?.pace ?? DEFAULT_SESSION_PACE);
  const activeSessionPaceMeta = getSessionPaceMeta(activeSessionPace);
  const activeSessionProgress = activeSession ? estimateSessionProgress(activeSession) : null;
  const progressCard = activeSessionProgress ? (
    <div
      aria-label={`会谈进度 ${activeSessionProgress.percent}%`}
      className="session-progress-card"
    >
      <div
        className={`session-progress-meta${
          activeSessionProgress.phase === "completed" ? " is-completed" : ""
        }`}
      >
        {activeSessionProgress.phase === "completed" ? (
          <>
            <strong>{activeSessionProgress.phaseLabel}</strong>
            <p>{activeSessionProgress.summary}</p>
          </>
        ) : (
          <div>
            <strong>{activeSessionProgress.phaseLabel}</strong>
            <p>{activeSessionProgress.summary}</p>
          </div>
        )}
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={activeSessionProgress.percent}
        className="session-progress-track"
        role="progressbar"
      >
        <span
          className="session-progress-fill"
          style={{ width: `${activeSessionProgress.percent}%` }}
        />
      </div>
      <div className="session-progress-foot">
        <span className="session-progress-detail">{activeSessionProgress.detailLabel}</span>
        <span className="session-progress-percent">{activeSessionProgress.percent}%</span>
      </div>
    </div>
  ) : null;

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    stream.scrollTo({
      top: stream.scrollHeight,
      behavior
    });
  }, []);

  const syncComposerMetrics = useCallback(() => {
    const root = document.documentElement;
    const composerHeight =
      composerOverlayRef.current?.offsetHeight ?? composerRef.current?.offsetHeight ?? 0;
    root.style.setProperty("--composer-height", `${composerHeight}px`);
  }, []);

  const syncViewportMetrics = useCallback(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const keyboardInset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;

    root.style.setProperty("--visual-viewport-height", `${viewportHeight}px`);
    root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
    syncComposerMetrics();
  }, [syncComposerMetrics]);

  const revealComposer = useCallback((behavior: ScrollBehavior = "smooth") => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }

    composer.scrollIntoView({
      block: "end",
      inline: "nearest",
      behavior
    });

    window.requestAnimationFrame(() => {
      scrollChatToBottom(behavior === "auto" ? "auto" : "smooth");
    });
  }, [scrollChatToBottom]);

  const syncProgressMetrics = useCallback(() => {
    const root = document.documentElement;
    const progressHeight = progressCardRef.current?.offsetHeight ?? 0;
    root.style.setProperty("--session-progress-height", `${progressHeight}px`);
  }, []);

  useEffect(() => {
    if (!createPanelOpen) {
      setDraftTitle(getNextSessionTitle(sessions));
    }
  }, [createPanelOpen, sessions]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
    const maxLines = Number.parseFloat(computed.getPropertyValue("--composer-max-lines")) || 4;
    const maxHeight =
      lineHeight * maxLines +
      Number.parseFloat(computed.paddingTop || "0") +
      Number.parseFloat(computed.paddingBottom || "0");
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${Math.max(nextHeight, lineHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    syncComposerMetrics();
  }, [messageInput, activeSessionId, syncComposerMetrics]);

  useEffect(() => {
    syncComposerMetrics();
  }, [activeSession?.status, busy, syncComposerMetrics]);

  useEffect(() => {
    const composer = composerOverlayRef.current ?? composerRef.current;
    if (!composer || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncComposerMetrics();
    });

    observer.observe(composer);
    return () => observer.disconnect();
  }, [syncComposerMetrics]);

  useEffect(() => {
    syncProgressMetrics();
  }, [activeSessionId, activeSessionProgress?.percent, syncProgressMetrics]);

  useEffect(() => {
    if (activeSessionProgress) {
      return;
    }

    document.documentElement.style.setProperty("--session-progress-height", "0px");
  }, [activeSessionProgress]);

  useEffect(() => {
    const progressCardNode = progressCardRef.current;
    if (!progressCardNode || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncProgressMetrics();
    });

    observer.observe(progressCardNode);
    return () => observer.disconnect();
  }, [activeSessionId, activeSessionProgress?.percent, syncProgressMetrics]);

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

  useEffect(() => {
    if (!pacePanelOpen) {
      return;
    }

    function handleWindowPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest("[data-pace-control-root]")) {
        return;
      }

      setPacePanelOpen(false);
    }

    window.addEventListener("pointerdown", handleWindowPointerDown);
    return () => window.removeEventListener("pointerdown", handleWindowPointerDown);
  }, [pacePanelOpen]);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const requestId = sessionRequestRef.current + 1;
    sessionRequestRef.current = requestId;

    const response = await fetch(`/api/sessions/${sessionId}`);
    if (!response.ok) {
      setNotice("会谈内容加载失败");
      return;
    }

    const payload = (await response.json()) as { session: SessionDetail };
    if (sessionRequestRef.current !== requestId) {
      return;
    }

    setSelectedSessionId(payload.session.id);
    setActiveSession(payload.session);
  }, []);

  const loadSessions = useCallback(async (selectedId?: string) => {
    const response = await fetch("/api/sessions");
    if (!response.ok) {
      setNotice("会谈列表加载失败");
      return;
    }

    const payload = (await response.json()) as { sessions: SessionRecord[] };
    setSessions(payload.sessions);

    const requestedId = selectedId ?? selectedSessionId;
    const nextId = payload.sessions.some((session) => session.id === requestedId)
      ? requestedId
      : payload.sessions[0]?.id;

    if (nextId) {
      await loadSessionDetail(nextId);
    } else {
      setSelectedSessionId(null);
      setActiveSession(null);
    }
  }, [loadSessionDetail, selectedSessionId]);

  const loadJournals = useCallback(async () => {
    const [therapyResponse, supervisionResponse] = await Promise.all([
      fetch("/api/journal/therapy"),
      fetch("/api/journal/supervision")
    ]);

    if (therapyResponse.ok) {
      const payload = (await therapyResponse.json()) as { content: string };
      setTherapyJournal(payload.content);
    } else {
      setTherapyJournal("暂无咨询师手帐。");
    }

    if (supervisionResponse.ok) {
      const payload = (await supervisionResponse.json()) as {
        content: string;
        runs: SupervisionRun[];
      };
      setSupervisionJournal(payload.content);
      setSupervisionRuns(payload.runs);
    } else {
      setSupervisionJournal("暂无督导手帐。");
      setSupervisionRuns([]);
    }
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }

    initialLoadRef.current = true;
    void loadSessions();
    void loadJournals();
  }, [loadJournals, loadSessions]);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const syncViewportInset = () => {
      syncViewportMetrics();

      if (
        document.activeElement === composerTextareaRef.current &&
        view === "chat"
      ) {
        shouldStickToBottomRef.current = true;
        revealComposer("auto");
      }
    };

    syncViewportInset();
    window.addEventListener("resize", syncViewportInset);
    viewport?.addEventListener("resize", syncViewportInset);
    viewport?.addEventListener("scroll", syncViewportInset);

    return () => {
      window.removeEventListener("resize", syncViewportInset);
      viewport?.removeEventListener("resize", syncViewportInset);
      viewport?.removeEventListener("scroll", syncViewportInset);
      root.style.setProperty("--keyboard-inset", "0px");
      root.style.setProperty("--visual-viewport-height", "100dvh");
    };
  }, [revealComposer, syncViewportMetrics, view]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || view !== "chat" || !shouldStickToBottomRef.current) {
      return;
    }

    scrollChatToBottom("smooth");
  }, [activeSession?.messages.length, lastMessage?.content, lastMessage?.thinking, scrollChatToBottom, view]);

  useEffect(() => {
    if (view !== "chat") {
      return;
    }

    shouldStickToBottomRef.current = true;
    lastStreamScrollTopRef.current = 0;
    setMobileSessionBarCollapsed(false);
  }, [activeSessionId, view]);

  useEffect(() => {
    if (document.activeElement !== composerTextareaRef.current || view !== "chat") {
      return;
    }

    shouldStickToBottomRef.current = true;
    scrollChatToBottom("auto");
  }, [messageInput, scrollChatToBottom, view]);

  const handleStreamScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const stream = event.currentTarget;
    const scrollTop = stream.scrollTop;
    const previousScrollTop = lastStreamScrollTopRef.current;

    shouldStickToBottomRef.current = isStreamNearBottom(stream);

    if (window.innerWidth <= 780) {
      const scrollingDown = scrollTop > previousScrollTop + 6;
      const nearTop = scrollTop < 24;

      if (nearTop) {
        setMobileSessionBarCollapsed(false);
      } else if (scrollingDown && scrollTop > 72) {
        setMobileSessionBarCollapsed(true);
        setPacePanelOpen(false);
      }
    }

    lastStreamScrollTopRef.current = scrollTop;
  }, []);

  const toggleThinkingExpanded = useCallback((messageId: string) => {
    setExpandedThinkingIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId]
    );
  }, []);

  async function createNewSession() {
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          mode: draftMode,
          autoSupervision
        })
      });

      const payload = (await response.json()) as { error?: string; session?: SessionRecord };
      if (!response.ok || !payload.session) {
        setNotice(payload.error ?? "创建失败");
        return;
      }

      setView("chat");
      setSidebarOpen(false);
      setCreatePanelOpen(false);
      await loadSessions(payload.session.id);
    } finally {
      setBusy(false);
    }
  }

  async function updateSessionPaceValue(nextPace: SessionPace) {
    if (!activeSession || paceBusy || normalizeSessionPace(activeSession.pace) === nextPace) {
      return;
    }

    const previousPace = normalizeSessionPace(activeSession.pace);

    setPaceBusy(true);
    setNotice("");
    setActiveSession((current) => (current ? { ...current, pace: nextPace } : current));
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSession.id ? { ...session, pace: nextPace } : session
      )
    );

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pace: nextPace })
      });
      const payload = (await response.json()) as { error?: string; session?: SessionDetail };

      if (!response.ok || !payload.session) {
        setActiveSession((current) => (current ? { ...current, pace: previousPace } : current));
        setSessions((current) =>
          current.map((session) =>
            session.id === activeSession.id ? { ...session, pace: previousPace } : session
          )
        );
        setNotice(payload.error ?? "速度更新失败");
        return;
      }

      setActiveSession(payload.session);
      setSessions((current) =>
        current.map((session) =>
          session.id === payload.session?.id
            ? {
                ...session,
                pace: payload.session.pace,
                updatedAt: payload.session.updatedAt,
                messageCount: payload.session.messageCount,
                riskLevel: payload.session.riskLevel,
                redactedSummary: payload.session.redactedSummary
              }
            : session
        )
      );
    } finally {
      setPaceBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSession || busy) {
      return;
    }

    const content = messageInput.trim();
    if (!content) {
      return;
    }

    const temporaryUserMessage: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const temporaryAssistantMessage: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      thinking: "",
      isStreaming: true,
      animateIn: true
    };
    const pendingUserMessage: ChatMessage = {
      ...temporaryUserMessage,
      animateIn: true
    };

    setBusy(true);
    setNotice("");
    setMessageInput("");
    shouldStickToBottomRef.current = true;
    setActiveSession((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, pendingUserMessage, temporaryAssistantMessage],
            messageCount: current.messageCount + 2,
            updatedAt: temporaryAssistantMessage.createdAt
          }
        : current
    );

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-page-language":
            document.documentElement.lang || navigator.language || "zh-CN"
        },
        body: JSON.stringify({ content })
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json()) as {
          error?: string;
          userMessage?: ChatMessage;
          assistantMessage?: ChatMessage;
        };
        setMessageInput(content);
        setActiveSession((current) =>
          current
            ? {
                ...current,
                messages: current.messages.filter(
                  (message) =>
                    message.id !== temporaryUserMessage.id && message.id !== temporaryAssistantMessage.id
                ),
                messageCount: Math.max(current.messageCount - 2, 0)
              }
            : current
        );
        setNotice(payload.error ?? "发送失败");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalUserMessage: ChatMessage | undefined;
      let finalAssistantMessage: ChatMessage | undefined;
      let streamFailed = false;
      let streamError = "发送失败";

      function applyStreamEvent(eventItem: { type: string; payload: unknown }) {
        if (eventItem.type === "thinking") {
          const payload = eventItem.payload as { summary?: string };
          setActiveSession((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === temporaryAssistantMessage.id
                      ? {
                          ...message,
                          thinking: payload.summary ?? message.thinking ?? ""
                        }
                      : message
                  )
                }
              : current
          );
          setExpandedThinkingIds((current) =>
            current.includes(temporaryAssistantMessage.id)
              ? current
              : [...current, temporaryAssistantMessage.id]
          );
          return;
        }

        if (eventItem.type === "reply") {
          const payload = eventItem.payload as { content?: string };
          setActiveSession((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === temporaryAssistantMessage.id
                      ? {
                          ...message,
                          content: payload.content ?? message.content,
                          thinking: message.thinking ?? ""
                        }
                      : message
                  )
                }
              : current
          );
          return;
        }

        if (eventItem.type === "done") {
          const payload = eventItem.payload as {
            userMessage?: ChatMessage;
            assistantMessage?: ChatMessage;
          };
          finalUserMessage = payload.userMessage;
          finalAssistantMessage = payload.assistantMessage;
          return;
        }

        if (eventItem.type === "error") {
          const payload = eventItem.payload as { error?: string };
          streamFailed = true;
          streamError = payload.error ?? "发送失败";
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const item of parts) {
          for (const eventItem of parseSseChunk(item)) {
            applyStreamEvent(eventItem);
          }
        }

        if (done) {
          if (buffer.trim()) {
            for (const eventItem of parseSseChunk(buffer)) {
              applyStreamEvent(eventItem);
            }
          }
          break;
        }
      }

      if (streamFailed || !finalUserMessage || !finalAssistantMessage) {
        setMessageInput(content);
        setActiveSession((current) =>
          current
            ? {
                ...current,
                messages: current.messages.filter(
                  (message) =>
                    message.id !== temporaryUserMessage.id && message.id !== temporaryAssistantMessage.id
                ),
                messageCount: Math.max(current.messageCount - 2, 0)
              }
            : current
        );
        setNotice(streamError);
        return;
      }

      const userMessage = finalUserMessage;
      const assistantMessage = finalAssistantMessage;
      setActiveSession((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) => {
                if (message.id === temporaryUserMessage.id) {
                  return { ...userMessage, animateIn: message.animateIn };
                }
                if (message.id === temporaryAssistantMessage.id) {
                  return {
                    ...assistantMessage,
                    animateIn: message.animateIn,
                    content: assistantMessage.content || message.content,
                    thinking: assistantMessage.thinking ?? message.thinking,
                    rawThinking: assistantMessage.rawThinking,
                    isStreaming: false,
                    streamingDone: false
                  };
                }
                return message;
              }),
              updatedAt: assistantMessage.createdAt
            }
          : current
      );
      const sessionsResponse = await fetch("/api/sessions");
      if (sessionsResponse.ok) {
        const payload = (await sessionsResponse.json()) as { sessions: SessionRecord[] };
        setSessions(payload.sessions);
      }
    } catch {
      setMessageInput(content);
      setActiveSession((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (message) =>
                  message.id !== temporaryUserMessage.id && message.id !== temporaryAssistantMessage.id
              ),
              messageCount: Math.max(current.messageCount - 2, 0)
            }
          : current
      );
      setNotice("发送失败");
    } finally {
      setBusy(false);
    }
  }

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

  function handleComposerFocus() {
    shouldStickToBottomRef.current = true;
    syncViewportMetrics();
    revealComposer("auto");
    window.setTimeout(() => {
      syncViewportMetrics();
      revealComposer("auto");
    }, 220);
  }

  async function completeCurrentSession() {
    if (!sessionToComplete || busy) {
      return;
    }

    const targetSession = sessionToComplete;
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/sessions/${targetSession.id}/complete`, {
        method: "POST"
      });
      const raw = await response.text();
      const payload = raw
        ? (JSON.parse(raw) as {
            error?: string;
            supervisionCreated?: boolean;
            supervisionFailed?: boolean;
            alreadyCompleted?: boolean;
          })
        : {};

      if (!response.ok) {
        if (payload.error === "SESSION_COMPLETING") {
          setNotice("这段会谈正在收尾处理中，请稍等片刻后刷新查看状态。");
        } else if (payload.error === "NOT_FOUND") {
          setNotice("这段会谈不存在，可能已经被删除。");
        } else {
          setNotice(payload.error ?? "结束失败");
        }
        return;
      }

      setSessionToComplete(null);
      if (payload.alreadyCompleted) {
        setNotice("本次会谈已处于结束状态。");
      } else {
        setNotice(
          payload.supervisionCreated
            ? "本次会谈已结束，并已自动生成督导记录。"
            : payload.supervisionFailed
              ? "本次会谈已结束，但自动督导暂未生成成功。"
              : "本次会谈已结束。"
        );
      }
      await loadSessions(targetSession.id);
      await loadJournals();
    } catch {
      setNotice("结束会谈时出现异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function rerunSupervision(session: SessionRecord) {
    if (busy) {
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/sessions/${session.id}/supervision`, {
        method: "POST"
      });
      const raw = await response.text();
      const payload = raw
        ? (JSON.parse(raw) as {
            error?: string;
            supervisionCreated?: boolean;
            alreadyCreated?: boolean;
          })
        : {};

      if (!response.ok) {
        if (payload.error === "SESSION_NOT_COMPLETED") {
          setNotice("这段会谈尚未结束，暂时不能补做督导。");
        } else if (payload.error === "NOT_FOUND") {
          setNotice("这段会谈不存在，可能已经被删除。");
        } else {
          setNotice(payload.error ?? "手动督导失败");
        }
        return;
      }

      setNotice(
        payload.alreadyCreated
          ? "这段会谈已有督导记录。"
          : payload.supervisionCreated
            ? "已为这段归档补做督导。"
            : "已发起手动督导。"
      );
      await loadSessions(session.id);
      await loadJournals();
    } catch {
      setNotice("手动督导时出现异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  function moveCompleteModalToDeleteFlow() {
    if (!sessionToComplete || busy) {
      return;
    }

    setSessionToDelete(sessionToComplete);
    setSessionToComplete(null);
  }

  async function openSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setView("chat");
    setSidebarOpen(false);
    await loadSessionDetail(sessionId);
  }

  function handleViewChange(nextView: ViewMode) {
    setView(nextView);
    setSidebarOpen(false);
  }

  async function deleteSession() {
    if (!sessionToDelete || busy) {
      return;
    }

    const targetSession = sessionToDelete;
    const remainingSessions = sessions.filter((session) => session.id !== targetSession.id);
    const fallbackSessionId =
      selectedSessionId === targetSession.id
        ? remainingSessions[0]?.id ?? null
        : selectedSessionId;

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(targetSession.id)}`, {
        method: "DELETE"
      });
      const raw = await response.text();
      const payload = raw ? (JSON.parse(raw) as { error?: string }) : {};

      if (!response.ok) {
        setNotice(payload.error ?? "删除失败");
        return;
      }

      setSessionToDelete(null);
      setSessions(remainingSessions);
      setSelectedSessionId(fallbackSessionId);
      if (!fallbackSessionId) {
        setActiveSession(null);
      }
      setNotice("会谈已删除，对应记录与派生督导内容已同步清理。");
      await loadSessions(fallbackSessionId ?? undefined);
      await loadJournals();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
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
        onClick={() => setThemePreference(nextThemePreference[themePreference])}
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
      <div className="app-aurora app-aurora-left" />
      <div className="app-aurora app-aurora-right" />
      <div className="app-light-trail app-light-trail-left" />
      <div className="app-light-trail app-light-trail-right" />
      <div className="app-pulse-grid" />
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
            <div className="view-stage-ornaments" aria-hidden="true">
              <span className="view-orb view-orb-a" />
              <span className="view-orb view-orb-b" />
              <span className="view-orb view-orb-c" />
              <span className="view-streak view-streak-a" />
              <span className="view-streak view-streak-b" />
            </div>
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
                      <div className="message-stream" ref={streamRef} onScroll={handleStreamScroll}>
                        {activeSession.messages.map((message) => {
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
                            <div className={rowClassName} key={message.id}>
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
                                          aria-expanded={expandedThinkingIds.includes(message.id)}
                                          className="bubble-thinking bubble-thinking-history thinking-toggle"
                                          onClick={() => toggleThinkingExpanded(message.id)}
                                          type="button"
                                        >
                                          <div className="thinking-copy">
                                            <p className="thinking-label">查看咨询师思考记录</p>
                                          </div>
                                          <span
                                            aria-hidden="true"
                                            className={`thinking-chevron${
                                              expandedThinkingIds.includes(message.id) ? " is-open" : ""
                                            }`}
                                          >
                                            <ChevronDownIcon />
                                          </span>
                                        </button>
                                        {expandedThinkingIds.includes(message.id) ? (
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
                        })}
                      </div>
                      {activeSession.status === "active" ? (
                        <div className="chat-stage-composer-overlay" ref={composerOverlayRef}>
                          <form className="composer composer-stage" onSubmit={sendMessage} ref={composerRef}>
                            <div className="composer-input-shell">
                              <textarea
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
                              <button className="primary-button composer-submit" disabled={busy} type="submit">
                                {busy ? "正在回复..." : "发送"}
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
                <span className="privacy-badge">{completedCount} 段已完成</span>
              </div>

              <div className="table-list">
                {completedSessions.length === 0 ? (
                  <div className="empty-state">还没有归档内容。开始一次会谈后，这里会自动出现。</div>
                ) : (
                  completedSessions.map((session) => (
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
                        <span className="history-row-cell history-row-status">{session.status}</span>
                        <span className="history-row-cell history-row-count">{session.messageCount} 条</span>
                        <span className="history-row-cell history-row-date">{formatDateOnly(session.updatedAt)}</span>
                      </button>
                      <div className="history-row-actions">
                        {!session.supervisionId ? (
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
                  <pre>{therapyJournal}</pre>
                </div>

                <div className="journal-card">
                  <div className="journal-header">
                    <div>
                      <h3>督导手帐</h3>
                      <p>在更高一层的视角里，看见对话背后的方向。</p>
                    </div>
                  </div>
                  <pre>{supervisionJournal}</pre>
                </div>
              </section>
            ) : null}

            {view === "supervision" ? (
              <section className="supervision-records">
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
                  supervisionRuns.map((run) => (
                    <div className="table-row table-row-button history-row" key={run.id}>
                      <button
                        className="table-row-main history-row-main"
                        onClick={() => void openSession(run.sessionId)}
                        type="button"
                      >
                        <div className="history-row-summary">
                          <strong>
                            {supervisionSessionMap.get(run.sessionId)?.title ?? "督导记录"}
                          </strong>
                          <p>{run.redactedSummary}</p>
                        </div>
                        <span className="history-row-cell history-row-mode">
                          {supervisionSessionMap.get(run.sessionId)?.mode ?? "-"}
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
                          onClick={() => void openSession(run.sessionId)}
                          type="button"
                        >
                          查看
                        </button>
                      </div>
                    </div>
                  ))
                )}
                </div>
              </div>
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
                <h3 id="complete-session-title">确认结束这段会谈？</h3>
                <p>
                  结束后将停止继续发送消息。
                  {sessionToComplete.autoSupervision
                    ? "系统会自动启动一次督导复盘，请确认这是你想要的结束时点。"
                    : "当前这段会谈未开启自动督导。"}
                </p>
                <div className="modal-session-brief">
                  <strong>{sessionToComplete.title}</strong>
                  <span>{normalizeSessionMode(sessionToComplete.mode)}</span>
                  <span>{sessionToComplete.messageCount} 条消息</span>
                </div>
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
                <div className="modal-actions">
                  <button className="ghost-button" disabled={busy} onClick={() => setSessionToComplete(null)} type="button">
                    继续会谈
                  </button>
                  <button className="primary-button" disabled={busy} onClick={completeCurrentSession} type="button">
                    {busy ? "正在结束..." : "确认结束"}
                  </button>
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
                  <button className="primary-button" disabled={busy} onClick={createNewSession} type="button">
                    {busy ? "处理中..." : "开始"}
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
