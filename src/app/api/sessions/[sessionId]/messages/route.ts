import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { AnthropicConfigError, AnthropicRequestError } from "@/lib/anthropic";
import { appendMessageStream, getSessionForUser } from "@/lib/domain";
import { enforceInputGuardrail } from "@/lib/guardrails";
import { MoonshotConfigError, MoonshotRequestError } from "@/lib/moonshot";
import { assertRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function isGuardrailMessage(message: string) {
  return (
    message.includes("检测到") ||
    message.includes("账号已") ||
    message.includes("不予回复") ||
    message.includes("封禁")
  );
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

  const message = error instanceof Error ? error.message : "发送失败";
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
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    assertRateLimit({
      key: `session-message:user:${user.id}:${sessionId}`,
      limit: 30,
      windowMs: 60_000
    });
    const body = (await request.json()) as { content?: string };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "请输入内容" }, { status: 400 });
    }

    const session = await getSessionForUser(user.id, sessionId);

    await enforceInputGuardrail({
      user,
      sessionId,
      content: body.content,
      sessionTitle: session.title,
      messages: session.messages
    });
    const pageLanguage = request.headers.get("x-page-language");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await appendMessageStream(user, sessionId, body.content!, pageLanguage, {
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
    const message = error instanceof Error ? error.message : "发送失败";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "FORBIDDEN"
          ? 403
          : message === "NOT_FOUND"
        ? 404
        : message === "SESSION_CLOSED"
          ? 409
          : message === "RATE_LIMITED"
            ? 429
          : isGuardrailMessage(message)
            ? 403
          : error instanceof AnthropicConfigError
            ? 503
          : error instanceof AnthropicRequestError
            ? error.status
            : error instanceof MoonshotConfigError
              ? 503
              : error instanceof MoonshotRequestError
              ? error.status
              : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
