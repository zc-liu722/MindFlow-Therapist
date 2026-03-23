"use client";

import {
  type FormEvent,
  type KeyboardEvent,
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
  SESSION_MODE_OPTIONS,
  normalizeSessionMode,
  type SessionMode
} from "@/lib/session-modes";

type User = {
  id: string;
  displayName: string;
  username: string;
};

type SessionRecord = {
  id: string;
  title: string;
  mode: string;
  status: "active" | "completed";
  autoSupervision: boolean;
  updatedAt: string;
  createdAt: string;
  redactedSummary: string;
  messageCount: number;
  riskLevel: "low" | "medium" | "high";
  supervisionId?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "supervisor" | "system";
  content: string;
  createdAt: string;
  thinking?: string;
  streamTargetContent?: string;
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

const MODE_PICKER_ITEM_HEIGHT = 76;
const MODE_PICKER_VISIBLE_ROWS = 3;
const MODE_PICKER_SPACER_HEIGHT = (MODE_PICKER_ITEM_HEIGHT * (MODE_PICKER_VISIBLE_ROWS - 1)) / 2;
const MODE_PICKER_MAX_DISTANCE = 2.75;

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateOnly(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
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

function getModeWheelOptionStyle(index: number, scrollTop: number) {
  const virtualIndex = scrollTop / MODE_PICKER_ITEM_HEIGHT;
  const distance = index - virtualIndex;
  const absoluteDistance = Math.abs(distance);
  const limitedDistance = Math.min(absoluteDistance, MODE_PICKER_MAX_DISTANCE);
  const easedFocus = 1 - limitedDistance / MODE_PICKER_MAX_DISTANCE;
  const scale = 0.82 + easedFocus * 0.24;
  const translateY = distance * (10 + limitedDistance * 3.5);
  const rotateX = distance * -22;
  const opacity = 0.18 + easedFocus * 0.82;
  const blur = limitedDistance * 0.9;
  const saturate = 0.5 + easedFocus * 0.7;
  const brightness = 0.68 + easedFocus * 0.38;
  const zIndex = Math.round((MODE_PICKER_MAX_DISTANCE - limitedDistance) * 10);

  return {
    filter: `blur(${blur}px) saturate(${saturate}) brightness(${brightness})`,
    opacity: Math.max(opacity, 0.12),
    transform: `perspective(960px) translateY(${translateY}px) rotateX(${rotateX}deg) scale(${scale})`,
    zIndex
  };
}

function getTypingStep(targetLength: number, currentLength: number) {
  const remaining = targetLength - currentLength;
  if (remaining > 48) {
    return 4;
  }
  if (remaining > 20) {
    return 3;
  }
  if (remaining > 8) {
    return 2;
  }
  return 1;
}

function formatThinkingLine(thinking?: string) {
  return thinking?.trim() || "梳理你刚刚提到的重点";
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

export function AppDashboard({ user }: { user: User }) {
  const router = useRouter();
  const streamRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionRequestRef = useRef(0);
  const initialLoadRef = useRef(false);
  const modePickerRef = useRef<HTMLDivElement | null>(null);
  const modePickerTimeoutRef = useRef<number | null>(null);

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
  const [modePickerScrollTop, setModePickerScrollTop] = useState(0);
  const [modePickerScrolling, setModePickerScrolling] = useState(false);

  const activeSessionMeta =
    sessions.find((session) => session.id === selectedSessionId) ?? activeSession;
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const completedCount = completedSessions.length;
  const lastMessage = activeSession?.messages.at(-1);
  const activeSessionId = activeSession?.id;
  const activeSessionProgress = activeSession ? estimateSessionProgress(activeSession) : null;

  useEffect(() => {
    if (!createPanelOpen) {
      setDraftTitle(getNextSessionTitle(sessions));
    }
  }, [createPanelOpen, sessions]);

  useEffect(() => {
    if (!createPanelOpen || !modePickerRef.current) {
      return;
    }

    const selectedIndex = SESSION_MODE_OPTIONS.indexOf(draftMode);
    if (selectedIndex < 0) {
      return;
    }

    modePickerRef.current.scrollTo({
      top: selectedIndex * MODE_PICKER_ITEM_HEIGHT,
      behavior: "smooth"
    });
    setModePickerScrollTop(selectedIndex * MODE_PICKER_ITEM_HEIGHT);
  }, [createPanelOpen, draftMode]);

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
    const maxHeight =
      lineHeight * 5 +
      Number.parseFloat(computed.paddingTop || "0") +
      Number.parseFloat(computed.paddingBottom || "0");
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${Math.max(nextHeight, lineHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [messageInput, activeSessionId]);

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
    return () => {
      if (modePickerTimeoutRef.current) {
        window.clearTimeout(modePickerTimeoutRef.current);
      }
    };
  }, []);

  function snapModePicker(index: number, behavior: ScrollBehavior = "smooth") {
    const picker = modePickerRef.current;
    if (!picker) {
      return;
    }

    const nextTop = index * MODE_PICKER_ITEM_HEIGHT;
    setModePickerScrollTop(nextTop);
    picker.scrollTo({
      top: nextTop,
      behavior
    });
  }

  function selectModeByIndex(index: number, behavior: ScrollBehavior = "smooth") {
    const nextMode = SESSION_MODE_OPTIONS[Math.max(0, Math.min(index, SESSION_MODE_OPTIONS.length - 1))];
    if (!nextMode) {
      return;
    }

    setDraftMode(nextMode);
    snapModePicker(SESSION_MODE_OPTIONS.indexOf(nextMode), behavior);
  }

  function handleModePickerScroll() {
    const picker = modePickerRef.current;
    if (!picker) {
      return;
    }

    setModePickerScrollTop(picker.scrollTop);
    setModePickerScrolling(true);

    const nextIndex = Math.max(
      0,
      Math.min(
        Math.round(picker.scrollTop / MODE_PICKER_ITEM_HEIGHT),
        SESSION_MODE_OPTIONS.length - 1
      )
    );
    const nextMode = SESSION_MODE_OPTIONS[nextIndex];
    if (nextMode && nextMode !== draftMode) {
      setDraftMode(nextMode);
    }

    if (modePickerTimeoutRef.current) {
      window.clearTimeout(modePickerTimeoutRef.current);
    }

    modePickerTimeoutRef.current = window.setTimeout(() => {
      setModePickerScrolling(false);
      snapModePicker(nextIndex);
    }, 110);
  }

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
    const stream = streamRef.current;
    if (!stream || view !== "chat") {
      return;
    }

    stream.scrollTo({
      top: stream.scrollHeight,
      behavior: "smooth"
    });
  }, [activeSession?.messages.length, lastMessage?.content, lastMessage?.thinking, view]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSession((current) => {
        if (!current) {
          return current;
        }

        let changed = false;
        const messages = current.messages.map((message) => {
          if (!message.isStreaming) {
            return message;
          }

          const targetContent = message.streamTargetContent ?? message.content;
          if (message.content.length < targetContent.length) {
            const nextLength = Math.min(
              targetContent.length,
              message.content.length + getTypingStep(targetContent.length, message.content.length)
            );
            changed = true;
            return {
              ...message,
              content: targetContent.slice(0, nextLength)
            };
          }

          if (message.streamingDone) {
            changed = true;
            return {
              ...message,
              isStreaming: false,
              streamingDone: false,
              thinking: "",
              streamTargetContent: undefined
            };
          }

          return message;
        });

        return changed ? { ...current, messages } : current;
      });
    }, 18);

    return () => window.clearInterval(timer);
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
      streamTargetContent: "",
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
        headers: { "Content-Type": "application/json" },
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
          const payload = eventItem.payload as { thinking?: string };
          setActiveSession((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === temporaryAssistantMessage.id
                      ? {
                          ...message,
                          thinking: payload.thinking ?? message.thinking ?? ""
                        }
                      : message
                  )
                }
              : current
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
                          streamTargetContent: payload.content ?? message.streamTargetContent ?? "",
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
                    content: message.content,
                    streamTargetContent: assistantMessage.content,
                    isStreaming: true,
                    streamingDone: true
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
      const payload = (await response.json()) as {
        error?: string;
        supervisionCreated?: boolean;
        alreadyCompleted?: boolean;
      };

      if (!response.ok) {
        setNotice(payload.error ?? "结束失败");
        return;
      }

      setSessionToComplete(null);
      if (payload.alreadyCompleted) {
        setNotice("本次会谈已处于结束状态。");
      } else {
        setNotice(
          payload.supervisionCreated
            ? "本次会谈已结束，并已自动生成督导记录。"
            : "本次会谈已结束。"
        );
      }
      await loadSessions(targetSession.id);
      await loadJournals();
    } finally {
      setBusy(false);
    }
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
    { key: "chat", label: "会谈", count: sessions.length, icon: <ChatIcon /> },
    { key: "history", label: "归档", count: completedCount, icon: <ArchiveIcon /> },
    { key: "therapy", label: "笔记", icon: <NoteIcon /> },
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

  return (
    <main className="app-shell">
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

              <section className="rail-card rail-card-compact sidebar-sessions-card">
                <div className="list-card-header sidebar-card-header">
                  <h3>会谈</h3>
                  <span>{sessions.length}</span>
                </div>

                {sessions.length === 0 ? (
                  <div className="empty-state sidebar-empty-state">还没有会谈</div>
                ) : (
                  <div className="session-list sidebar-session-list">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className={session.id === selectedSessionId ? "session-item is-selected" : "session-item"}
                      >
                        <button className="session-main-button" onClick={() => void openSession(session.id)} type="button">
                          <div className="session-copy">
                            <strong>{session.title}</strong>
                            <div className="session-meta">
                              <span>{normalizeSessionMode(session.mode)}</span>
                              <span>{formatDateOnly(session.updatedAt)}</span>
                            </div>
                          </div>
                          <span className={`risk-dot risk-${session.riskLevel}`} aria-hidden="true" />
                        </button>
                        <IconButton
                          className="ghost-button danger-button session-delete-button"
                          label={`删除 ${session.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSessionToDelete(session);
                          }}
                        >
                          <TrashIcon />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="sidebar-footer">
              <button className="ghost-button" disabled={busy} onClick={logout} type="button">
                退出登录
              </button>
            </div>
          </div>
        </aside>

        <section className={sidebarOpen ? "experience-shell experience-shell-full sidebar-stage is-sidebar-open" : "experience-shell experience-shell-full sidebar-stage"}>
          <header className="immersion-header">
            <div className="header-utility-row header-utility-row-main">
              <IconButton className="ghost-button sidebar-toggle" label="打开侧边栏" onClick={() => setSidebarOpen(true)}>
                <MenuIcon />
              </IconButton>
              <div className="header-session-meta">
                {activeSession ? (
                  <>
                    <h1>{activeSession.title}</h1>
                    <div className="header-session-signals">
                      <span className="signal-pill session-mode-pill">{normalizeSessionMode(activeSession.mode)}</span>
                      <span className="signal-pill session-time-pill">{formatDateTime(activeSession.updatedAt)}</span>
                    </div>
                  </>
                ) : (
                  <h1>会谈</h1>
                )}
              </div>
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
              <button
                className="primary-button top-create-button main-create-button"
                aria-label="新建会谈"
                onClick={() => setCreatePanelOpen(true)}
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
          </header>

          {notice ? <div className="notice">{notice}</div> : null}

          <nav className="mobile-view-switch" aria-label="移动端视图切换">
            {sessionTabs.map((item) => (
              <button
                aria-label={item.label}
                aria-pressed={view === item.key}
                className={view === item.key ? "mobile-view-chip is-active" : "mobile-view-chip"}
                key={item.key}
                onClick={() => handleViewChange(item.key)}
                type="button"
              >
                <span className="mobile-view-chip-icon">{item.icon}</span>
                <span className="mobile-view-chip-label">{item.label}</span>
                {item.count !== undefined ? <span className="mobile-view-chip-count">{item.count}</span> : null}
              </button>
            ))}
          </nav>

          <div className={`view-stage view-stage-${view}`} key={view}>
            <div className="view-stage-ornaments" aria-hidden="true">
              <span className="view-orb view-orb-a" />
              <span className="view-orb view-orb-b" />
              <span className="view-orb view-orb-c" />
              <span className="view-streak view-streak-a" />
              <span className="view-streak view-streak-b" />
            </div>
            {view === "chat" ? (
              <section className="immersion-layout immersion-layout-full">
                <section className="chat-stage">
                {activeSession ? (
                  <>
                    <div className="chat-stage-head">
                      <div className="chat-stage-head-main">
                        {activeSessionProgress ? (
                          <div
                            aria-label={`会谈进度 ${activeSessionProgress.percent}%`}
                            className="session-progress-card"
                          >
                            <div className="session-progress-meta">
                              <div>
                                <strong>{activeSessionProgress.phaseLabel}</strong>
                                <p>{activeSessionProgress.summary}</p>
                              </div>
                              <span>{activeSessionProgress.milestoneLabel}</span>
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
                            <div className="session-progress-steps" aria-hidden="true">
                              <span className={activeSessionProgress.percent >= 1 ? "is-active" : ""}>开始</span>
                              <span className={activeSessionProgress.percent >= 24 ? "is-active" : ""}>展开</span>
                              <span className={activeSessionProgress.percent >= 60 ? "is-active" : ""}>整理</span>
                              <span className={activeSessionProgress.percent >= 86 ? "is-active" : ""}>收束</span>
                            </div>
                            <div className="session-progress-foot">
                              <span>{activeSessionProgress.percent}%</span>
                              <span>{activeSessionProgress.detailLabel}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="stage-actions">
                        {activeSession.status === "active" ? (
                          <button
                            className="primary-button"
                            disabled={busy}
                            onClick={() => setSessionToComplete(activeSessionMeta ?? activeSession)}
                            type="button"
                          >
                            结束
                          </button>
                        ) : (
                          <span className="pill">已归档</span>
                        )}
                        <IconButton
                          className="ghost-button danger-button"
                          label="删除会谈"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSessionToDelete(activeSessionMeta ?? activeSession);
                          }}
                        >
                          <TrashIcon />
                        </IconButton>
                      </div>
                    </div>

                    <div className="message-stream" ref={streamRef}>
                      {activeSession.messages.map((message) => (
                        <article
                          key={message.id}
                          className={
                            `${
                              message.role === "user"
                                ? "bubble bubble-user"
                                : message.role === "assistant"
                                  ? "bubble bubble-ai"
                                  : "bubble bubble-support"
                            }${message.animateIn ? " bubble-enter" : ""}`
                          }
                        >
                          {message.role === "assistant" && message.isStreaming ? (
                            <>
                              <div className="bubble-head bubble-head-time-only">
                                <time>{formatDateTime(message.createdAt)}</time>
                              </div>
                              {message.thinking ? (
                                <div className="bubble-thinking bubble-thinking-live" aria-label="咨询师思考过程" title={message.thinking}>
                                  <div className="thinking-dots" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                  </div>
                                  <p className="thinking-inline">{formatThinkingLine(message.thinking)}</p>
                                </div>
                              ) : null}
                              {message.content ? <p>{message.content}</p> : null}
                              {!message.thinking && !message.content ? (
                                <div className="bubble-thinking" aria-label="咨询师思考中">
                                  <div className="thinking-dots" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                  </div>
                                  <p className="thinking-inline">在梳理你刚刚提到的重点</p>
                                </div>
                              ) : null}
                            </>
                          ) : message.content ? (
                            <>
                              <div className="bubble-head bubble-head-time-only">
                                <time>{formatDateTime(message.createdAt)}</time>
                              </div>
                              <p>{message.content}</p>
                            </>
                          ) : (
                            <div className="bubble-thinking" aria-label="咨询师思考中">
                              <div className="thinking-dots" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </div>
                              <p className="thinking-inline">在梳理你刚刚提到的重点</p>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>

                    {activeSession.status === "active" ? (
                      <form className="composer composer-stage" onSubmit={sendMessage}>
                        <div className="composer-input-shell">
                          <textarea
                            ref={composerTextareaRef}
                            placeholder="输入消息..."
                            rows={1}
                            value={messageInput}
                            onChange={(event) => setMessageInput(event.target.value)}
                            onCompositionStart={() => setIsComposerComposing(true)}
                            onCompositionEnd={() => setIsComposerComposing(false)}
                            onKeyDown={handleComposerKeyDown}
                          />
                          <button className="primary-button composer-submit" disabled={busy} type="submit">
                            {busy ? "正在回复..." : "发送"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="composer composer-locked">这段会谈已结束</div>
                    )}
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
                    <div className="table-row table-row-button" key={session.id}>
                      <button className="table-row-main" onClick={() => void openSession(session.id)} type="button">
                        <div>
                          <strong>{session.title}</strong>
                          <p>{session.redactedSummary}</p>
                        </div>
                        <span>{normalizeSessionMode(session.mode)}</span>
                        <span>{session.status}</span>
                        <span>{session.messageCount} 条</span>
                        <span>{formatDateOnly(session.updatedAt)}</span>
                      </button>
                      <button
                        className="ghost-button danger-button"
                        onClick={() => setSessionToDelete(session)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  ))
                )}
              </div>
              </section>
            ) : null}

            {view === "therapy" ? (
              <section className="journal-card">
              <div className="journal-header">
                <div>
                  <h3>咨询师手帐</h3>
                  <p>把散落的感受与线索，整理成能回看的自己。</p>
                </div>
                <span className="privacy-badge">只读</span>
              </div>
              <pre>{therapyJournal}</pre>
              </section>
            ) : null}

            {view === "supervision" ? (
              <section className="supervision-layout">
              <div className="journal-card">
                <div className="journal-header">
                  <div>
                    <h3>督导手帐</h3>
                    <p>在更高一层的视角里，看见对话背后的方向。</p>
                  </div>
                  <span className="privacy-badge">自动生成</span>
                </div>
                <pre>{supervisionJournal}</pre>
              </div>

              <div className="runs-card">
                <div className="journal-header">
                  <div>
                    <h3>督导记录</h3>
                    <p>每一次复盘，都是下一次靠近自己的预演。</p>
                  </div>
                  <span className="privacy-badge">{supervisionRuns.length} 条</span>
                </div>

                {supervisionRuns.length === 0 ? (
                  <div className="empty-state">
                    还没有督导记录。完成一次会谈后，这里会出现。
                  </div>
                ) : (
                  supervisionRuns.map((run) => (
                    <article className="run-card" key={run.id}>
                      <header>
                        <div>
                          <strong>{run.redactedSummary}</strong>
                          <p>{formatDateTime(run.createdAt)}</p>
                        </div>
                        <span>{formatDateOnly(run.completedAt)}</span>
                      </header>
                      {run.transcript.map((item) => (
                        <div className="run-line" key={item.id}>
                          <span>{item.role === "supervisor" ? "督导师" : item.role === "assistant" ? "咨询师" : "来访者"}</span>
                          <p>{item.content}</p>
                        </div>
                      ))}
                    </article>
                  ))
                )}
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
                    <div className="mode-wheel-field">
                      <div className="mode-wheel-shell">
                        <div
                          aria-activedescendant={`session-mode-${SESSION_MODE_OPTIONS.indexOf(draftMode)}`}
                          aria-label="选择会谈流派"
                          className={modePickerScrolling ? "mode-wheel-picker is-scrolling" : "mode-wheel-picker"}
                          onScroll={handleModePickerScroll}
                          ref={modePickerRef}
                          role="listbox"
                          tabIndex={0}
                        >
                          <div
                            aria-hidden="true"
                            className="mode-wheel-spacer"
                            style={{ height: `${MODE_PICKER_SPACER_HEIGHT}px` }}
                          />
                          {SESSION_MODE_CATALOG.map((mode, index) => (
                            <button
                              aria-pressed={draftMode === mode.value}
                              className={draftMode === mode.value ? "mode-wheel-option is-selected" : "mode-wheel-option"}
                              id={`session-mode-${index}`}
                              key={mode.value}
                              onClick={() => selectModeByIndex(index)}
                              style={getModeWheelOptionStyle(index, modePickerScrollTop)}
                              type="button"
                            >
                              <strong className="mode-wheel-option-label">{mode.shortLabel}</strong>
                              <span className="mode-wheel-option-acronym">{mode.acronym}</span>
                            </button>
                          ))}
                          <div
                            aria-hidden="true"
                            className="mode-wheel-spacer"
                            style={{ height: `${MODE_PICKER_SPACER_HEIGHT}px` }}
                          />
                        </div>
                        <div aria-hidden="true" className="mode-wheel-highlight" />
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
