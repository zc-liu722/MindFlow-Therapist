"use client";

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type UIEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { isStreamNearBottom } from "@/lib/app-dashboard-utils";
import type { AppSessionDetail as SessionDetail } from "@/lib/app-dashboard-types";

type UseDashboardChatUiOptions = {
  activeSessionId?: string;
  activeSessionStatus?: SessionDetail["status"];
  activeSessionProgressPercent?: number;
  busy: boolean;
  lastMessageContent?: string;
  lastMessageThinking?: string;
  lastMessageIsStreaming: boolean;
  messageInput: string;
  setActiveSession: Dispatch<SetStateAction<SessionDetail | null>>;
  setMobileSessionBarCollapsed: Dispatch<SetStateAction<boolean>>;
  setPacePanelOpen: Dispatch<SetStateAction<boolean>>;
  view: string;
};

export function useDashboardChatUi({
  activeSessionId,
  activeSessionStatus,
  activeSessionProgressPercent,
  busy,
  lastMessageContent,
  lastMessageThinking,
  lastMessageIsStreaming,
  messageInput,
  setActiveSession,
  setMobileSessionBarCollapsed,
  setPacePanelOpen,
  view
}: UseDashboardChatUiOptions) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastStreamScrollTopRef = useRef(0);
  const pendingAssistantStreamRef = useRef<{ content?: string; thinking?: string }>({});
  const assistantStreamFrameRef = useRef<number | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const composerOverlayRef = useRef<HTMLDivElement | null>(null);
  const progressCardRef = useRef<HTMLDivElement | null>(null);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<string[]>([]);

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

  const flushAssistantStreamUpdate = useCallback((messageId: string) => {
    assistantStreamFrameRef.current = null;
    const pendingUpdate = pendingAssistantStreamRef.current;

    if (!pendingUpdate.content && !pendingUpdate.thinking) {
      return;
    }

    pendingAssistantStreamRef.current = {};
    setActiveSession((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    content: pendingUpdate.content ?? message.content,
                    thinking: pendingUpdate.thinking ?? message.thinking ?? ""
                  }
                : message
            )
          }
        : current
    );
  }, [setActiveSession]);

  const scheduleAssistantStreamUpdate = useCallback(
    (messageId: string, partialUpdate: { content?: string; thinking?: string }) => {
      pendingAssistantStreamRef.current = {
        ...pendingAssistantStreamRef.current,
        ...partialUpdate
      };

      if (assistantStreamFrameRef.current !== null) {
        return;
      }

      assistantStreamFrameRef.current = window.requestAnimationFrame(() => {
        flushAssistantStreamUpdate(messageId);
      });
    },
    [flushAssistantStreamUpdate]
  );

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
  }, [activeSessionStatus, busy, syncComposerMetrics]);

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
  }, [activeSessionId, activeSessionProgressPercent, syncProgressMetrics]);

  useEffect(() => {
    if (typeof activeSessionProgressPercent === "number") {
      return;
    }

    document.documentElement.style.setProperty("--session-progress-height", "0px");
  }, [activeSessionProgressPercent]);

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
  }, [activeSessionId, activeSessionProgressPercent, syncProgressMetrics]);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frameId: number | null = null;

    const syncViewportInset = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncViewportMetrics();

        if (document.activeElement === composerTextareaRef.current && view === "chat") {
          shouldStickToBottomRef.current = true;
          revealComposer("auto");
        }
      });
    };

    syncViewportInset();
    window.addEventListener("resize", syncViewportInset);
    viewport?.addEventListener("resize", syncViewportInset);
    viewport?.addEventListener("scroll", syncViewportInset);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
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

    scrollChatToBottom(lastMessageIsStreaming ? "auto" : "smooth");
  }, [
    lastMessageContent,
    lastMessageThinking,
    lastMessageIsStreaming,
    scrollChatToBottom,
    view
  ]);

  useEffect(() => {
    if (view !== "chat") {
      return;
    }

    shouldStickToBottomRef.current = true;
    lastStreamScrollTopRef.current = 0;
    setMobileSessionBarCollapsed(false);
  }, [activeSessionId, setMobileSessionBarCollapsed, view]);

  useEffect(() => {
    if (document.activeElement !== composerTextareaRef.current || view !== "chat") {
      return;
    }

    shouldStickToBottomRef.current = true;
  }, [view]);

  useEffect(() => {
    return () => {
      if (assistantStreamFrameRef.current !== null) {
        window.cancelAnimationFrame(assistantStreamFrameRef.current);
      }
    };
  }, []);

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
  }, [setMobileSessionBarCollapsed, setPacePanelOpen]);

  const toggleThinkingExpanded = useCallback((messageId: string) => {
    setExpandedThinkingIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId]
    );
  }, []);

  const ensureThinkingExpanded = useCallback((messageId: string) => {
    setExpandedThinkingIds((current) =>
      current.includes(messageId) ? current : [...current, messageId]
    );
  }, []);

  function handleComposerFocus() {
    shouldStickToBottomRef.current = true;
    syncViewportMetrics();
    revealComposer("auto");
    window.setTimeout(() => {
      syncViewportMetrics();
      revealComposer("auto");
    }, 220);
  }

  function markShouldStickToBottom() {
    shouldStickToBottomRef.current = true;
  }

  return {
    streamRef: streamRef as RefObject<HTMLDivElement | null>,
    composerTextareaRef: composerTextareaRef as RefObject<HTMLTextAreaElement | null>,
    composerRef: composerRef as RefObject<HTMLFormElement | null>,
    composerOverlayRef: composerOverlayRef as RefObject<HTMLDivElement | null>,
    progressCardRef: progressCardRef as RefObject<HTMLDivElement | null>,
    expandedThinkingIds,
    handleStreamScroll,
    toggleThinkingExpanded,
    ensureThinkingExpanded,
    flushAssistantStreamUpdate,
    scheduleAssistantStreamUpdate,
    handleComposerFocus,
    markShouldStickToBottom
  };
}
