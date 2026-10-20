import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import { getOrder, type OrderRow } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { parseTracking } from "@/lib/tracking";

/**
 * Server-side integration with UTMify (https://utmify.com.br): every order is
 * reported through their Orders API with the attribution captured in the
 * browser, so campaigns show real sales and ROI.
 */

const ENDPOINT = "https://api.utmify.com.br/api-credentials/orders";

export type UtmifyStatus = "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback";

export type UtmifyConfig = {
  enabled: boolean;
  pixelId: string;
  token: string;
  platform: string;
  sendWaiting: boolean;
  feePercent: number;
};

export async function getUtmifyConfig(): Promise<UtmifyConfig> {
  const s = await getSettings();
  const fee = Number(String(s.utmify_fee_percent).replace(",", "."));
  return {
    enabled: s.utmify_enabled !== "false",
    pixelId: s.utmify_pixel_id.trim(),
    token: s.utmify_api_token.trim(),
    platform: s.utmify_platform.trim() || "RecargasBuxs",
    sendWaiting: s.utmify_send_waiting !== "false",
    feePercent: Number.isFinite(fee) ? Math.min(100, Math.max(0, fee)) : 0,
  };
}

/** UTMify wants UTC as `YYYY-MM-DD HH:MM:SS`. */
function utc(value: string | Date | null | undefined) {
  const d = value ? new Date(value) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return safe.toISOString().slice(0, 19).replace("T", " ");
}

type PayloadOrder = Pick<
  OrderRow,
  | "id"
  | "product_id"
  | "product_name"
  | "price_cents"
  | "customer_name"
  | "customer_email"
  | "payment_method"
  | "ip"
  | "created_at"
  | "paid_at"
> & { tracking?: string | null };

export function buildUtmifyPayload(order: PayloadOrder, status: UtmifyStatus, cfg: UtmifyConfig, isTest = false) {
  const t = parseTracking(order.tracking);
  const fee = Math.round((order.price_cents * cfg.feePercent) / 100);
  const closed = status === "refunded" || status === "chargedback";
  return {
    orderId: order.id,
    platform: cfg.platform,
    paymentMethod: order.payment_method === "card" ? "credit_card" : "pix",
    status,
    createdAt: utc(order.created_at),
    approvedDate: status === "paid" || closed ? utc(order.paid_at ?? new Date()) : null,
    refundedAt: closed ? utc(new Date()) : null,
    customer: {
      name: order.customer_name || "Cliente",
      email: order.customer_email,
      phone: null,
      document: null,
      country: "BR",
      ...(order.ip ? { ip: order.ip } : {}),
    },
    products: [
      {
        id: String(order.product_id ?? order.product_name),
        name: order.product_name,
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: order.price_cents,
      },
    ],
    trackingParameters: {
      src: t.src ?? null,
      sck: t.sck ?? null,
      utm_source: t.utm_source ?? null,
      utm_campaign: t.utm_campaign ?? null,
      utm_medium: t.utm_medium ?? null,
      utm_content: t.utm_content ?? null,
      utm_term: t.utm_term ?? null,
    },
    commission: {
      totalPriceInCents: order.price_cents,
      gatewayFeeInCents: fee,
      userCommissionInCents: order.price_cents - fee,
      currency: "BRL",
    },
    isTest,
  };
}

export type SendResult = { ok: boolean; skipped?: string; httpStatus?: number; error?: string };

async function post(token: string, payload: unknown, timeoutMs: number): Promise<SendResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { ok: true, httpStatus: res.status };
    const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 280);
    return { ok: false, httpStatus: res.status, error: body || `HTTP ${res.status}` };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return { ok: false, error: name === "TimeoutError" ? "Tempo esgotado ao falar com a UTMify." : "Falha de rede ao falar com a UTMify." };
  }
}

async function record(orderId: string, status: string, result: SendResult, isTest: boolean) {
  try {
    const sql = await getSql();
    await sql`
      insert into utmify_events (order_id, status, ok, http_status, error, is_test)
      values (${orderId}, ${status}, ${result.ok}, ${result.httpStatus ?? null}, ${result.error ?? null}, ${isTest})
    `;
  } catch (err) {
    console.error("utmify event log failed", err);
  }
}

/** Sends one order event. Never throws. */
export async function sendOrderToUtmify(
  orderId: string,
  status: UtmifyStatus,
  opts: { force?: boolean; timeoutMs?: number } = {},
): Promise<SendResult> {
  try {
    const cfg = await getUtmifyConfig();
    if (!cfg.enabled) return { ok: false, skipped: "Integração desativada." };
    if (!cfg.token) return { ok: false, skipped: "Token da API não configurado." };
    const sql = await getSql();
    if (!opts.force) {
      const done = await sql<{ id: number }>`
        select id from utmify_events
        where order_id = ${orderId} and status = ${status} and ok = true and is_test = false limit 1
      `;
      if (done.length > 0) return { ok: true, skipped: "Já enviado." };
    }
    const order = await getOrder(orderId);
    if (!order) return { ok: false, error: "Pedido não encontrado." };
    const payload = buildUtmifyPayload(order as PayloadOrder, status, cfg);
    const result = await post(cfg.token, payload, opts.timeoutMs ?? 8000);
    await record(orderId, status, result, false);
    if (!result.ok) {
      await logDiscord("errors", {
        title: "Falha ao enviar pedido para a UTMify",
        description: result.error ?? "erro desconhecido",
        fields: [
          { name: "Pedido", value: orderId, inline: true },
          { name: "Status", value: status, inline: true },
        ],
      });
    }
    return result;
  } catch (err) {
    console.error("utmify send failed", err);
    return { ok: false, error: "Erro interno ao enviar para a UTMify." };
  }
}

/** Fire the hooks without ever breaking checkout / payment confirmation. */
export async function trackOrderEvent(orderId: string, status: UtmifyStatus, timeoutMs = 8000) {
  await sendOrderToUtmify(orderId, status, { timeoutMs });
}

/** Sends a synthetic paid order flagged `isTest` (UTMify validates it but does not save it). */
export async function sendUtmifyTest(): Promise<SendResult & { orderId: string }> {
  const cfg = await getUtmifyConfig();
  const orderId = `TESTE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  if (!cfg.token) return { ok: false, skipped: "Token da API não configurado.", orderId };
  const now = new Date();
  const payload = buildUtmifyPayload(
    {
      id: orderId,
      product_id: 0,
      product_name: "Pedido de teste",
      price_cents: 1990,
      customer_name: "Teste RecargasBuxs",
      customer_email: "teste@recargasbuxs.com",
      payment_method: "pix",
      ip: null,
      created_at: now.toISOString(),
      paid_at: now.toISOString(),
      tracking: JSON.stringify({ utm_source: "teste", utm_medium: "painel", utm_campaign: "teste-integracao" }),
    },
    "paid",
    cfg,
    true,
  );
  const result = await post(cfg.token, payload, 10000);
  await record(orderId, "paid", result, true);
  return { ...result, orderId };
}

/** Re-sends failed events and paid orders that never reached UTMify (last 30 days). */
export async function syncUtmifyPending(limit = 40) {
  const sql = await getSql();
  const failed = await sql<{ order_id: string; status: string }>`
    select distinct f.order_id, f.status from utmify_events f
    where f.ok = false and f.is_test = false and f.created_at > now() - interval '30 days'
      and not exists (
        select 1 from utmify_events g
        where g.order_id = f.order_id and g.status = f.status and g.ok = true and g.is_test = false
      )
    limit ${limit}
  `;
  const unsent = await sql<{ id: string }>`
    select o.id from orders o
    where o.status in ('paid', 'delivered') and o.created_at > now() - interval '30 days'
      and not exists (
        select 1 from utmify_events e
        where e.order_id = o.id and e.status = 'paid' and e.ok = true and e.is_test = false
      )
    order by o.created_at desc limit ${limit}
  `;
  const jobs = new Map<string, UtmifyStatus>();
  for (const f of failed) jobs.set(`${f.order_id}:${f.status}`, f.status as UtmifyStatus);
  for (const o of unsent) jobs.set(`${o.id}:paid`, "paid");
  let ok = 0;
  let failedCount = 0;
  for (const [key, status] of [...jobs.entries()].slice(0, limit)) {
    const orderId = key.slice(0, key.lastIndexOf(":"));
    const res = await sendOrderToUtmify(orderId, status, { force: true, timeoutMs: 8000 });
    if (res.ok) ok += 1;
    else failedCount += 1;
  }
  return { total: jobs.size, ok, failed: failedCount };
}
