export const SESSION_PACE_CATALOG = [
  {
    value: "slow",
    label: "慢速",
    description: "更多倾听，放慢推进节奏"
  },
  {
    value: "medium",
    label: "中速",
    description: "保持平衡，兼顾倾听、聚焦与自然推进"
  },
  {
    value: "fast",
    label: "快速",
    description: "更快聚焦，更快帮助收尾"
  }
] as const;

export const SESSION_PACE_OPTIONS = SESSION_PACE_CATALOG.map((item) => item.value);

export type SessionPace = (typeof SESSION_PACE_OPTIONS)[number];

export const DEFAULT_SESSION_PACE: SessionPace = "medium";

export function normalizeSessionPace(pace?: string | null): SessionPace {
  const value = pace?.trim().toLowerCase();
  return SESSION_PACE_OPTIONS.includes(value as SessionPace)
    ? (value as SessionPace)
    : DEFAULT_SESSION_PACE;
}

export function getSessionPaceMeta(pace?: string | null) {
  const normalized = normalizeSessionPace(pace);
  return (
    SESSION_PACE_CATALOG.find((item) => item.value === normalized) ??
    SESSION_PACE_CATALOG[0]
  );
}
