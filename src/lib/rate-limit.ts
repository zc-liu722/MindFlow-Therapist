const buckets = new Map<string, number[]>();

function pruneBucket(values: number[], now: number, windowMs: number) {
  return values.filter((value) => now - value < windowMs);
}

export function getClientIp(request: Request) {
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    return null;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return null;
}

export function assertRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const current = pruneBucket(buckets.get(input.key) ?? [], now, input.windowMs);

  if (current.length >= input.limit) {
    buckets.set(input.key, current);
    throw new Error("RATE_LIMITED");
  }

  current.push(now);
  buckets.set(input.key, current);
}
