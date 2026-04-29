import { createId } from "@/lib/crypto";
import { writeDb } from "@/lib/db";
import type {
  BillingOrderRecord,
  BillingPlan,
  TherapySessionRecord,
  UsageLedgerFeatureKind,
  UsageLedgerProvider,
  UsageLedgerRecord,
  UserRecord
} from "@/lib/types";

const DEFAULT_FREE_MONTHLY_SESSION_LIMIT = 3;
const DEFAULT_PLUS_MONTHLY_SESSION_LIMIT = 31;
const DEFAULT_PLUS_PRICE_CNY = 39;

type QuotaWindow = {
  quotaPeriodStart: string;
  quotaPeriodEnd: string;
};

export type UsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

export type UserBillingSummary = {
  plan: BillingPlan;
  quota: {
    monthlySessionLimit: number;
    monthlySessionUsed: number;
    remainingSessions: number;
    quotaPeriodStart: string;
    quotaPeriodEnd: string;
    hasRemainingSessions: boolean;
  };
  billing: {
    planStartedAt?: string;
    planExpireAt?: string;
    billingCycleAnchor?: string;
    isPlusActive: boolean;
  };
};

function positiveIntFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(4));
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function resolveQuotaWindow(now = new Date()): QuotaWindow {
  return {
    quotaPeriodStart: startOfMonth(now).toISOString(),
    quotaPeriodEnd: endOfMonth(now).toISOString()
  };
}

export function getPlanDisplayName(plan: BillingPlan) {
  return plan === "plus" ? "Plus" : "Free";
}

export function getMonthlySessionLimit(plan: BillingPlan) {
  return plan === "plus"
    ? positiveIntFromEnv(process.env.BILLING_PLUS_MONTHLY_SESSION_LIMIT, DEFAULT_PLUS_MONTHLY_SESSION_LIMIT)
    : positiveIntFromEnv(process.env.BILLING_FREE_MONTHLY_SESSION_LIMIT, DEFAULT_FREE_MONTHLY_SESSION_LIMIT);
}

export function getPlusPriceCny() {
  return positiveIntFromEnv(process.env.BILLING_PLUS_PRICE_CNY, DEFAULT_PLUS_PRICE_CNY);
}

export function resolveEffectivePlan(user: UserRecord, now = new Date()): BillingPlan {
  const requestedPlan = user.plan === "plus" ? "plus" : "free";
  const planExpireAt = user.billing?.planExpireAt;
  if (requestedPlan !== "plus" || !planExpireAt) {
    return requestedPlan;
  }

  return new Date(planExpireAt).getTime() > now.getTime() ? "plus" : "free";
}

export function ensureUserBillingState(user: UserRecord, now = new Date()): UserBillingSummary {
  const effectivePlan = resolveEffectivePlan(user, now);
  const window = resolveQuotaWindow(now);
  const nextLimit = getMonthlySessionLimit(effectivePlan);

  user.plan = effectivePlan;
  user.billing = {
    ...user.billing,
    planStartedAt: user.billing?.planStartedAt ?? user.createdAt,
    billingCycleAnchor: user.billing?.billingCycleAnchor ?? window.quotaPeriodStart
  };

  const quotaMissing = !user.quota;
  const quotaExpired =
    Boolean(user.quota?.quotaPeriodEnd) &&
    new Date(user.quota!.quotaPeriodEnd).getTime() < now.getTime();
  const quotaLimitChanged = Boolean(user.quota && user.quota.monthlySessionLimit !== nextLimit);

  if (quotaMissing || quotaExpired) {
    user.quota = {
      monthlySessionLimit: nextLimit,
      monthlySessionUsed: 0,
      quotaPeriodStart: window.quotaPeriodStart,
      quotaPeriodEnd: window.quotaPeriodEnd,
      lastResetAt: now.toISOString()
    };
  } else if (quotaLimitChanged) {
    const currentQuota = user.quota!;
    user.quota = {
      monthlySessionLimit: nextLimit,
      monthlySessionUsed: currentQuota.monthlySessionUsed,
      quotaPeriodStart: currentQuota.quotaPeriodStart,
      quotaPeriodEnd: currentQuota.quotaPeriodEnd,
      lastResetAt: currentQuota.lastResetAt
    };
  }

  const quota = user.quota!;
  const remainingSessions = Math.max(quota.monthlySessionLimit - quota.monthlySessionUsed, 0);

  return {
    plan: effectivePlan,
    quota: {
      monthlySessionLimit: quota.monthlySessionLimit,
      monthlySessionUsed: quota.monthlySessionUsed,
      remainingSessions,
      quotaPeriodStart: quota.quotaPeriodStart,
      quotaPeriodEnd: quota.quotaPeriodEnd,
      hasRemainingSessions: remainingSessions > 0
    },
    billing: {
      planStartedAt: user.billing?.planStartedAt,
      planExpireAt: user.billing?.planExpireAt,
      billingCycleAnchor: user.billing?.billingCycleAnchor,
      isPlusActive: effectivePlan === "plus"
    }
  };
}

export function assertCanStartSession(user: UserRecord, now = new Date()) {
  const summary = ensureUserBillingState(user, now);
  if (!summary.quota.hasRemainingSessions) {
    throw new Error("PLAN_QUOTA_EXCEEDED");
  }

  return summary;
}

export function consumeCompletedSessionQuota(input: {
  user: UserRecord;
  session: TherapySessionRecord;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const summary = ensureUserBillingState(input.user, now);

  if (input.session.quotaChargedAt) {
    return {
      charged: false,
      summary
    };
  }

  if (!summary.quota.hasRemainingSessions) {
    throw new Error("PLAN_QUOTA_EXCEEDED");
  }

  input.user.quota = {
    ...input.user.quota!,
    monthlySessionUsed: input.user.quota!.monthlySessionUsed + 1
  };
  input.session.quotaChargedAt = now.toISOString();
  input.session.quotaChargeId = createId("quota");
  input.session.billingPlanAtCompletion = summary.plan;

  return {
    charged: true,
    summary: ensureUserBillingState(input.user, now)
  };
}

export function grantPlusPlan(input: {
  user: UserRecord;
  paidAt?: string;
  durationDays?: number;
}) {
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  const durationDays = input.durationDays ?? 30;
  const expireAt = new Date(paidAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  input.user.plan = "plus";
  input.user.billing = {
    ...input.user.billing,
    planStartedAt: paidAt.toISOString(),
    planExpireAt: expireAt.toISOString(),
    billingCycleAnchor: input.user.billing?.billingCycleAnchor ?? resolveQuotaWindow(paidAt).quotaPeriodStart,
    lastPaymentAt: paidAt.toISOString()
  };

  return ensureUserBillingState(input.user, paidAt);
}

export function estimateUsageCostCny(input: {
  provider: UsageLedgerProvider;
  usage: UsageSnapshot;
}) {
  const inputRate =
    input.provider === "anthropic"
      ? Number(process.env.BILLING_ANTHROPIC_INPUT_RATE_CNY_PER_1K ?? "0.12")
      : Number(process.env.BILLING_MOONSHOT_INPUT_RATE_CNY_PER_1K ?? "0.012");
  const outputRate =
    input.provider === "anthropic"
      ? Number(process.env.BILLING_ANTHROPIC_OUTPUT_RATE_CNY_PER_1K ?? "0.6")
      : Number(process.env.BILLING_MOONSHOT_OUTPUT_RATE_CNY_PER_1K ?? "0.012");
  const cacheCreateRate = Number(process.env.BILLING_ANTHROPIC_CACHE_CREATE_RATE_CNY_PER_1K ?? "0");
  const cacheReadRate = Number(process.env.BILLING_ANTHROPIC_CACHE_READ_RATE_CNY_PER_1K ?? "0");

  const inputCost = (input.usage.inputTokens / 1000) * inputRate;
  const outputCost = (input.usage.outputTokens / 1000) * outputRate;
  const cacheCreateCost = ((input.usage.cacheCreationInputTokens ?? 0) / 1000) * cacheCreateRate;
  const cacheReadCost = ((input.usage.cacheReadInputTokens ?? 0) / 1000) * cacheReadRate;

  return roundCurrency(inputCost + outputCost + cacheCreateCost + cacheReadCost);
}

export function createUsageLedgerEntry(input: {
  userId: string;
  provider: UsageLedgerProvider;
  model: string;
  featureKind: UsageLedgerFeatureKind;
  usage: UsageSnapshot;
  sessionId?: string;
  messageId?: string;
  runId?: string;
  createdAt?: string;
}): UsageLedgerRecord {
  return {
    id: createId("usage"),
    userId: input.userId,
    provider: input.provider,
    model: input.model,
    featureKind: input.featureKind,
    sessionId: input.sessionId,
    messageId: input.messageId,
    runId: input.runId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheCreationInputTokens: input.usage.cacheCreationInputTokens,
    cacheReadInputTokens: input.usage.cacheReadInputTokens,
    estimatedCostCny: estimateUsageCostCny({
      provider: input.provider,
      usage: input.usage
    })
  };
}

export async function logUsageLedgerEntries(entries: UsageLedgerRecord[]) {
  const meaningfulEntries = entries.filter(
    (entry) =>
      entry.inputTokens > 0 ||
      entry.outputTokens > 0 ||
      (entry.cacheCreationInputTokens ?? 0) > 0 ||
      (entry.cacheReadInputTokens ?? 0) > 0
  );

  if (meaningfulEntries.length === 0) {
    return;
  }

  await writeDb((draft) => {
    draft.usageLedger.push(...meaningfulEntries);
  });
}

export function buildPendingPlusOrder(input: {
  userId: string;
  description?: string;
  createdAt?: string;
}): BillingOrderRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    id: createId("order"),
    userId: input.userId,
    provider: "wechat",
    plan: "plus",
    status: "pending",
    amountCny: getPlusPriceCny(),
    currency: "CNY",
    description: input.description ?? `MindFlow Therapist Plus（月付）`,
    createdAt,
    updatedAt: createdAt
  };
}

export function toPublicUserBillingState(user: UserRecord) {
  const summary = ensureUserBillingState(user);

  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    plan: summary.plan,
    quota: summary.quota,
    billing: summary.billing,
    preferences: user.preferences
  };
}
