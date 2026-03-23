import { createId } from "@/lib/crypto";
import { redactSensitiveText } from "@/lib/redaction";
import { DEFAULT_SESSION_MODE } from "@/lib/session-modes";
import type { ChatMessage, RiskLevel } from "@/lib/types";

export function detectRiskLevel(text: string): RiskLevel {
  const value = text.toLowerCase();
  if (
    value.includes("不想活") ||
    value.includes("自杀") ||
    value.includes("伤害自己") ||
    value.includes("绝望")
  ) {
    return "high";
  }
  if (
    value.includes("焦虑") ||
    value.includes("失眠") ||
    value.includes("崩溃") ||
    value.includes("害怕")
  ) {
    return "medium";
  }
  return "low";
}

export function summarizeThemes(messages: ChatMessage[]) {
  const joined = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");

  const themePairs: Array<[string, RegExp]> = [
    ["关系压力", /(关系|伴侣|家庭|父母|婚姻|朋友)/],
    ["自我要求", /(内疚|自责|不够好|失败|完美)/],
    ["焦虑与压迫", /(焦虑|压力|担心|害怕|紧张)/],
    ["情绪耗竭", /(累|疲惫|撑不住|麻木|失眠)/],
    ["边界与表达", /(拒绝|表达|冲突|边界|说不)/]
  ];

  const themes = themePairs
    .filter(([, regex]) => regex.test(joined))
    .map(([label]) => label);

  return themes.length > 0 ? themes : ["情绪梳理", "压力识别"];
}

export function buildAssistantReply(messages: ChatMessage[]) {
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const themes = summarizeThemes(messages);
  const riskLevel = detectRiskLevel(lastUserMessage);

  const empathicLead =
    riskLevel === "high"
      ? "你现在提到的痛苦很重，我会先把安全放在最前面。"
      : "我听见你正在承受不小的压力，我们可以先把它慢慢放到桌面上。";

  const reply = [
    empathicLead,
    `这一段内容里我特别留意到的主题是：${themes.join("、")}。`,
    "如果你愿意，我们先聚焦一个最刺痛的瞬间，看看它触发了什么想法、情绪和身体反应。",
    riskLevel === "high"
      ? "如果你有现实中的自伤风险，请优先联系身边可信任的人或当地紧急援助资源。"
      : "你不需要一次把所有问题说清楚，我们可以只处理眼前最需要被理解的部分。"
  ].join("\n\n");

  return {
    message: {
      id: createId("msg"),
      role: "assistant" as const,
      content: reply,
      createdAt: new Date().toISOString()
    },
    riskLevel,
    themes
  };
}

export function buildTherapyJournal(messages: ChatMessage[], title: string) {
  const userMessages = messages.filter((message) => message.role === "user");
  const combined = userMessages.map((item) => item.content).join("\n");
  const themes = summarizeThemes(messages);
  const riskLevel = detectRiskLevel(combined);
  const latestQuote = redactSensitiveText(userMessages.at(-1)?.content ?? "本次表达较为克制。");

  const content = `# Therapy Journal

## 来访者画像
- 称呼：来访者
- 背景概要：近期围绕 ${themes.join("、")} 展开，原始身份信息已脱敏。
- 核心议题：${themes.join("、")}
- 咨询目标：希望获得更稳定的情绪理解、边界感与行动方向。

## 关系模式与人格特点
- 在压力下容易先压住自己的需要，再去照顾他人的期待。
- 对冲突和评价较为敏感，常常会提前预设最坏结果。
- 有较强的责任感，但也因此容易进入自责和过度承担。

## 治疗进程
### ${new Date().toISOString().slice(0, 10)} | 本次会谈 | ${DEFAULT_SESSION_MODE}
- **本次议题**：${title}
- **关键时刻**：${latestQuote}
- **咨询师观察**：来访者在表达压力、关系与自我要求时存在明显联动，适合继续做情绪命名与自动化想法辨识。
- **下次跟进**：聚焦一个高压场景，追踪触发点、核心信念与可执行的新反应。

## 待探索方向
- 压力场景里的自动化想法
- 对关系失控的担忧来自哪里
- 身体反应与情绪表达之间的连接
- 更温和的自我对话方式

## 重要隐喻与来访者语言
- “像一直在撑着”
- “脑子停不下来”
- “明明很累却不敢停”

## 安全备忘
- 风险等级：${riskLevel}
- 已确认的边界约定：网页端按用户隔离，仅本人可见原文。
- 需要注意的敏感领域：关系冲突、自我价值、持续性压力事件。`;

  return {
    content,
    redactedSummary: `聚焦 ${themes.join("、")}，风险等级 ${riskLevel}。`
  };
}
