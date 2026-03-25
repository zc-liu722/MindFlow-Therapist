import type {
  AppChatMessage as ChatMessage,
  AppSessionRecord as SessionRecord,
  AppSupervisionRun as SupervisionRun
} from "@/lib/app-dashboard-types";

export type JournalBlock =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "list"; ordered: boolean; items: string[] };

export type SupervisionArticleBlock =
  | { type: "paragraph"; content: string }
  | { type: "labeled"; label: string; content: string };

export function formatSupervisionRole(role: ChatMessage["role"]) {
  if (role === "supervisor") {
    return "督导师";
  }
  if (role === "assistant") {
    return "咨询师";
  }
  if (role === "user") {
    return "来访者";
  }
  return "系统";
}

export function cleanMarkdownText(value: string) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s*/gm, "")
    .replace(/^\d+\.\s*/gm, "")
    .replace(/\r/g, "")
    .trim();
}

export function cleanInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .trim();
}

export function parseJournalBlocks(content: string): JournalBlock[] {
  const blocks: JournalBlock[] = [];
  const normalized = content.replace(/\r/g, "").trim();

  if (!normalized) {
    return blocks;
  }

  const lines = normalized.split("\n");
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      type: "paragraph",
      content: cleanInlineMarkdown(paragraphLines.join(" "))
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      type: "list",
      ordered: listOrdered,
      items: listItems.map((item) => cleanInlineMarkdown(item))
    });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: Math.min(3, headingMatch[1].length),
        content: cleanInlineMarkdown(headingMatch[2])
      });
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listItems.length > 0 && listOrdered) {
        flushList();
      }
      listOrdered = false;
      listItems.push(bulletMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listItems.length > 0 && !listOrdered) {
        flushList();
      }
      listOrdered = true;
      listItems.push(orderedMatch[1]);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    paragraphLines.push(quoteMatch ? quoteMatch[1] : line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

export function parseSupervisionArticle(content: string): SupervisionArticleBlock[] {
  return cleanMarkdownText(content)
    .split(/\n{2,}/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .map((block) => {
      const match = block.match(/^([^：:]{2,18})[：:]\s*(.+)$/);
      if (!match) {
        return { type: "paragraph" as const, content: block };
      }
      return {
        type: "labeled" as const,
        label: match[1].trim(),
        content: match[2].trim()
      };
    });
}

export function getNextSessionTitle(sessions: SessionRecord[]) {
  const highestIndex = sessions.reduce((max, session) => {
    const match = session.title.match(/^第(\d+)次会谈$/);
    if (!match) {
      return max;
    }
    return Math.max(max, Number(match[1]));
  }, 0);

  return `第${highestIndex + 1}次会谈`;
}

export function resolveSessionForSupervisionRun(
  sessions: SessionRecord[],
  run: Pick<SupervisionRun, "id" | "sessionId">
) {
  return (
    sessions.find((session) => session.id === run.sessionId) ??
    sessions.find((session) => session.supervisionId === run.id) ??
    null
  );
}

export function formatSupervisionTitle(sessionTitle?: string | null) {
  const normalized = sessionTitle?.trim();
  if (!normalized) {
    return "督导记录";
  }
  return `${normalized}督导`;
}

export function formatSessionStatusLabel(status: SessionRecord["status"]) {
  return status === "active" ? "进行中" : "已结束";
}

export function formatStreamingThinkingLine(thinking?: string) {
  const normalized = thinking?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "咨询师思考中";
  }
  return normalized;
}

export function isStreamNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}
