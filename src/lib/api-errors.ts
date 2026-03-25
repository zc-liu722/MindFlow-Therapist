import { NextResponse } from "next/server";

type ErrorStatusContext = {
  error: unknown;
  message: string;
};

type ErrorStatusMatcher =
  | string
  | string[]
  | ((context: ErrorStatusContext) => boolean);

export type ErrorStatusRule = {
  match: ErrorStatusMatcher;
  status: number;
};

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function isGuardrailMessage(message: string) {
  return (
    message.includes("检测到") ||
    message.includes("账号已") ||
    message.includes("不予回复") ||
    message.includes("封禁")
  );
}

function matchesRule(context: ErrorStatusContext, matcher: ErrorStatusMatcher) {
  if (typeof matcher === "function") {
    return matcher(context);
  }

  if (Array.isArray(matcher)) {
    return matcher.includes(context.message);
  }

  return context.message === matcher;
}

export function resolveErrorStatus(
  error: unknown,
  fallback: string,
  rules: ErrorStatusRule[],
  defaultStatus: number
) {
  const context: ErrorStatusContext = {
    error,
    message: getErrorMessage(error, fallback)
  };

  const matchedRule = rules.find((rule) => matchesRule(context, rule.match));
  return {
    message: context.message,
    status: matchedRule?.status ?? defaultStatus
  };
}

export function errorResponse(
  error: unknown,
  fallback: string,
  rules: ErrorStatusRule[],
  defaultStatus: number
) {
  const { message, status } = resolveErrorStatus(error, fallback, rules, defaultStatus);
  return NextResponse.json({ error: message }, { status });
}
