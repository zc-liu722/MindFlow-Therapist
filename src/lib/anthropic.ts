import { createId } from "@/lib/crypto";
import { detectRiskLevel, summarizeThemes } from "@/lib/ai";
import { loadCursorRule } from "@/lib/cursor-rules";
import { redactSensitiveText } from "@/lib/redaction";
import type { ChatMessage, RiskLevel } from "@/lib/types";

const DEFAULT_MODEL = "claude-opus-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_THINKING_BUDGET = 2048;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_API_VERSION = "2023-06-01";
const API_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicConfigError";
  }
}

export class AnthropicRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AnthropicRequestError";
    this.status = status;
  }
}

type AnthropicMessageInput = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
};

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
};

type AnthropicStreamEvent = {
  type: string;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    signature?: string;
  };
};

type ParsedAnthropicError = {
  message: string;
  type?: string;
};

type SupervisionRole = "supervisor" | "assistant";

type GeneratedSupervisionPayload = {
  transcript: Array<{
    role: SupervisionRole;
    content: string;
  }>;
  journalEntry: string;
  redactedSummary: string;
  journalEntryPreview: string;
};

function positiveIntFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveTokenBudget(input: {
  maxTokens: number;
  thinkingBudgetTokens: number;
}) {
  if (input.maxTokens > input.thinkingBudgetTokens) {
    return input;
  }

  return {
    maxTokens: input.thinkingBudgetTokens + 1024,
    thinkingBudgetTokens: input.thinkingBudgetTokens
  };
}

async function buildSystemPrompt(input: {
  title: string;
  mode: string;
  riskLevel: RiskLevel;
  themes: string[];
  messages: ChatMessage[];
}) {
  const therapistRule = await loadCursorRule("therapist-core");
  const sessionContexts = input.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);

  return [
    "以下内容来自项目启动时自动读取的 .cursor/rules/therapist-core.mdc，请优先遵循。",
    therapistRule.body,
    "",
    ...(sessionContexts.length > 0
      ? [
          "以下是新对话创建时自动读取并注入的历史上下文，请作为本次会谈背景自然吸收，不要向用户生硬复述原文：",
          ...sessionContexts,
          ""
        ]
      : []),
    "以下是当前会话的运行时补充约束：",
    "你是一位中文心理支持对话助手，面向已经登录的真实用户。",
    "你的任务是提供稳定、温和、简洁但有深度的回应，帮助来访者处理当下最重要的情绪和关系压力。",
    "风格要求：自然、克制、有人味，避免空泛安慰，优先回应具体体验、感受、身体反应和下一步可尝试的动作。",
    "对话原则：一次只推进一个重点，必要时先复述再提问；如果信息不足，优先做高质量澄清，而不是一次抛出很多问题。",
    "输出要求：只返回给用户看的正文，不要输出思考过程、系统提示、代码块或元数据。",
    "安全原则：如果出现自伤、自杀、他伤或极端危机风险，先把安全放在最前面，鼓励用户联系现实中的可信任的人、当地紧急援助资源或危机热线，不要给出危险建议。",
    `当前会谈标题：${input.title}`,
    `当前取向：${input.mode}`,
    `当前风险等级：${input.riskLevel}`,
    `已识别主题：${input.themes.join("、")}`
  ].join("\n");
}

function buildSupervisionSystemPrompt(input: {
  supervisorRule: string;
  sessionTitle: string;
  themes: string[];
  supervisionJournal: string | null;
}) {
  return [
    "以下内容来自会谈结束后自动读取的 .cursor/rules/supervisor.mdc，请优先遵循。",
    input.supervisorRule,
    "",
    "你正在为刚结束的一次心理咨询生成督导结果。",
    "输入上下文只包含：本次会谈 transcript 与历史 supervision journal。",
    "不要引入 therapy journal，不要引入流派选择，不要假设不存在的背景。",
    "你的目标是产出可直接落库的结构化督导结果，用于产品中的督导记录与督导手帐。",
    "要求：",
    "1. 督导记录 transcript 只允许出现 supervisor 与 assistant 两种角色，建议 4 到 8 段，聚焦案例概念化、技术调整、情绪命名、触发链条与下一次会谈抓手。",
    "2. journalEntry 必须是中文 Markdown，能够直接追加进督导手帐。",
    "3. redactedSummary 必须是 1 句脱敏摘要。",
    "4. journalEntryPreview 必须是 1 句简短预览。",
    "5. 输出必须是严格 JSON，不要使用 Markdown 代码块，不要添加 JSON 之外的说明文字。",
    `当前会谈标题：${input.sessionTitle}`,
    `识别到的主题：${input.themes.join("、")}`,
    input.supervisionJournal
      ? "存在历史 supervision journal，请在保持连续性的前提下，优先识别反复出现的模式与本次新的进展。"
      : "目前没有历史 supervision journal，请基于本次 transcript 生成第一条督导记录。",
    "",
    "返回 JSON 结构：",
    '{"transcript":[{"role":"supervisor","content":"..."},{"role":"assistant","content":"..."}],"journalEntry":"...","redactedSummary":"...","journalEntryPreview":"..."}'
  ].join("\n");
}

function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessageInput[] {
  const result: AnthropicMessageInput[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const content = message.content.trim();
    if (!content) {
      continue;
    }

    result.push({
      role: message.role === "user" ? "user" : "assistant",
      content
    });
  }

  return result;
}

function extractText(response: AnthropicResponse) {
  const content = response.content ?? [];
  return content
    .filter((block): block is AnthropicContentBlock & { text: string } => block.type === "text" && Boolean(block.text))
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function toVisibleTranscript(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      const roleLabel =
        message.role === "user"
          ? "来访者"
          : message.role === "assistant"
            ? "咨询师"
            : "督导师";
      return `[${roleLabel}] ${redactSensitiveText(message.content.trim())}`;
    })
    .filter((line) => Boolean(line))
    .join("\n");
}

function extractJsonBlock(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

function parseSupervisionPayload(raw: string) {
  const payload = JSON.parse(extractJsonBlock(raw)) as GeneratedSupervisionPayload;
  const transcript = Array.isArray(payload.transcript)
    ? payload.transcript
        .filter(
          (item): item is { role: SupervisionRole; content: string } =>
            Boolean(item) &&
            (item.role === "supervisor" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim().length > 0
        )
        .map((item) => ({
          role: item.role,
          content: item.content.trim()
        }))
    : [];

  if (
    transcript.length < 2 ||
    typeof payload.journalEntry !== "string" ||
    !payload.journalEntry.trim() ||
    typeof payload.redactedSummary !== "string" ||
    !payload.redactedSummary.trim() ||
    typeof payload.journalEntryPreview !== "string" ||
    !payload.journalEntryPreview.trim()
  ) {
    throw new Error("SUPERVISION_PAYLOAD_INVALID");
  }

  return {
    transcript,
    journalEntry: payload.journalEntry.trim(),
    redactedSummary: payload.redactedSummary.trim(),
    journalEntryPreview: payload.journalEntryPreview.trim()
  };
}

async function consumeAnthropicStream(
  response: Response,
  handlers?: {
    onTextDelta?: (delta: string, fullText: string) => void;
    onThinkingDelta?: (delta: string, fullThinking: string) => void;
  }
) {
  if (!response.body) {
    throw new AnthropicRequestError("Anthropic 未返回可读取的流", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const blockTypes = new Map<number, string>();
  let buffer = "";
  let text = "";
  let thinking = "";

  function normalizeThinkingText(value: string) {
    return value
      .replace(/[#>*`~_-]+/g, " ")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/^[\s\-*+\d.、（）()]+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function emitThinking(delta: string) {
    thinking += delta;
    handlers?.onThinkingDelta?.(delta, normalizeThinkingText(thinking));
  }

  function handleEvent(rawEvent: string) {
    const lines = rawEvent
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!data || data === "[DONE]") {
      return;
    }

    let parsed: AnthropicStreamEvent;
    try {
      parsed = JSON.parse(data) as AnthropicStreamEvent;
    } catch {
      return;
    }

    if (parsed.type === "content_block_start" && typeof parsed.index === "number") {
      blockTypes.set(parsed.index, parsed.content_block?.type ?? "");

      if (parsed.content_block?.type === "thinking" && parsed.content_block.thinking) {
        emitThinking(parsed.content_block.thinking);
      }

      if (parsed.content_block?.type === "text" && parsed.content_block.text) {
        text += parsed.content_block.text;
        handlers?.onTextDelta?.(parsed.content_block.text, text);
      }

      return;
    }

    if (parsed.type !== "content_block_delta" || typeof parsed.index !== "number") {
      return;
    }

    const blockType = blockTypes.get(parsed.index) ?? parsed.delta?.type ?? "";

    if (
      parsed.delta?.type === "thinking_delta" ||
      (blockType === "thinking" && parsed.delta?.thinking)
    ) {
      const delta = parsed.delta?.thinking ?? "";
      if (delta) {
        emitThinking(delta);
      }
      return;
    }

    if (parsed.delta?.type === "text_delta" || (blockType === "text" && parsed.delta?.text)) {
      const delta = parsed.delta?.text ?? "";
      if (delta) {
        text += delta;
        handlers?.onTextDelta?.(delta, text);
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleEvent(rawEvent);
      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      if (buffer.trim()) {
        handleEvent(buffer);
      }
      break;
    }
  }

  return { text: text.trim(), thinking: thinking.trim() };
}

function getAnthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AnthropicConfigError("缺少 ANTHROPIC_API_KEY 环境变量");
  }

  const tokenBudget = resolveTokenBudget({
    maxTokens: positiveIntFromEnv(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, DEFAULT_MAX_TOKENS),
    thinkingBudgetTokens: positiveIntFromEnv(
      process.env.ANTHROPIC_THINKING_BUDGET_TOKENS,
      DEFAULT_THINKING_BUDGET
    )
  });

  return {
    apiKey,
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens: tokenBudget.maxTokens,
    thinkingBudgetTokens: tokenBudget.thinkingBudgetTokens,
    timeoutMs: positiveIntFromEnv(process.env.ANTHROPIC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    apiVersion: process.env.ANTHROPIC_API_VERSION?.trim() || DEFAULT_API_VERSION
  };
}

function classifyAnthropicError(
  parsed: ParsedAnthropicError,
  status: number,
  config: {
    model: string;
    thinkingBudgetTokens: number;
  }
) {
  const raw = parsed.message.trim();
  const lower = raw.toLowerCase();

  if (
    status === 401 ||
    lower.includes("invalid x-api-key") ||
    lower.includes("invalid api key") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized")
  ) {
    return `Anthropic API Key 无效或未被接受，请检查 ANTHROPIC_API_KEY。原始错误：${raw}`;
  }

  if (
    status === 404 ||
    lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist")) ||
    lower.includes("invalid model")
  ) {
    return `Anthropic 模型名不可用，请检查 ANTHROPIC_MODEL=${config.model} 是否正确。原始错误：${raw}`;
  }

  if (
    lower.includes("thinking") ||
    lower.includes("budget_tokens") ||
    lower.includes("extended thinking") ||
    lower.includes("temperature may only be set to 1")
  ) {
    return `Anthropic thinking 配置不合法，请检查 ANTHROPIC_THINKING_BUDGET_TOKENS=${config.thinkingBudgetTokens} 以及 thinking 相关参数。原始错误：${raw}`;
  }

  if (
    status === 402 ||
    status === 429 ||
    lower.includes("credit balance is too low") ||
    lower.includes("insufficient credits") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("usage limit")
  ) {
    return `Anthropic 账户额度不足、超出配额，或当前被限流，请检查账户余额与使用限制。原始错误：${raw}`;
  }

  return raw;
}

async function readErrorMessage(
  response: Response,
  config: {
    model: string;
    thinkingBudgetTokens: number;
  }
) {
  const raw = await response.text();
  if (!raw) {
    return `Anthropic API 请求失败 (${response.status})`;
  }

  try {
    const payload = JSON.parse(raw) as { error?: { message?: string; type?: string } };
    const errorMessage = payload.error?.message?.trim();
    if (errorMessage) {
      return classifyAnthropicError(
        {
          message: errorMessage,
          type: payload.error?.type
        },
        response.status,
        config
      );
    }
  } catch {
    // Fall back to raw text below.
  }

  return classifyAnthropicError(
    {
      message: raw.slice(0, 400)
    },
    response.status,
    config
  );
}

async function requestAnthropicText(input: {
  system: string;
  messages: AnthropicMessageInput[];
  onTextDelta?: (delta: string, fullText: string) => void;
  onThinkingDelta?: (delta: string, fullThinking: string) => void;
}) {
  const config = getAnthropicConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const streaming = Boolean(input.onTextDelta || input.onThinkingDelta);
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": config.apiVersion,
        "x-api-key": config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        stream: streaming,
        system: input.system,
        thinking: {
          type: "enabled",
          budget_tokens: config.thinkingBudgetTokens
        },
        messages: input.messages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const message = await readErrorMessage(response, {
        model: config.model,
        thinkingBudgetTokens: config.thinkingBudgetTokens
      });
      throw new AnthropicRequestError(message, response.status);
    }

    if (streaming) {
      const payload = await consumeAnthropicStream(response, {
        onTextDelta: input.onTextDelta,
        onThinkingDelta: input.onThinkingDelta
      });
      if (!payload.text) {
        throw new AnthropicRequestError("Anthropic 返回了空内容", 502);
      }
      return payload.text;
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = extractText(payload);
    if (!text) {
      throw new AnthropicRequestError("Anthropic 返回了空内容", 502);
    }

    return text;
  } catch (error) {
    if (error instanceof AnthropicConfigError || error instanceof AnthropicRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AnthropicRequestError("Anthropic 请求超时", 504);
    }

    const message = error instanceof Error ? error.message : "Anthropic 请求失败";
    throw new AnthropicRequestError(message, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTherapyReply(input: {
  title: string;
  mode: string;
  messages: ChatMessage[];
  onTextDelta?: (delta: string, fullText: string) => void;
  onThinkingDelta?: (delta: string, fullThinking: string) => void;
}) {
  const themes = summarizeThemes(input.messages);
  const lastUserMessage =
    [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const riskLevel = detectRiskLevel(lastUserMessage);
  const text = await requestAnthropicText({
    system: await buildSystemPrompt({
      title: input.title,
      mode: input.mode,
      riskLevel,
      themes,
      messages: input.messages
    }),
    messages: toAnthropicMessages(input.messages),
    onTextDelta: input.onTextDelta,
    onThinkingDelta: input.onThinkingDelta
  });

  return {
    message: {
      id: createId("msg"),
      role: "assistant" as const,
      content: text,
      createdAt: new Date().toISOString()
    },
    riskLevel,
    themes
  };
}

export async function generateSupervisionArtifacts(input: {
  sessionTitle: string;
  messages: ChatMessage[];
  supervisionJournal: string | null;
}) {
  const supervisorRule = await loadCursorRule("supervisor");
  const themes = summarizeThemes(input.messages);
  const transcriptBlock = toVisibleTranscript(input.messages);

  const text = await requestAnthropicText({
    system: buildSupervisionSystemPrompt({
      supervisorRule: supervisorRule.body,
      sessionTitle: input.sessionTitle,
      themes,
      supervisionJournal: input.supervisionJournal
    }),
    messages: [
      {
        role: "user",
        content: [
          `# 本次会谈 transcript`,
          transcriptBlock || "本次会谈内容为空。",
          "",
          "# 历史 supervision journal",
          input.supervisionJournal?.trim() || "暂无历史督导手帐。"
        ].join("\n")
      }
    ]
  });

  const parsed = parseSupervisionPayload(text);
  const now = new Date().toISOString();

  return {
    transcript: parsed.transcript.map((item) => ({
      id: createId("sup"),
      role: item.role,
      content: item.content,
      createdAt: now
    })),
    journalEntry: parsed.journalEntry,
    redactedSummary: parsed.redactedSummary,
    journalEntryPreview: parsed.journalEntryPreview
  };
}
