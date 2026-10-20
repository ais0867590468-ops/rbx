import { getOrderByPayment, markOrderPaid } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/gateway";
import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import { takeRateLimit } from "@/lib/rate-limit";
import { getClientMeta } from "@/lib/request-meta";

const MAX_BODY = 256 * 1024;

export async function handlePaymentWebhook(request: Request) {
  const { ip, userAgent } = getClientMeta();
  const okRate = await takeRateLimit(`webhook:${ip}`, 120, 60 * 1000);
  if (!okRate) return Response.json({ error: "rate limited" }, { status: 429 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return Response.json({ error: "payload too large" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "payload too large" }, { status: 413 });
  const sig =
    request.headers.get("x-webhook-signature") ||
    request.headers.get("X-Webhook-Signature");
  const ok = await verifyWebhookSignature(raw, sig);
  if (!ok) {
    const sql = await getSql();
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('webhook_rejected', ${ip}, ${userAgent}, '/api/webhook/pagamento',
        ${JSON.stringify({ reason: sig ? "bad signature" : "missing signature" })})
    `;
    await logDiscord("errors", {
      title: "Webhook recusado (assinatura inválida)",
      fields: [
        { name: "IP", value: ip || "?", inline: true },
        { name: "Motivo", value: sig ? "assinatura não confere" : "sem assinatura", inline: true },
      ],
    });
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  let payload: {
    event?: string;
    paymentId?: string;
    orderCode?: string;
    status?: string;
    amount?: number;
    amountCents?: number;
    payer?: string;
    cpf?: string;
    bank?: string;
    endToEndId?: string;
  };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const event = payload.event ?? "";
  const paymentIdentifier = payload.paymentId || payload.orderCode;
  if (!paymentIdentifier) return Response.json({ ok: true });
  if (event && !event.includes("paid") && payload.status !== "paid" && payload.status !== "approved") {
    return Response.json({ ok: true });
  }
  const order = await getOrderByPayment(paymentIdentifier);
  if (order) {
    const sql = await getSql();
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('webhook', ${ip}, ${userAgent}, '/api/webhook/pagamento',
        ${JSON.stringify({ orderId: order.id, event, status: payload.status ?? null })})
    `;
    await markOrderPaid(order, {
      payer_name: payload.payer,
      payer_cpf: payload.cpf,
      payer_bank: payload.bank,
      end_to_end_id: payload.endToEndId,
    });
  }
  return Response.json({ ok: true });
}
