import { grantPlusPlan } from "@/lib/billing";
import { readDb, writeDb } from "@/lib/db";
import { parseWechatPaymentNotification, WechatPayConfigError, WechatPayRequestError } from "@/lib/wechat-pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notifyResponse(code: "SUCCESS" | "FAIL", message: string) {
  return Response.json({ code, message });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    const payment = parseWechatPaymentNotification(rawBody, request.headers);
    const db = await readDb();
    const order = db.billingOrders.find((item) => item.id === payment.outTradeNo);

    if (!order) {
      return notifyResponse("FAIL", "order not found");
    }

    if (payment.tradeState !== "SUCCESS") {
      await writeDb((draft) => {
        const mutableOrder = draft.billingOrders.find((item) => item.id === payment.outTradeNo);
        if (!mutableOrder) {
          return;
        }

        mutableOrder.status = "failed";
        mutableOrder.updatedAt = new Date().toISOString();
        mutableOrder.notifyEventId = payment.eventId;
        mutableOrder.notifyPreview = payment.preview;
      });
      return notifyResponse("SUCCESS", "ignored non-success trade state");
    }

    await writeDb((draft) => {
      const mutableOrder = draft.billingOrders.find((item) => item.id === payment.outTradeNo);
      const user = mutableOrder ? draft.users.find((item) => item.id === mutableOrder.userId) : undefined;
      if (!mutableOrder || !user) {
        return;
      }

      if (mutableOrder.status === "paid") {
        return;
      }

      mutableOrder.status = "paid";
      mutableOrder.updatedAt = new Date().toISOString();
      mutableOrder.paidAt = payment.paidAt ?? new Date().toISOString();
      mutableOrder.providerTransactionId = payment.transactionId;
      mutableOrder.notifyEventId = payment.eventId;
      mutableOrder.notifyPreview = payment.preview;

      grantPlusPlan({
        user,
        paidAt: mutableOrder.paidAt
      });
    });

    return notifyResponse("SUCCESS", "success");
  } catch (error) {
    if (error instanceof WechatPayConfigError || error instanceof WechatPayRequestError) {
      return notifyResponse("FAIL", error.message);
    }

    return notifyResponse("FAIL", "internal error");
  }
}
