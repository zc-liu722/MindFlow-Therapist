import type { ApiErrorPayload, ApiOkPayload, KeyedPayload } from "@/lib/api-types";

export type ErrorMessageMap = Record<string, string>;

export function parseJsonString<T>(raw: string): T | null {
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  return parseJsonString<T>(raw);
}

export async function readKeyedResponse<Key extends string, Value>(
  response: Response,
  key: Key
): Promise<Value | null> {
  const payload = await readJsonResponse<Partial<KeyedPayload<Key, Value>>>(response);
  return payload?.[key] ?? null;
}

export async function readOkResult<ResponseResult>(
  response: Response
): Promise<ResponseResult | null> {
  const payload = await readJsonResponse<ApiOkPayload<ResponseResult>>(response);
  if (!payload || !("ok" in payload) || payload.ok !== true || !("result" in payload)) {
    return null;
  }

  return payload.result;
}

export function resolveErrorMessage(
  error: string | undefined,
  fallback: string,
  overrides?: ErrorMessageMap
) {
  if (error && overrides?.[error]) {
    return overrides[error];
  }

  return error ?? fallback;
}

export function resolveApiErrorMessage(
  payload: ApiErrorPayload | null | undefined,
  fallback: string,
  overrides?: ErrorMessageMap
) {
  return resolveErrorMessage(payload?.error, fallback, overrides);
}
