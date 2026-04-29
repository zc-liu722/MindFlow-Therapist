import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-route";
import { jsonWithKey } from "@/lib/api-response";
import { buildPendingPlusOrder } from "@/lib/billing";
import type {
  BillingCheckoutRequestBody,
  BillingCheckoutResponse
} from "@/lib/api-types";
import { readDb, writeDb } from "@/lib/db";
import { createWechatNativePlusOrder, WechatPayConfigError, WechatPayRequestError } from "@/lib/wechat-pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireRole("user");
    const body = await parseJsonBody<BillingCheckoutRequestBody>(request);
    const plan = body.plan ?? "plus";

    if (plan !== "plus") {
      return NextResponse.json({ error: "当前仅支持开通 Plus 套餐" }, { status: 400 });
    }

    const order = buildPendingPlusOrder({
      userId: user.id
    });
    const payment = await createWechatNativePlusOrder({
      outTradeNo: order.id,
      description: order.description,
      amountCny: order.amountCny
    });

    order.providerOrderId = payment.providerOrderId;
    order.checkoutUrl = payment.checkoutUrl;
    order.checkoutCodeUrl = payment.checkoutCodeUrl;

    await writeDb((draft) => {
      draft.billingOrders.push(order);
    });

    const payload: BillingCheckoutResponse = {
      orderId: order.id,
      status: order.status,
      provider: order.provider,
      plan: order.plan,
      amountCny: order.amountCny,
      checkoutUrl: order.checkoutUrl,
      checkoutCodeUrl: order.checkoutCodeUrl
    };

    return jsonWithKey("order", payload);
  } catch (error) {
    return errorResponse(
      error,
      "创建支付订单失败",
      [
        { match: "UNAUTHORIZED", status: 401 },
        { match: "FORBIDDEN", status: 403 },
        { match: ({ error: current }) => current instanceof WechatPayConfigError, status: 503 },
        {
          match: ({ error: current }) => current instanceof WechatPayRequestError,
          status: error instanceof WechatPayRequestError ? error.status : 400
        }
      ],
      400
    );
  }
}
