import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { AnthropicConfigError, AnthropicRequestError } from "@/lib/anthropic";
import { appendMessageStream } from "@/lib/domain";
import { assertRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    assertRateLimit({
      key: `session-message:${getClientIp(request)}`,
      limit: 30,
      windowMs: 60_000
    });
    const user = await requireRole("user");
    const { sessionId } = await context.params;
    const body = (await request.json()) as { content?: string };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "请输入内容" }, { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await appendMessageStream(user, sessionId, body.content!, {
            onThinkingDelta(payload) {
              controller.enqueue(encoder.encode(toSseEvent("thinking", payload)));
            },
            onTextDelta(payload) {
              controller.enqueue(encoder.encode(toSseEvent("reply", payload)));
            }
          });

          controller.enqueue(encoder.encode(toSseEvent("done", result)));
        } catch (error) {
          const message = error instanceof Error ? error.message : "发送失败";
          controller.enqueue(encoder.encode(toSseEvent("error", { error: message })));
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
          : error instanceof AnthropicConfigError
            ? 503
            : error instanceof AnthropicRequestError
              ? error.status
              : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
