import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { API_DYNAMIC, API_RUNTIME } from "@/lib/api-config";
import {
  errorResponse,
  getErrorMessage,
  isGuardrailMessage
} from "@/lib/api-errors";
import type { SessionMessageRequestBody, SessionRouteContext } from "@/lib/api-types";
import {
  applyUserRateLimit,
  parseJsonBody,
  requireTrimmedString
} from "@/lib/api-route";
import { AnthropicConfigError, AnthropicRequestError } from "@/lib/anthropic";
import { appendMessageStream, getSessionForUser } from "@/lib/domain";
import { enforceInputGuardrail } from "@/lib/guardrails";
import { MoonshotConfigError, MoonshotRequestError } from "@/lib/moonshot";

export const runtime = API_RUNTIME;
export const dynamic = API_DYNAMIC;

function toSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function toClientSafeErrorMessage(error: unknown) {
  if (error instanceof AnthropicConfigError) {
    return "AI 服务暂时不可用，请稍后再试。";
  }

  if (error instanceof AnthropicRequestError) {
    return "AI 回复暂时失败，请稍后再试。";
  }

  if (error instanceof MoonshotConfigError || error instanceof MoonshotRequestError) {
    return "思考转译暂时不可用，请稍后再试。";
  }

  const message = getErrorMessage(error, "发送失败");
  if (
    message === "NOT_FOUND" ||
    message === "SESSION_CLOSED" ||
    message === "RATE_LIMITED" ||
    message === "UNAUTHORIZED" ||
    message === "FORBIDDEN" ||
    isGuardrailMessage(message)
  ) {
    return message;
  }

  return "消息发送失败，请稍后再试。";
}

export async function POST(
  request: Request,
  context: SessionRouteContext
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    applyUserRateLimit("session-message", user.id, 30, 60_000, sessionId);
    const body = await parseJsonBody<SessionMessageRequestBody>(request);

    const content = requireTrimmedString(body.content, "请输入内容");
    if (content instanceof NextResponse) {
      return content;
    }

    const session = await getSessionForUser(user.id, sessionId);

    await enforceInputGuardrail({
      user,
      sessionId,
      content,
      sessionTitle: session.title,
      messages: session.messages
    });
    const pageLanguage = request.headers.get("x-page-language");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await appendMessageStream(user, sessionId, content, pageLanguage, {
            onThinkingSummary(payload) {
              controller.enqueue(encoder.encode(toSseEvent("thinking", payload)));
            },
            onTextDelta(payload) {
              controller.enqueue(encoder.encode(toSseEvent("reply", payload)));
            }
          });

          controller.enqueue(encoder.encode(toSseEvent("done", result)));
        } catch (error) {
          controller.enqueue(
            encoder.encode(toSseEvent("error", { error: toClientSafeErrorMessage(error) }))
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return errorResponse(
      error,
      "发送失败",
      [
        { match: "UNAUTHORIZED", status: 401 },
        { match: "FORBIDDEN", status: 403 },
        { match: "NOT_FOUND", status: 404 },
        { match: "SESSION_CLOSED", status: 409 },
        { match: "RATE_LIMITED", status: 429 },
        { match: ({ message }) => isGuardrailMessage(message), status: 403 },
        { match: ({ error: current }) => current instanceof AnthropicConfigError, status: 503 },
        {
          match: ({ error: current }) => current instanceof AnthropicRequestError,
          status: error instanceof AnthropicRequestError ? error.status : 400
        },
        { match: ({ error: current }) => current instanceof MoonshotConfigError, status: 503 },
        {
          match: ({ error: current }) => current instanceof MoonshotRequestError,
          status: error instanceof MoonshotRequestError ? error.status : 400
        }
      ],
      400
    );
  }
}
