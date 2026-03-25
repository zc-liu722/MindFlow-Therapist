import { getSessionPaceMeta, normalizeSessionPace } from "@/lib/session-pace";
import type { AppSessionDetail as SessionDetail } from "@/lib/app-dashboard-types";

export type SessionProgressPhase = "opening" | "exploring" | "deepening" | "closing" | "completed";

export type SessionProgress = {
  percent: number;
  phase: SessionProgressPhase;
  phaseLabel: string;
  summary: string;
  detailLabel: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

const THEME_PATTERNS: Array<[string, RegExp]> = [
  ["关系压力", /(关系|伴侣|家庭|父母|婚姻|朋友|同事|社交)/g],
  ["自我要求", /(自责|愧疚|不够好|失败|完美|应该|要求自己)/g],
  ["焦虑与压迫", /(焦虑|担心|害怕|紧张|压力|压得喘不过气)/g],
  ["情绪耗竭", /(疲惫|撑不住|麻木|失眠|崩溃|累到)/g],
  ["边界与表达", /(拒绝|表达|冲突|边界|说不|开口)/g],
  ["价值与意义", /(意义|价值|迷茫|空心|活着|人生方向)/g]
];

const REFLECTION_PATTERNS =
  /(我听见|我留意到|听起来|似乎|也许|如果愿意|我们先|一起看看|你提到|你刚刚说|像是|好像)/g;
const ACTION_PATTERNS =
  /(接下来|试着|练习|带着|记下来|留意|下次|可以做|一步|先做什么|这周)/g;
const SOFT_CLOSING_PATTERNS =
  /(先帮你收一收|先整理一下|我们先放在这里看看|如果先把重点收一收|到这里我会先听见|先记住这几点)/g;
const HARD_CLOSING_PATTERNS =
  /(总结一下|今天先到这里|结束前|最后想邀请你|带走|回顾一下|今天的会谈|下次我们可以)/g;
const DISCOVERY_PATTERNS =
  /(还有|另外|其实|刚刚想到|还有一件事|我突然想到|补充一下|不止|而且|同时|还有个问题)/g;
const USER_SUMMARY_PATTERNS =
  /(好像是|我发现|其实我更在意|说到底|归根结底|所以我现在|我想我可能|听你这么说)/g;
const HIGH_INTENSITY_PATTERNS =
  /(特别难受|太痛苦了|崩溃|受不了|完全撑不住|真的很想哭|停不下来|压得喘不过气|特别害怕)/g;

function summarizeThemes(text: string) {
  return THEME_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

export function estimateSessionProgress(session: SessionDetail): SessionProgress {
  const pace = normalizeSessionPace(session.pace);
  const paceMeta = getSessionPaceMeta(pace);

  if (session.status === "completed") {
    return {
      percent: 100,
      phase: "completed",
      phaseLabel: "会谈已完成",
      summary: "这段会谈已经收束，可以回看整理后的摘要、手帐与督导记录。",
      detailLabel: `${session.messageCount} 条消息`
    };
  }

  const visibleMessages = session.messages.filter(
    (message) => message.role === "user" || message.role === "assistant"
  );
  const userMessages = visibleMessages.filter((message) => message.role === "user");
  const assistantMessages = visibleMessages.filter((message) => message.role === "assistant");
  const exchangeCount = Math.min(userMessages.length, assistantMessages.length);
  const userText = userMessages.map((message) => message.content).join("\n");
  const assistantText = assistantMessages.map((message) => message.content).join("\n");
  const recentUserText = userMessages.slice(-3).map((message) => message.content).join("\n");
  const recentAssistantText = assistantMessages.slice(-3).map((message) => message.content).join("\n");

  const userChars = userMessages.reduce((sum, message) => sum + message.content.trim().length, 0);
  const longestUserMessage = userMessages.reduce(
    (longest, message) => Math.max(longest, message.content.trim().length),
    0
  );
  const averageUserLength = userMessages.length > 0 ? userChars / userMessages.length : 0;
  const themes = summarizeThemes(userText);

  const disclosureDepth = clamp(
    averageUserLength / 220 + longestUserMessage / 520 + userChars / 2200,
    0,
    1
  );
  const themeScore = clamp(themes.length / 4, 0, 1);
  const reflectionScore = clamp(countMatches(assistantText, REFLECTION_PATTERNS) / 5, 0, 1);
  const actionScore = clamp(countMatches(assistantText, ACTION_PATTERNS) / 4, 0, 1);
  const softClosureScore = clamp(countMatches(recentAssistantText, SOFT_CLOSING_PATTERNS) / 2, 0, 1);
  const hardClosureScore = clamp(countMatches(recentAssistantText, HARD_CLOSING_PATTERNS) / 2, 0, 1);
  const discoveryScore = clamp(countMatches(recentUserText, DISCOVERY_PATTERNS) / 3, 0, 1);
  const userSummaryScore = clamp(countMatches(recentUserText, USER_SUMMARY_PATTERNS) / 2, 0, 1);
  const intensityScore = clamp(countMatches(recentUserText, HIGH_INTENSITY_PATTERNS) / 2, 0, 1);
  const turnProgress = clamp(exchangeCount / Math.max(paceMeta.targetTurns, 1), 0, 1);

  const contentOpening = clamp(
    (userMessages.length > 0 ? 0.38 : 0) +
      (assistantMessages.length > 0 ? 0.24 : 0) +
      (userChars > 80 ? 0.16 : 0) +
      Math.min(exchangeCount / 3, 1) * 0.22,
    0,
    1
  );
  const contentExploring = clamp(
    disclosureDepth * 0.32 +
      themeScore * 0.24 +
      discoveryScore * 0.18 +
      reflectionScore * 0.1 +
      turnProgress * 0.16,
    0,
    1
  );
  const contentDeepening = clamp(
    reflectionScore * 0.34 +
      userSummaryScore * 0.16 +
      themeScore * 0.16 +
      actionScore * 0.08 +
      clamp((turnProgress - 0.22) / 0.48, 0, 1) * 0.26,
    0,
    1
  );
  const closureReadiness = clamp(
    contentDeepening * 0.34 +
      actionScore * 0.16 +
      softClosureScore * 0.16 +
      hardClosureScore * 0.14 +
      userSummaryScore * 0.12 +
      turnProgress * 0.08,
    0,
    1
  );
  const expansionPressure = clamp(
    discoveryScore * 0.4 + intensityScore * 0.28 + (1 - userSummaryScore) * 0.12,
    0,
    1
  );

  const paceBias =
    pace === "fast"
      ? { phaseBias: 0.08, percentBias: 8, closeBoost: 0.08, expandPenalty: 0.03 }
      : pace === "slow"
        ? { phaseBias: -0.08, percentBias: -8, closeBoost: -0.08, expandPenalty: -0.03 }
        : { phaseBias: 0, percentBias: 0, closeBoost: 0, expandPenalty: 0 };

  const adjustedExploring = clamp(contentExploring + paceBias.phaseBias * 0.35, 0, 1);
  const adjustedDeepening = clamp(
    contentDeepening + paceBias.phaseBias * 0.55 - expansionPressure * 0.06,
    0,
    1
  );
  const adjustedClosure = clamp(
    closureReadiness + paceBias.closeBoost - expansionPressure * (0.16 + paceBias.expandPenalty),
    0,
    1
  );

  let phase: Exclude<SessionProgressPhase, "completed"> = "opening";
  if (adjustedClosure >= 0.6 && expansionPressure <= 0.76) {
    phase = "closing";
  } else if (adjustedDeepening >= 0.48) {
    phase = "deepening";
  } else if (adjustedExploring >= 0.28 || userMessages.length >= 2 || themes.length > 0) {
    phase = "exploring";
  }

  const basePercent =
    phase === "opening"
      ? contentOpening * 24
      : phase === "exploring"
        ? 24 + adjustedExploring * 34
        : phase === "deepening"
          ? 60 + adjustedDeepening * 24
          : 86 + adjustedClosure * 10;

  const boundedPercentBias =
    phase === "opening"
      ? paceBias.percentBias * 0.35
      : phase === "exploring"
        ? paceBias.percentBias * 0.7
        : phase === "deepening"
          ? paceBias.percentBias
          : paceBias.percentBias * 0.85;

  const percent = clamp(
    Math.round(basePercent + boundedPercentBias - expansionPressure * 3),
    0,
    99
  );

  if (percent >= 86) {
    phase = "closing";
  } else if (percent >= 60) {
    phase = "deepening";
  } else if (percent >= 24) {
    phase = "exploring";
  } else {
    phase = "opening";
  }

  const detailLabel =
    phase === "closing"
      ? adjustedClosure >= 0.78 && expansionPressure < 0.34
        ? "已具备重收束条件"
        : "已具备轻收束条件"
      : phase === "deepening"
        ? reflectionScore > 0
          ? `已出现 ${Math.max(1, Math.round(reflectionScore * 5))} 次整理/反思信号`
          : "线索开始从展开转向整理"
        : phase === "exploring"
          ? discoveryScore > 0.45
            ? "最近仍在出现新的重要内容"
            : themes.length > 0
              ? `已浮现 ${themes.length} 个主题`
              : "正在继续澄清和展开"
          : userMessages.length > 0
            ? "已开始承接当前困扰"
            : "等待第一条消息";

  const summary =
    phase === "closing"
      ? adjustedClosure >= 0.78 && expansionPressure < 0.34
        ? "当前内容已经比较完整，可以做更明确的总结与收束；如果你继续展开，进度也会重新放缓。"
        : "当前已具备初步收束条件，系统会先做温和整理，但不会因为速度设置而突然结束。"
      : phase === "deepening"
        ? pace === "fast"
          ? "线索开始成形，快速节奏会让进度更偏向整理，但仍以内容走向为准。"
          : pace === "slow"
            ? "虽然已经进入整理区间，但慢速节奏会保留更多继续展开和停留的空间。"
            : "会把已出现的模式、情绪和想法慢慢串起来，形成更清晰的理解。"
        : phase === "exploring"
          ? pace === "fast"
            ? "会更积极帮助聚焦重点，所以进度会略微更靠前，但只要你还在持续展开重要内容，就不会强行收束。"
            : pace === "slow"
              ? "会保留更多倾听和停留空间，所以同样内容下进度会稍微更保守。"
              : "会在承接和推进之间保持平衡，优先跟随当前最重要的内容。"
          : `当前以${paceMeta.label}倾向推进，会先确保情绪和处境被接住，再决定是否继续深入。`;

  const phaseLabel =
    phase === "opening"
      ? "开始铺陈"
      : phase === "exploring"
        ? "进入探索"
        : phase === "deepening"
          ? "继续深入"
          : adjustedClosure >= 0.78 && expansionPressure < 0.34
            ? "接近重收束"
            : "接近轻收束";

  return {
    percent,
    phase,
    phaseLabel,
    summary,
    detailLabel
  };
}
