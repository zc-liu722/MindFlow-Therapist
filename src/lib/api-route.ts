import { NextResponse } from "next/server";

import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

type LimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export async function parseJsonBody<T>(request: Request) {
  return (await request.json()) as T;
}

export function requireTrimmedString(
  value: string | undefined | null,
  errorMessage: string
) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  return trimmed;
}

export function applyRateLimit(input: LimitInput) {
  assertRateLimit(input);
}

export function applyUserRateLimit(
  namespace: string,
  userId: string,
  limit: number,
  windowMs: number,
  suffix?: string
) {
  applyRateLimit({
    key: [namespace, "user", userId, suffix].filter(Boolean).join(":"),
    limit,
    windowMs
  });
}

export function applyOptionalIpRateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowMs: number
) {
  const clientIp = getClientIp(request);
  if (!clientIp) {
    return null;
  }

  applyRateLimit({
    key: `${namespace}:ip:${clientIp}`,
    limit,
    windowMs
  });

  return clientIp;
}
