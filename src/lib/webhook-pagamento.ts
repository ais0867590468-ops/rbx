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
    request.headers.get("X-Webhook-Signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("signature") ||
    request.headers.get("x-vulcano-signature");
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
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const event = String(payload.event ?? "");
  const status = String(payload.status ?? "").toLowerCase();
  const paymentIdentifier =
    payload.external_id ||
    payload.paymentId ||
    payload.orderCode ||
    payload.id ||
    payload.data?.id ||
    payload.data?.external_id;

  if (!paymentIdentifier) return Response.json({ ok: true });

  const isPaid =
    status === "paid" ||
    status === "approved" ||
    status === "completed" ||
    event.includes("paid") ||
    event.includes("approved") ||
    event === "charge.paid";

  if (!isPaid && event) {
    return Response.json({ ok: true });
  }

  const order = await getOrderByPayment(String(paymentIdentifier));
  if (order) {
    const sql = await getSql();
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('webhook', ${ip}, ${userAgent}, '/api/webhook/pagamento',
        ${JSON.stringify({ orderId: order.id, event, status })})
    `;
    const payerName =
      typeof payload.payer === "string"
        ? payload.payer
        : payload.payer?.name || payload.customer?.name || null;
    const payerCpf =
      typeof payload.cpf === "string"
        ? payload.cpf
        : payload.payer?.document || payload.customer?.document || null;
    const payerBank = payload.bank || payload.pix?.bank || null;
    const endToEndId = payload.endToEndId || payload.end_to_end_id || payload.pix?.end_to_end_id || null;

    await markOrderPaid(order, {
      payer_name: payerName,
      payer_cpf: payerCpf,
      payer_bank: payerBank,
      end_to_end_id: endToEndId,
    });
  }
  return Response.json({ ok: true });
}
