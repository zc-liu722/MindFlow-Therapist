import { readFile } from "node:fs/promises";
import path from "node:path";

export type CursorRuleName = "therapist-core" | "supervisor";
export type CursorModRuleName =
  | "mod-act"
  | "mod-cbt"
  | "mod-dbt"
  | "mod-eft"
  | "mod-existential"
  | "mod-gestalt"
  | "mod-humanistic"
  | "mod-narrative"
  | "mod-psychodynamic"
  | "mod-spt"
  | "mod-sfbt";

const RULES_DIR = path.join(process.cwd(), ".cursor", "rules");
const cursorRuleCache = new Map<CursorRuleName, ReturnType<typeof readCursorRuleFile>>();
const cursorModRuleCache = new Map<CursorModRuleName, ReturnType<typeof readModRuleFile>>();

function toRulePath(ruleName: CursorRuleName) {
  return path.join(RULES_DIR, `${ruleName}.mdc`);
}

function toModRulePath(ruleName: CursorModRuleName) {
  return path.join(RULES_DIR, `${ruleName}.mdc`);
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

async function readCursorRuleFile(ruleName: CursorRuleName) {
  const rulePath = toRulePath(ruleName);

  try {
    const content = await readFile(rulePath, "utf8");
    return {
      name: ruleName,
      path: rulePath,
      content,
      body: stripFrontmatter(content)
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? error.message : "unknown error";
    throw new Error(`CURSOR_RULE_LOAD_FAILED:${ruleName}:${reason}`);
  }
}

async function readModRuleFile(ruleName: CursorModRuleName) {
  const rulePath = toModRulePath(ruleName);

  try {
    const content = await readFile(rulePath, "utf8");
    return {
      name: ruleName,
      path: rulePath,
      content,
      body: stripFrontmatter(content)
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? error.message : "unknown error";
    throw new Error(`CURSOR_MOD_RULE_LOAD_FAILED:${ruleName}:${reason}`);
  }
}

export function loadCursorRule(ruleName: CursorRuleName) {
  const cached = cursorRuleCache.get(ruleName);
  if (cached) {
    return cached;
  }

  const pending = readCursorRuleFile(ruleName).catch((error) => {
    cursorRuleCache.delete(ruleName);
    throw error;
  });
  cursorRuleCache.set(ruleName, pending);
  return pending;
}

export function loadCursorModRule(ruleName: CursorModRuleName) {
  const cached = cursorModRuleCache.get(ruleName);
  if (cached) {
    return cached;
  }

  const pending = readModRuleFile(ruleName).catch((error) => {
    cursorModRuleCache.delete(ruleName);
    throw error;
  });
  cursorModRuleCache.set(ruleName, pending);
  return pending;
}

export function resolveModRulesForMode(mode: string): CursorModRuleName[] {
  switch (mode) {
    case "整合式心理治疗（Integrative）":
      return ["mod-humanistic", "mod-psychodynamic", "mod-cbt"];
    case "人本主义疗法（PCT）":
      return ["mod-humanistic"];
    case "精神动力学治疗（PDT）":
      return ["mod-psychodynamic"];
    case "认知行为疗法（CBT）":
      return ["mod-cbt"];
    case "接纳与承诺疗法（ACT）":
      return ["mod-act"];
    case "辩证行为疗法（DBT）":
      return ["mod-dbt"];
    case "情绪聚焦疗法（EFT）":
      return ["mod-eft"];
    case "存在主义疗法（Existential）":
      return ["mod-existential"];
    case "格式塔疗法（Gestalt）":
      return ["mod-gestalt"];
    case "叙事疗法（Narrative）":
      return ["mod-narrative"];
    case "焦点解决短程治疗（SFBT）":
      return ["mod-sfbt"];
    case "支持性心理治疗（SPT）":
      return ["mod-spt"];
    default:
      return [];
  }
}

export async function preloadModeRules(mode: string) {
  const modRules = resolveModRulesForMode(mode);
  return Promise.all(modRules.map((ruleName) => loadCursorModRule(ruleName)));
}

export function preloadTherapistCoreRule() {
  return loadCursorRule("therapist-core");
}

export function preloadSupervisorRule() {
  return loadCursorRule("supervisor");
}
