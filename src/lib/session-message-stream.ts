import type { ApiErrorPayload } from "@/lib/api-types";
import { parseJsonString } from "@/lib/client-response";
import type { AppChatMessage as ChatMessage } from "@/lib/app-dashboard-types";

type RawSseEvent = {
  type: string;
  payload: unknown;
};

export type SessionMessageStreamEvent =
  | { type: "thinking"; payload: { summary?: string } }
  | { type: "reply"; payload: { content?: string } }
  | {
      type: "done";
      payload: {
        userMessage?: ChatMessage;
        assistantMessage?: ChatMessage;
      };
    }
  | { type: "error"; payload: ApiErrorPayload };

export function parseSessionMessageStreamChunk(chunk: string): SessionMessageStreamEvent[] {
  const parsedEvents: SessionMessageStreamEvent[] = [];

  for (const event of parseRawSseEvents(chunk)) {
    if (event.type === "thinking") {
      parsedEvents.push({ type: "thinking", payload: asObject(event.payload) });
      continue;
    }

    if (event.type === "reply") {
      parsedEvents.push({ type: "reply", payload: asObject(event.payload) });
      continue;
    }

    if (event.type === "done") {
      parsedEvents.push({ type: "done", payload: asObject(event.payload) });
      continue;
    }

    if (event.type === "error") {
      parsedEvents.push({ type: "error", payload: asObject(event.payload) });
    }
  }

  return parsedEvents;
}

function parseRawSseEvents(chunk: string): RawSseEvent[] {
  const events = chunk
    .split("\n\n")
    .map((part) => part.trim())
    .filter(Boolean);

  return events.flatMap((event) => {
    const lines = event.split("\n");
    const type = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!type || !data) {
      return [];
    }

    const payload = parseJsonString<unknown>(data);
    if (!payload) {
      return [];
    }

    return [{ type, payload }];
  });
}

function asObject<T extends object>(value: unknown) {
  if (value && typeof value === "object") {
    return value as T;
  }

  return {} as T;
}
