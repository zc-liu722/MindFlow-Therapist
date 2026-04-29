import { createDecipheriv, createSign, createVerify, randomBytes } from "node:crypto";

const DEFAULT_WECHAT_PAY_BASE_URL = "https://api.mch.weixin.qq.com";

type WechatPayConfig = {
  appId: string;
  mchId: string;
  serialNo: string;
  privateKey: string;
  apiV3Key: string;
  notifyUrl: string;
  platformPublicKey?: string;
  baseUrl: string;
  skipNotifyVerify: boolean;
};

type WechatNativeOrderResponse = {
  code_url?: string;
  prepay_id?: string;
  h5_url?: string;
};

type WechatPayNotifyResource = {
  algorithm?: string;
  ciphertext?: string;
  associated_data?: string;
  nonce?: string;
  original_type?: string;
};

type WechatPayNotifyEnvelope = {
  id?: string;
  event_type?: string;
  resource_type?: string;
  create_time?: string;
  resource?: WechatPayNotifyResource;
};

type WechatPayNotifyTransaction = {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  success_time?: string;
  amount?: {
    total?: number;
  };
};

export class WechatPayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatPayConfigError";
  }
}

export class WechatPayRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WechatPayRequestError";
    this.status = status;
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new WechatPayConfigError(`缺少 ${name} 环境变量`);
  }

  return value;
}

function getWechatPayConfig(): WechatPayConfig {
  return {
    appId: requireEnv("WECHAT_PAY_APP_ID"),
    mchId: requireEnv("WECHAT_PAY_MCH_ID"),
    serialNo: requireEnv("WECHAT_PAY_SERIAL_NO"),
    privateKey: requireEnv("WECHAT_PAY_PRIVATE_KEY"),
    apiV3Key: requireEnv("WECHAT_PAY_API_V3_KEY"),
    notifyUrl: requireEnv("WECHAT_PAY_NOTIFY_URL"),
    platformPublicKey: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY?.trim(),
    baseUrl: (process.env.WECHAT_PAY_BASE_URL?.trim() || DEFAULT_WECHAT_PAY_BASE_URL).replace(/\/+$/, ""),
    skipNotifyVerify: process.env.WECHAT_PAY_SKIP_NOTIFY_VERIFY === "true"
  };
}

function createNonce() {
  return randomBytes(16).toString("hex");
}

function buildSignMessage(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
}) {
  return `${input.method}\n${input.path}\n${input.timestamp}\n${input.nonce}\n${input.body}\n`;
}

function signRequest(config: WechatPayConfig, input: { method: string; path: string; body: string }) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = createNonce();
  const message = buildSignMessage({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body
  });
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(config.privateKey, "base64");

  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`;
}

function decryptNotifyCiphertext(config: WechatPayConfig, resource: WechatPayNotifyResource) {
  if (!resource.ciphertext || !resource.nonce) {
    throw new WechatPayRequestError("微信支付回调缺少加密资源", 400);
  }

  const ciphertextBuffer = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - 16);
  const encrypted = ciphertextBuffer.subarray(0, ciphertextBuffer.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(config.apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8")
  );

  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plaintext.toString("utf8");
}

function verifyNotifySignature(config: WechatPayConfig, rawBody: string, headers: Headers) {
  if (config.skipNotifyVerify) {
    return;
  }
  if (!config.platformPublicKey) {
    throw new WechatPayConfigError("缺少 WECHAT_PAY_PLATFORM_PUBLIC_KEY 环境变量");
  }

  const timestamp = headers.get("wechatpay-timestamp");
  const nonce = headers.get("wechatpay-nonce");
  const signature = headers.get("wechatpay-signature");

  if (!timestamp || !nonce || !signature) {
    throw new WechatPayRequestError("微信支付回调缺少签名头", 400);
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
  verifier.end();

  if (!verifier.verify(config.platformPublicKey, signature, "base64")) {
    throw new WechatPayRequestError("微信支付回调签名校验失败", 401);
  }
}

export async function createWechatNativePlusOrder(input: {
  outTradeNo: string;
  description: string;
  amountCny: number;
}) {
  const config = getWechatPayConfig();
  const path = "/v3/pay/transactions/native";
  const body = JSON.stringify({
    appid: config.appId,
    mchid: config.mchId,
    description: input.description,
    out_trade_no: input.outTradeNo,
    notify_url: config.notifyUrl,
    amount: {
      total: Math.round(input.amountCny * 100),
      currency: "CNY"
    }
  });

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: signRequest(config, {
        method: "POST",
        path,
        body
      })
    },
    body
  });
  const payload = (await response.json().catch(() => ({}))) as WechatNativeOrderResponse & {
    message?: string;
  };

  if (!response.ok) {
    throw new WechatPayRequestError(
      payload.message?.trim() || `微信支付下单失败 (${response.status})`,
      response.status
    );
  }

  return {
    providerOrderId: input.outTradeNo,
    checkoutUrl: payload.h5_url,
    checkoutCodeUrl: payload.code_url
  };
}

export function parseWechatPaymentNotification(rawBody: string, headers: Headers) {
  const config = getWechatPayConfig();
  verifyNotifySignature(config, rawBody, headers);

  let envelope: WechatPayNotifyEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WechatPayNotifyEnvelope;
  } catch {
    throw new WechatPayRequestError("微信支付回调 JSON 非法", 400);
  }

  const decrypted = decryptNotifyCiphertext(config, envelope.resource ?? {});
  let transaction: WechatPayNotifyTransaction;
  try {
    transaction = JSON.parse(decrypted) as WechatPayNotifyTransaction;
  } catch {
    throw new WechatPayRequestError("微信支付回调资源解析失败", 400);
  }

  if (!transaction.out_trade_no) {
    throw new WechatPayRequestError("微信支付回调缺少商户订单号", 400);
  }

  return {
    eventId: envelope.id,
    eventType: envelope.event_type,
    outTradeNo: transaction.out_trade_no,
    transactionId: transaction.transaction_id,
    tradeState: transaction.trade_state,
    paidAt: transaction.success_time,
    amountCny:
      typeof transaction.amount?.total === "number" ? Number((transaction.amount.total / 100).toFixed(2)) : 0,
    preview: rawBody.slice(0, 500)
  };
}
