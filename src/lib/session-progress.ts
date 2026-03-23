import type { MessageRole, RiskLevel, SessionStatus } from "@/lib/types";

type ProgressMessage = {
  role: MessageRole;
  content: string;
  createdAt: string;
};

type SessionProgressInput = {
  createdAt: string;
  mode: string;
  status: SessionStatus;
  riskLevel?: RiskLevel;
  messages: ProgressMessage[];
};

export type SessionProgressSnapshot = {
  percent: number;
  phase: "opening" | "exploration" | "integration" | "closing" | "completed";
  phaseLabel: string;
  summary: string;
  detailLabel: string;
};

const PROGRESS_PHASE_THRESHOLDS = {
  opening: 24,
  exploration: 60,
  integration: 86
} as const;

const THEME_PATTERNS: Array<[string, RegExp]> = [
  ["关系压力", /(关系|伴侣|家庭|父母|婚姻|朋友|同事|社交)/g],
  ["自我要求", /(自责|愧疚|不够好|失败|完美|应该|要求自己)/g],
  ["焦虑与压迫", /(焦虑|担心|害怕|紧张|压力|压得喘不过气)/g],
  ["情绪耗竭", /(疲惫|撑不住|麻木|失眠|崩溃|累到)/g],
  ["边界与表达", /(拒绝|表达|冲突|边界|说不|开口)/g],
  ["价值与意义", /(意义|价值|迷茫|空心|活着|人生方向)/g]
];

const EMOTION_PATTERNS = /(难受|痛苦|委屈|压抑|害怕|焦虑|崩溃|绝望|愤怒|内疚|羞耻|孤独|无力|疲惫|麻木|心慌|失眠|担心)/g;
const REFLECTION_PATTERNS = /(我听见|我留意到|听起来|似乎|也许|如果愿意|我们先|一起看看|你提到|你刚刚说)/g;
const ACTION_PATTERNS = /(这周|接下来|试着|练习|带着|记下来|留意|下次|可以做|具体一点)/g;
const CLOSING_PATTERNS = /(总结一下|收一收|收束|今天先到这里|结束前|最后想邀请你|带走|回顾一下|下次我们|本次先|今天的会谈)/g;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function summarizeThemes(text: string) {
  return THEME_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

function resolvePhaseFromPercent(percent: number): SessionProgressSnapshot["phase"] {
  if (percent >= PROGRESS_PHASE_THRESHOLDS.integration) {
    return "closing";
  }

  if (percent >= PROGRESS_PHASE_THRESHOLDS.exploration) {
    return "integration";
  }

  if (percent >= PROGRESS_PHASE_THRESHOLDS.opening) {
    return "exploration";
  }

  return "opening";
}

function resolveActivePhaseFromPercent(
  percent: number
): Exclude<SessionProgressSnapshot["phase"], "completed"> {
  return resolvePhaseFromPercent(percent) as Exclude<
    SessionProgressSnapshot["phase"],
    "completed"
  >;
}

export function estimateSessionProgress(
  session: SessionProgressInput
): SessionProgressSnapshot {
  const visibleMessages = session.messages.filter(
    (message) => message.role === "user" || message.role === "assistant"
  );
  const userMessages = visibleMessages.filter((message) => message.role === "user");
  const assistantMessages = visibleMessages.filter((message) => message.role === "assistant");
  const exchangeCount = Math.min(userMessages.length, assistantMessages.length);
  const conversationText = userMessages.map((message) => message.content).join("\n");
  const recentText = visibleMessages.slice(-4).map((message) => message.content).join("\n");

  const userChars = userMessages.reduce((sum, message) => sum + message.content.trim().length, 0);
  const assistantChars = assistantMessages.reduce(
    (sum, message) => sum + message.content.trim().length,
    0
  );
  const longestUserMessage = userMessages.reduce(
    (longest, message) => Math.max(longest, message.content.trim().length),
    0
  );
  const averageUserLength = userMessages.length > 0 ? userChars / userMessages.length : 0;
  const themes = summarizeThemes(conversationText);
  const emotionHits = countMatches(conversationText, EMOTION_PATTERNS);
  const reflectionHits = countMatches(
    assistantMessages.map((message) => message.content).join("\n"),
    REFLECTION_PATTERNS
  );
  const actionHits = countMatches(
    assistantMessages.map((message) => message.content).join("\n"),
    ACTION_PATTERNS
  );
  const closingCueScore = clamp(countMatches(recentText, CLOSING_PATTERNS) / 3, 0, 1);
  const themeCoverage = clamp(themes.length / 4, 0, 1);
  const disclosureDepth = clamp(
    averageUserLength / 220 + longestUserMessage / 520 + userChars / 2200,
    0,
    1
  );
  const emotionDensity = clamp(emotionHits / Math.max(userMessages.length * 3, 4), 0, 1);
  const reflectionScore = clamp(reflectionHits / 5, 0, 1);
  const actionScore = clamp(actionHits / 4, 0, 1);
  const reciprocityScore = clamp(
    assistantMessages.length / Math.max(userMessages.length, 1) / 1.2 +
      assistantChars / Math.max(userChars, 1) / 1.6,
    0,
    1
  );

  const openingWork = clamp(
    (userMessages.length > 0 ? 0.45 : 0) +
      (userChars > 90 ? 0.25 : 0) +
      (assistantMessages.length > 0 ? 0.3 : 0),
    0,
    1
  );
  const explorationWork = clamp(
    userChars / 950 * 0.4 + themeCoverage * 0.22 + disclosureDepth * 0.25 + emotionDensity * 0.13,
    0,
    1
  );
  const integrationWork = clamp(
    assistantMessages.length / 5 * 0.18 +
      reflectionScore * 0.38 +
      actionScore * 0.24 +
      reciprocityScore * 0.2,
    0,
    1
  );
  const stageSeeds = {
    opening: clamp(openingWork, 0, 1),
    exploration: clamp(
      explorationWork * 0.72 + themeCoverage * 0.16 + disclosureDepth * 0.12,
      0,
      1
    ),
    integration: clamp(integrationWork * 0.68 + reflectionScore * 0.18 + actionScore * 0.14, 0, 1),
    closing: clamp(closingCueScore * 0.72 + actionScore * 0.28, 0, 1)
  };
  const turnCoverage = {
    opening: clamp(exchangeCount / 2, 0, 1),
    exploration: clamp(exchangeCount / 5, 0, 1),
    integration: clamp(exchangeCount / 8, 0, 1),
    closing: clamp(exchangeCount / 11, 0, 1)
  } as const;

  const phase =
    session.status === "completed"
      ? "completed"
      : closingCueScore > 0.55 || actionScore > 0.72
        ? "closing"
        : integrationWork >= 0.58 || reflectionScore > 0.5
          ? "integration"
          : explorationWork >= 0.24 || userMessages.length >= 2 || themes.length > 0
            ? "exploration"
            : "opening";

  const progressRanges = {
    opening: [0, 22],
    exploration: [24, 58],
    integration: [60, 84],
    closing: [86, 99]
  } as const;

  if (phase === "completed") {
    return {
      percent: 100,
      phase,
      phaseLabel: "本次会谈已完成",
      summary: "会谈已归档，可回看记录与督导内容。",
      detailLabel: "四个阶段已全部结束"
    };
  }

  const [start, end] = progressRanges[phase];
  const turnSeed = turnCoverage[phase];
  const seedBase = Math.max(stageSeeds[phase], turnSeed * 0.82);
  const closingApproach =
    phase === "closing"
      ? clamp(
          Math.max(
            seedBase,
            closingCueScore * 0.94,
            actionScore * 0.9,
            turnSeed * 0.9,
            clamp((exchangeCount - 8) / 4, 0, 1) * 0.92 + closingCueScore * 0.08
          ),
          0,
          1
        )
      : seedBase;
  const seed = phase === "closing" ? closingApproach : seedBase;
  const heuristicPercent = Math.round(start + (end - start) * seed);
  const turnDrivenFloor =
    visibleMessages.length > 0
      ? clamp(
          phase === "closing"
            ? 88 + Math.max(0, visibleMessages.length - 12)
            : 6 + visibleMessages.length,
          0,
          99
        )
      : 0;
  const percent = clamp(Math.max(heuristicPercent, turnDrivenFloor), 0, 99);
  const displayPhase = resolveActivePhaseFromPercent(percent);
  const displayPhaseCopy = {
    opening: {
      phaseLabel: "正在建立本次会谈焦点",
      summary: "先把当前最需要被看见的情绪、情境和期待摆到台面上。",
      detailLabel: userMessages.length > 0 ? "已接住开场信息" : "等待第一条消息"
    },
    exploration: {
      phaseLabel: "正在展开体验与关键主题",
      summary: "会结合谈话内容继续深入，同时每轮对话都会稳步向前推进。",
      detailLabel:
        themes.length > 0
          ? `已浮现 ${themes.length} 个主题`
          : `已完成 ${visibleMessages.length} 轮对话推进`
    },
    integration: {
      phaseLabel: "正在整理线索并形成理解",
      summary: "会把已经浮现的模式和感受串起来，慢慢靠近更清晰的理解。",
      detailLabel:
        reflectionHits > 0
          ? `已出现 ${reflectionHits} 次反思回应`
          : "开始归拢已经出现的线索"
    },
    closing: {
      phaseLabel: "正在收束本次会谈",
      summary: "开始把重点收拢成可带走的线索、提醒或下次继续的方向。",
      detailLabel:
        actionHits > 0 ? `已形成 ${actionHits} 个行动/收束线索` : "正在整理可带走的重点"
    }
  }[displayPhase];

  return {
    percent,
    phase: displayPhase,
    phaseLabel: displayPhaseCopy.phaseLabel,
    summary: displayPhaseCopy.summary,
    detailLabel: displayPhaseCopy.detailLabel
  };
}
