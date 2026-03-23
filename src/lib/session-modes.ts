export const SESSION_MODE_CATALOG = [
  {
    value: "整合式心理治疗（Integrative）",
    shortLabel: "整合式心理治疗",
    acronym: "Integrative",
    aliases: ["整合取向", "整合式心理治疗"]
  },
  {
    value: "人本主义疗法（PCT）",
    shortLabel: "人本主义疗法",
    acronym: "Humanistic",
    aliases: ["人本取向", "人本主义疗法", "Humanistic", "来访者中心疗法", "人本主义 / 来访者中心疗法"]
  },
  {
    value: "精神动力学治疗（PDT）",
    shortLabel: "精神动力学治疗",
    acronym: "Psychodynamic",
    aliases: ["精神动力取向", "精神动力学治疗", "Psychodynamic", "精神动力学取向", "精神分析取向"]
  },
  {
    value: "认知行为疗法（CBT）",
    shortLabel: "认知行为疗法",
    acronym: "CBT",
    aliases: ["CBT", "认知行为疗法"]
  },
  {
    value: "支持性心理治疗（SPT）",
    shortLabel: "支持性心理治疗",
    acronym: "SPT",
    aliases: ["支持性会谈", "支持性治疗"]
  },
  {
    value: "接纳与承诺疗法（ACT）",
    shortLabel: "接纳与承诺疗法",
    acronym: "ACT",
    aliases: ["ACT", "接纳与承诺疗法"]
  },
  {
    value: "辩证行为疗法（DBT）",
    shortLabel: "辩证行为疗法",
    acronym: "DBT",
    aliases: ["DBT", "辩证行为疗法"]
  },
  {
    value: "情绪聚焦疗法（EFT）",
    shortLabel: "情绪聚焦疗法",
    acronym: "EFT",
    aliases: ["EFT", "情绪聚焦疗法"]
  },
  {
    value: "存在主义疗法（Existential）",
    shortLabel: "存在主义疗法",
    acronym: "Existential",
    aliases: ["Existential", "存在主义疗法"]
  },
  {
    value: "格式塔疗法（Gestalt）",
    shortLabel: "格式塔疗法",
    acronym: "Gestalt",
    aliases: ["Gestalt", "格式塔疗法", "完形疗法", "格式塔 / 完形疗法"]
  },
  {
    value: "叙事疗法（Narrative）",
    shortLabel: "叙事疗法",
    acronym: "Narrative",
    aliases: ["Narrative", "叙事疗法"]
  },
  {
    value: "焦点解决短程治疗（SFBT）",
    shortLabel: "焦点解决短程治疗",
    acronym: "SFBT",
    aliases: ["SFBT", "焦点解决短程治疗", "焦点解决疗法"]
  }
] as const;

export const SESSION_MODE_OPTIONS = SESSION_MODE_CATALOG.map((item) => item.value);

export type SessionMode = (typeof SESSION_MODE_OPTIONS)[number];
export type SessionModeOption = (typeof SESSION_MODE_CATALOG)[number];

const SESSION_MODE_ALIASES: Record<string, SessionMode> = SESSION_MODE_CATALOG.reduce(
  (accumulator, item) => {
    accumulator[item.value] = item.value;
    accumulator[item.shortLabel] = item.value;

    item.aliases.forEach((alias) => {
      accumulator[alias] = item.value;
    });

    return accumulator;
  },
  {} as Record<string, SessionMode>
);

export const DEFAULT_SESSION_MODE: SessionMode = SESSION_MODE_OPTIONS[0];

export function normalizeSessionMode(mode?: string | null): SessionMode {
  const value = mode?.trim();
  if (!value) {
    return DEFAULT_SESSION_MODE;
  }

  return SESSION_MODE_ALIASES[value] ?? DEFAULT_SESSION_MODE;
}
