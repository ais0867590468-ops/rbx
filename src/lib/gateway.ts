import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { getSetting } from "@/lib/settings";

const BASE = "https://api.purincash.com/v1";

export type GatewayPayment = {
  paymentId: string;
  orderCode?: string;
  status: string;
  amountCents: number;
  productName?: string;
  expiresAt?: string;
  pix?: { brCode?: string; qrCodeImage?: string | null };
  card?: { brand?: string; last4?: string };
  checkoutUrl?: string;
};

export type GatewayFailure = "config" | "network" | "server" | "auth" | "client";

/**
 * Error thrown by the gateway client. `reason` separates a real outage
 * (network / 5xx / rejected key) from a normal business refusal ("client",
 * e.g. a declined card), which must never mark the gateway as offline.
 */
export class GatewayError extends Error {
  readonly reason: GatewayFailure;
  readonly status?: number;
  constructor(message: string, reason: GatewayFailure, status?: number) {
    super(message);
    this.name = "GatewayError";
    this.reason = reason;
    this.status = status;
  }
  get isOutage() {
    return this.reason !== "client";
  }
}

export function isGatewayOutage(err: unknown) {
  return err instanceof GatewayError ? err.isOutage : true;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = (await getSetting("purincash_api_key")).trim();
  if (!key) throw new GatewayError("Gateway de pagamento não configurado.", "config");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      signal: AbortSignal.timeout(20_000),
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sem resposta";
    throw new GatewayError(`Gateway sem resposta (${msg}).`, "network");
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!res.ok) {
    const reason: GatewayFailure =
      res.status >= 500 ? "server" : res.status === 401 || res.status === 403 ? "auth" : "client";
    throw new GatewayError(json.error || json.message || "Falha no pagamento.", reason, res.status);
  }
  return json as T;
}

/**
 * Cheap reachability check: asks for a payment id that cannot exist. A 404 (or any
 * 4xx other than 401/403) proves the API is up and the key is accepted.
 */
export async function probeGateway(): Promise<{
  ok: boolean;
  status?: number;
  latencyMs: number;
  detail: string;
}> {
  const started = Date.now();
  const key = (await getSetting("purincash_api_key")).trim();
  if (!key) return { ok: false, latencyMs: 0, detail: "Chave do gateway não configurada." };
  try {
    const res = await fetch(`${BASE}/payments/health-probe-${started}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    const latencyMs = Date.now() - started;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, latencyMs, detail: "Chave de API recusada pelo gateway." };
    }
    if (res.status >= 500) {
      return { ok: false, status: res.status, latencyMs, detail: `Gateway respondeu erro ${res.status}.` };
    }
    return { ok: true, status: res.status, latencyMs, detail: "API respondendo normalmente." };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: `Sem resposta: ${err instanceof Error ? err.message : "erro de rede"}`,
    };
  }
}

async function qrImage(brCode: string) {
  return QRCode.toDataURL(brCode, {
    margin: 1,
    width: 360,
    errorCorrectionLevel: "M",
    color: { dark: "#07111f", light: "#ffffff" },
  });
}

function demoPix(orderId: string, valueCents: number): Promise<GatewayPayment> {
  const brCode = `00020126580014BR.GOV.BCB.PIX0136recargasbuxs-${orderId}520400005303986540${(valueCents / 100).toFixed(2)}5802BR5920RecargasBuxs6009Sao Paulo62070503***6304ABCD`;
  return qrImage(brCode).then((qrCodeImage) => ({
    paymentId: `demo_${orderId}`,
    status: "pending",
    amountCents: valueCents,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    pix: { brCode, qrCodeImage },
  }));
}

export async function createPixPayment(input: {
  valueCents: number;
  description: string;
  callbackUrl?: string;
  customer: { name: string; email: string; externalId: string };
  metadata: string;
}): Promise<GatewayPayment> {
  const key = (await getSetting("purincash_api_key")).trim();
  if (!key) return demoPix(input.customer.externalId, input.valueCents);
  const payment = await api<GatewayPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      valueCents: input.valueCents,
      paymentMethod: "pix",
      description: input.description.slice(0, 200),
      expiresIn: 1800,
      callbackUrl: input.callbackUrl,
      customer: input.customer,
      metadata: input.metadata,
    }),
  });
  if (payment.pix?.brCode && !payment.pix.qrCodeImage) {
    payment.pix.qrCodeImage = await qrImage(payment.pix.brCode);
  }
  return payment;
}

function demoCard(orderId: string, valueCents: number, origin?: string): GatewayPayment {
  return {
    paymentId: `demo_${orderId}`,
    orderCode: `demo_${orderId}`,
    status: "pending",
    amountCents: valueCents,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    checkoutUrl: origin ? `${origin}` : `/checkout/${orderId}?demo_card=1`,
  };
}

export async function createCardPayment(input: {
  valueCents: number;
  description: string;
  callbackUrl?: string;
  customer: { name: string; email: string; externalId: string };
  metadata: string;
  successUrl?: string;
  cancelUrl?: string;
  card?: {
    number?: string;
    holderName?: string;
    expirationMonth?: number;
    expirationYear?: number;
    cvv?: string;
  };
}): Promise<GatewayPayment> {
  const key = (await getSetting("purincash_api_key")).trim();
  if (!key) return demoCard(input.customer.externalId, input.valueCents, input.successUrl);

  if (key.startsWith("ps_test_")) {
    throw new GatewayError(
      "O gateway PurinCash não suporta cartão no ambiente de teste (sandbox). Utilize a sua chave de produção (ps_live_...) no painel administrativo para aceitar cartão de crédito.",
      "client",
      400,
    );
  }

  const payload: Record<string, unknown> = {
    valueCents: Math.max(80, input.valueCents),
    description: input.description.slice(0, 200),
    callbackUrl: input.callbackUrl,
    customer: input.customer,
    metadata: input.metadata,
  };
  if (input.successUrl) payload.successUrl = input.successUrl;
  if (input.cancelUrl) payload.cancelUrl = input.cancelUrl;

  const res = await api<{
    orderCode: string;
    status: string;
    amountCents: number;
    currency?: string;
    checkoutUrl: string;
    expiresAt?: string;
  }>("/card-payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    paymentId: res.orderCode,
    orderCode: res.orderCode,
    status: res.status,
    amountCents: res.amountCents,
    expiresAt: res.expiresAt,
    checkoutUrl: res.checkoutUrl,
  };
}

export async function getCardPayment(orderCode: string): Promise<GatewayPayment> {
  if (orderCode.startsWith("demo_")) {
    return {
      paymentId: orderCode,
      orderCode,
      status: "pending",
      amountCents: 0,
    } satisfies GatewayPayment;
  }
  const res = await api<{
    orderCode: string;
    status: string;
    amount?: number;
    amountCents?: number;
    currency?: string;
    description?: string;
    checkoutUrl?: string | null;
    paidAt?: string;
    createdAt?: string;
  }>(`/card-payments/${encodeURIComponent(orderCode)}`);

  return {
    paymentId: res.orderCode,
    orderCode: res.orderCode,
    status: res.status,
    amountCents: res.amountCents ?? (res.amount ? Math.round(res.amount * 100) : 0),
    checkoutUrl: res.checkoutUrl ?? undefined,
  };
}

export async function getPixPayment(paymentId: string) {
  if (paymentId.startsWith("demo_")) {
    return {
      paymentId,
      status: "pending",
      amountCents: 0,
    } satisfies GatewayPayment;
  }
  return api<GatewayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function verifyWebhookSignature(rawBody: string, header: string | null) {
  const secret = (await getSetting("purincash_webhook_secret")).trim();
  if (!secret || !header) return false;
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const b64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  const cleaned = header.trim();
  return (
    safeEqual(cleaned, hex) ||
    safeEqual(cleaned, b64) ||
    safeEqual(cleaned, `sha256=${hex}`) ||
    safeEqual(cleaned, `sha256=${b64}`)
  );
}
